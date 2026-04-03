import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    // First get all repair jobs for this project
    const { data: jobs, error: jobsError } = await supabase
      .from("repair_jobs")
      .select("id")
      .eq("project_id", params.projectId);

    if (jobsError) {
      console.error(
        `[repair-costs API] Error fetching jobs for project ${params.projectId}:`,
        jobsError
      );
      return NextResponse.json({ error: jobsError.message }, { status: 400 });
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json([]);
    }

    const jobIds = jobs.map((j) => j.id);

    // Then fetch all costs for those jobs
    const { data: costs, error: costsError } = await supabase
      .from("model_usage")
      .select(
        `
        id,
        repair_job_id,
        model,
        usage_type,
        input_tokens,
        output_tokens,
        cost_usd,
        created_at
      `
      )
      .in("repair_job_id", jobIds)
      .order("created_at", { ascending: false });

    if (costsError) {
      console.error(
        `[repair-costs API] Error fetching costs for project ${params.projectId}:`,
        costsError
      );
      return NextResponse.json({ error: costsError.message }, { status: 400 });
    }

    return NextResponse.json(costs || []);
  } catch (err) {
    console.error(`[repair-costs API] Unexpected error:`, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
