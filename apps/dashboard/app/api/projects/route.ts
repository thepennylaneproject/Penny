import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository-instance";
import type { Project } from "@/lib/types";
import { apiErrorMessage } from "@/lib/api-error";

export async function GET() {
  try {
    const repo = getRepository();
    const projects = await repo.list();
    return NextResponse.json(projects);
  } catch (error) {
    console.error("GET /api/projects", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Project;
    if (!body?.name?.trim()) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 }
      );
    }
    const repo = getRepository();
    const project: Project = {
      name: body.name.trim(),
      findings: Array.isArray(body.findings) ? body.findings : [],
      lastUpdated: new Date().toISOString(),
      repositoryUrl: typeof body.repositoryUrl === "string" ? body.repositoryUrl.trim() || undefined : undefined,
      status: body.status ?? "active",
      sourceType: body.sourceType ?? "import",
      sourceRef: body.sourceRef,
      stack: body.stack,
      auditConfig: body.auditConfig,
      repairConfig: body.repairConfig,
      profile: body.profile,
      expectations: body.expectations,
      onboardingState: body.onboardingState,
      decisionHistory: body.decisionHistory,
      profileSummary: body.profileSummary,
      manifest: body.manifest,
      maintenanceBacklog: body.maintenanceBacklog,
      maintenanceTasks: body.maintenanceTasks,
    };
    const created = await repo.create(project);
    return NextResponse.json(created);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("already exists")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("POST /api/projects", error);
    return NextResponse.json({ error: apiErrorMessage(error) }, { status: 500 });
  }
}
