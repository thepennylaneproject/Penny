import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
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
      .eq("repair_job_id", params.jobId)
      .order("depth", { ascending: true })
      .order("sequence_number", { ascending: true });

    if (error) {
      console.error(
        `[repair-candidates API] Error fetching candidates for ${params.jobId}:`,
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
