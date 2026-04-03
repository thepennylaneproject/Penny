import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { finding_id, project_id, config } = body;

    if (!finding_id || !project_id) {
      return NextResponse.json(
        { error: "missing finding_id or project_id" },
        { status: 400 }
      );
    }

    // Create a new repair job in the repair_jobs table
    const { data, error } = await supabase
      .from("repair_jobs")
      .insert({
        finding_id,
        project_id,
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
