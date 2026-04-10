import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository-instance";
import type { Project } from "@/lib/types";
import { apiErrorMessage } from "@/lib/api-error";

type Params = { params: Promise<{ name: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { name } = await params;
    const repo = getRepository();
    const project = await repo.getByName(decodeURIComponent(name));
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json(project);
  } catch (error) {
    console.error("GET /api/projects/[name]", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { name } = await params;
    const body = (await request.json()) as Project;
    const repo = getRepository();
    const existing = await repo.getByName(decodeURIComponent(name));
    if (!existing) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const updated: Project = {
      name: existing.name,
      findings: Array.isArray(body.findings) ? body.findings : existing.findings,
      lastUpdated: new Date().toISOString(),
      repositoryUrl: body.repositoryUrl ?? existing.repositoryUrl,
      status: body.status ?? existing.status,
      sourceType: body.sourceType ?? existing.sourceType,
      sourceRef: body.sourceRef ?? existing.sourceRef,
      repoAccess: body.repoAccess ?? existing.repoAccess,
      stack: body.stack ?? existing.stack,
      auditConfig: body.auditConfig ?? existing.auditConfig,
      repairConfig: body.repairConfig ?? existing.repairConfig,
      profile: body.profile ?? existing.profile,
      expectations: body.expectations ?? existing.expectations,
      onboardingState: body.onboardingState ?? existing.onboardingState,
      decisionHistory: body.decisionHistory ?? existing.decisionHistory,
      profileSummary: body.profileSummary ?? existing.profileSummary,
      manifest: body.manifest ?? existing.manifest,
      maintenanceBacklog: body.maintenanceBacklog ?? existing.maintenanceBacklog,
      maintenanceTasks: body.maintenanceTasks ?? existing.maintenanceTasks,
      clusterSummaries: body.clusterSummaries ?? existing.clusterSummaries,
      clusterArtifacts: body.clusterArtifacts ?? existing.clusterArtifacts,
      metaSummary: body.metaSummary ?? existing.metaSummary,
    };
    const project = await repo.update(updated);
    return NextResponse.json(project);
  } catch (error) {
    console.error("PUT /api/projects/[name]", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { name } = await params;
    const repo = getRepository();
    const existing = await repo.getByName(decodeURIComponent(name));
    if (!existing) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    await repo.delete(existing.name);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/projects/[name]", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}
