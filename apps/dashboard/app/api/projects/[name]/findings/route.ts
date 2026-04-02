import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository-instance";
import type { Finding } from "@/lib/types";
import { apiErrorMessage } from "@/lib/api-error";
import { validateFinding, isDuplicateFindingId } from "@/lib/finding-validation";

type Params = { params: Promise<{ name: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { name } = await params;
    const repo = getRepository();
    const project = await repo.getByName(decodeURIComponent(name));
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json(project.findings ?? []);
  } catch (error) {
    console.error("GET /api/projects/[name]/findings", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { name } = await params;
    const body = (await request.json()) as Finding;
    const repo = getRepository();
    const project = await repo.getByName(decodeURIComponent(name));
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const findings = project.findings ?? [];
    if (!body.finding_id?.trim()) {
      return NextResponse.json(
        { error: "finding_id is required" },
        { status: 400 }
      );
    }
    const errors = validateFinding(body);
    if (errors.length > 0) {
      return NextResponse.json(
        { error: "Validation failed", details: errors },
        { status: 422 }
      );
    }
    if (isDuplicateFindingId(findings, body.finding_id)) {
      return NextResponse.json(
        { error: `finding_id '${body.finding_id}' already exists in this project` },
        { status: 409 }
      );
    }
    const updated = [...findings, body];
    await repo.update({ ...project, findings: updated });
    return NextResponse.json(body);
  } catch (error) {
    console.error("POST /api/projects/[name]/findings", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}
