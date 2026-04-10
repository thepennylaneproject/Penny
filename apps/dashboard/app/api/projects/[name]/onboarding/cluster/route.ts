import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository-instance";
import { apiErrorMessage } from "@/lib/api-error";
import type { AuditCluster } from "@/lib/types";

/** Dynamic import keeps fs-heavy collectors out of the static route → next.config NFT trace (f-203ecae0). */
async function loadClusterSnapshot() {
  return import("@/lib/onboarding-cluster-snapshot");
}

type Params = { params: Promise<{ name: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { name } = await params;
    const body = (await request.json()) as { cluster: AuditCluster };
    const cluster = body.cluster;

    if (!cluster) {
      return NextResponse.json({ error: "Missing cluster" }, { status: 400 });
    }

    const repo = getRepository();
    const project = await repo.getByName(decodeURIComponent(name));
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const repoAccess = project.repoAccess?.localPath ?? project.repositoryUrl;
    if (!repoAccess) {
      return NextResponse.json({ error: "No localPath or repositoryUrl configured" }, { status: 400 });
    }
    // Collectors need a checkout on disk. Remote URLs alone are not scanned here.
    // Never fall back to process.cwd() — that would scan the dashboard tree instead of the project (f-1ff003db).
    const isLocal = repoAccess.startsWith("/");
    if (!isLocal) {
      return NextResponse.json(
        {
          error:
            "Cluster snapshot requires a local checkout path (absolute localPath). Remote repositoryUrl without a clone is not supported for this endpoint.",
        },
        { status: 400 }
      );
    }
    const repoPath = repoAccess;

    const {
      collectGitHistory,
      collectDependencyManifest,
      generateModuleManifest,
      generateCssTokenMap,
    } = await loadClusterSnapshot();

    let result: Record<string, unknown> = {};

    switch (cluster) {
      case "investor":
        result = {
          gitHistory: await collectGitHistory(repoPath),
          dependencyManifest: await collectDependencyManifest(repoPath),
        };
        break;
      case "domain":
        result = {
          moduleManifest: await generateModuleManifest(repoPath),
        };
        break;
      case "visual":
        result = {
          cssTokenMap: await generateCssTokenMap(repoPath),
        };
        break;
      default:
        return NextResponse.json({ error: "Standard cluster has no secondary onboarding" }, { status: 400 });
    }

    // In a full implementation, we would save these collected artifacts to the Project model in the DB
    // e.g. project.clusterArtifacts[cluster] = result; await repo.update(project);
    // For now, we return them to the client to prove the pipeline works.
    
    return NextResponse.json({ success: true, cluster, artifacts: result });
  } catch (e) {
    console.error(`POST /api/projects/[name]/onboarding/cluster`, e);
    return NextResponse.json({ error: apiErrorMessage(e) }, { status: 500 });
  }
}
