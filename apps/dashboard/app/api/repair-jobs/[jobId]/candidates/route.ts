import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { resolveRepairJobByPublicId } from "@/lib/repair-jobs";

type Params = { params: Promise<{ jobId: string }> };

export async function GET(
  request: NextRequest,
  { params }: Params
) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
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
      .from("repair_candidates")
      .select(
        `
        id,
        repair_job_id,
        depth,
        sequence_number,
        parent_candidate_id,
        patch_diff,
        score,
        validation_results,
        error_log,
        created_at,
        evaluated_at
      `
      )
      .eq("repair_job_id", resolved.id)
      .order("depth", { ascending: true })
      .order("sequence_number", { ascending: true });

    if (error) {
      console.error(
        `[repair-candidates API] Error fetching candidates for ${jobId}:`,
        error
      );
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data || []);
  } catch (err) {
    console.error(`[repair-candidates API] Unexpected error:`, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
