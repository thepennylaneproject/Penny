import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository-instance";
import { getLatestManifestForProject } from "@/lib/maintenance-store";
import { apiErrorMessage } from "@/lib/api-error";

type Params = { params: Promise<{ name: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { name } = await params;
    const projectName = decodeURIComponent(name);
    const repo = getRepository();
    const project = await repo.getByName(projectName);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const manifest = (await getLatestManifestForProject(project.name)) ?? project.manifest ?? null;
    return NextResponse.json({
      project_name: project.name,
      manifest,
    });
  } catch (error) {
    console.error("GET /api/projects/[name]/manifest", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}
