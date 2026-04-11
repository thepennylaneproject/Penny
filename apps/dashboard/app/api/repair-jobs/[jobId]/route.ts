import { NextRequest, NextResponse } from "next/server";
import { requireTenantSupabaseClient } from "@/lib/supabase-request";
import { resolveRepairJobByPublicId } from "@/lib/repair-jobs";

type Params = { params: Promise<{ jobId: string }> };

export async function GET(
  request: NextRequest,
  { params }: Params
) {
  const gate = await requireTenantSupabaseClient(request);
  if (!gate.ok) return gate.response;
  const supabase = gate.client;
  try {
    const { jobId } = await params;
    const resolved = await resolveRepairJobByPublicId(supabase, jobId);
    if (!resolved) {
      return NextResponse.json(
        { error: "Repair job not found" },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("repair_jobs")
      .select(
        `
        id,
        repair_job_id,
        finding_id,
        project_id,
        status,
        confidence_score,
        confidence_breakdown,
        action,
        progress,
        best_candidate_id,
        best_score,
        pr_id,
        pr_number,
        pr_url,
        error_message,
        created_at,
        started_at,
        completed_at
      `
      )
      .eq("repair_job_id", resolved.repair_job_id)
      .single();

    if (error) {
      console.error(`[repair-jobs API] Error fetching job ${jobId}:`, error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Fetch candidate count for this job
    const { count } = await supabase
      .from("repair_candidates")
      .select("id", { count: "exact", head: true })
      .eq("repair_job_id", resolved.id);

    return NextResponse.json({
      ...data,
      total_candidates_evaluated: count || 0,
    });
  } catch (err) {
    console.error(`[repair-jobs API] Unexpected error:`, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
