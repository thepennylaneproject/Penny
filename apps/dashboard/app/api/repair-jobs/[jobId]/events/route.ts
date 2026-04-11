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
      .eq("repair_job_id", resolved.id)
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
