import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

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
    const { data, error } = await supabase
      .from("orchestration_events")
      .select(
        `
        id,
        repair_job_id,
        event_type,
        action,
        confidence_score,
        pr_number,
        created_at
      `
      )
      .eq("repair_job_id", jobId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(
        `[orchestration-events API] Error fetching events for ${jobId}:`,
        error
      );
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data || []);
  } catch (err) {
    console.error(`[orchestration-events API] Unexpected error:`, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
