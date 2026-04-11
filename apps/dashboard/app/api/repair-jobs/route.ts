import { NextRequest, NextResponse } from "next/server";
import { requireTenantSupabaseClient } from "@/lib/supabase-request";
import { resolveProjectIdByNameOrId } from "@/lib/repair-jobs";

export async function POST(request: NextRequest) {
  const gate = await requireTenantSupabaseClient(request);
  if (!gate.ok) return gate.response;
  const supabase = gate.client;
  try {
    const body = await request.json();
    const { finding_id, project_id } = body;

    if (!finding_id || !project_id) {
      return NextResponse.json(
        { error: "missing finding_id or project_id" },
        { status: 400 }
      );
    }

    const projectId = await resolveProjectIdByNameOrId(supabase, String(project_id));
    if (!projectId) {
      return NextResponse.json(
        { error: "project not found" },
        { status: 404 }
      );
    }

    const { data: finding, error: findingError } = await supabase
      .from("findings")
      .select("id, project_id")
      .eq("id", finding_id)
      .eq("project_id", projectId)
      .maybeSingle();

    if (findingError) {
      console.error(`[repair-jobs POST] Error validating finding:`, findingError);
      return NextResponse.json({ error: findingError.message }, { status: 400 });
    }

    if (!finding) {
      return NextResponse.json(
        { error: "finding not found for project" },
        { status: 404 }
      );
    }

    const { data: existingJob, error: existingJobError } = await supabase
      .from("repair_jobs")
      .select("id, repair_job_id")
      .eq("finding_id", finding_id)
      .eq("project_id", projectId)
      .in("status", ["queued", "generating", "evaluating"])
      .maybeSingle();

    if (existingJobError) {
      console.error(`[repair-jobs POST] Error checking active jobs:`, existingJobError);
      return NextResponse.json({ error: existingJobError.message }, { status: 400 });
    }

    if (existingJob) {
      return NextResponse.json(
        { error: "repair job already in progress", repair_job_id: existingJob.repair_job_id },
        { status: 409 }
      );
    }

    // Create a new repair job in the repair_jobs table
    const { data, error } = await supabase
      .from("repair_jobs")
      .insert({
        finding_id,
        project_id: projectId,
        status: "queued",
        confidence_score: null,
        confidence_breakdown: null,
        action: null,
        progress: null,
        best_candidate_id: null,
        best_score: null,
        pr_id: null,
        pr_number: null,
        pr_url: null,
        error_message: null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error(`[repair-jobs POST] Error creating repair job:`, error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Enqueue the job for processing (if using Upstash Redis)
    // This would be: await redis.rpush('penny-repair', JSON.stringify(data))

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error(`[repair-jobs POST] Unexpected error:`, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
