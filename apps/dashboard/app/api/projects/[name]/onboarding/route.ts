import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository-instance";
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
    return NextResponse.json({
      status: project.status ?? "active",
      profile: project.profile ?? null,
      expectations: project.expectations ?? null,
      onboardingState: project.onboardingState ?? null,
      decisionHistory: project.decisionHistory ?? [],
    });
  } catch (error) {
    console.error("GET /api/projects/[name]/onboarding", error);
    return NextResponse.json({ error: apiErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { updateOnboardingArtifacts } = await import("@/lib/onboarding-update");
    const { name } = await params;
    const body = (await request.json()) as {
      profileContent?: string;
      expectationsContent?: string;
      approveProfile?: boolean;
      approveExpectations?: boolean;
      activate?: boolean;
      notes?: string;
      actor?: string;
    };
    const repo = getRepository();
    const project = await repo.getByName(decodeURIComponent(name));
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const updated = updateOnboardingArtifacts(project, body);
    const saved = await repo.update(updated);
    return NextResponse.json(saved);
  } catch (error) {
    console.error("PATCH /api/projects/[name]/onboarding", error);
    return NextResponse.json({ error: apiErrorMessage(error) }, { status: 500 });
  }
}
