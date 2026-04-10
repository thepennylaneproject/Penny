import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository-instance";
import { derivePortfolioOrchestration } from "@/lib/orchestration";
import { resolveEngineStatus } from "@/lib/orchestration-jobs";
import { apiErrorMessage } from "@/lib/api-error";
import { getOrSetRuntimeCache } from "@/lib/runtime-cache";

const ORCHESTRATION_CACHE_KEY = "api:orchestration";
const ORCHESTRATION_CACHE_TTL_MS = 10_000;

export async function GET() {
  try {
    const payload = await getOrSetRuntimeCache(
      ORCHESTRATION_CACHE_KEY,
      ORCHESTRATION_CACHE_TTL_MS,
      async () => {
        const repo = getRepository();
        const [projects, engineStatus] = await Promise.all([
          repo.list(),
          resolveEngineStatus(),
        ]);
        return derivePortfolioOrchestration(projects, engineStatus);
      }
    );
    return NextResponse.json(payload);
  } catch (error) {
    console.error("GET /api/orchestration", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}
