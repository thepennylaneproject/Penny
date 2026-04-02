import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository-instance";
import { apiErrorMessage } from "@/lib/api-error";

type Params = { params: Promise<{ name: string }> };

/**
 * GET — download `open_findings`-shaped JSON for CLI / repair-engine parity.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { name } = await params;
    const decoded = decodeURIComponent(name);
    const repo = getRepository();
    const project = await repo.getByName(decoded);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const payload = {
      schema_version: "1",
      open_findings: project.findings ?? [],
    };
    const safeName = project.name.replace(/[^\w.-]+/g, "_").slice(0, 80) || "project";
    const body = `${JSON.stringify(payload, null, 2)}\n`;

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}_open_findings.json"`,
      },
    });
  } catch (e) {
    console.error("GET /api/projects/[name]/export-findings", e);
    return NextResponse.json(
      { error: apiErrorMessage(e) },
      { status: 500 }
    );
  }
}
