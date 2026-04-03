import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Params = { params: Promise<{ jobId: string }> };

export async function GET(
  request: NextRequest,
  { params }: Params
) {
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
