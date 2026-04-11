/**
 * Repair Service Callback Handler
 *
 * Called by the repair service when a repair job completes.
 * Updates repair_jobs with PR details and handles post-repair actions.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateRepairServiceBearer } from "./repair-auth.ts";

interface RepairCallbackPayload {
  repair_job_id: string;
  status: "completed" | "failed";
  action?: string;
  confidence_score?: number;
  pr_number?: number;
  pr_url?: string;
  error_message?: string;
}

function bearerTokensEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.subtle.timingSafeEqual(bufA, bufB);
}

export const handler = async (req: Request): Promise<Response> => {
  // Validate request method
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
    });
  }

  try {
    // Validate bearer token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }

    const token = authHeader.substring(7);
    const expectedToken = Deno.env.get("REPAIR_SERVICE_SECRET");

    if (!expectedToken || !bearerTokensEqual(token, expectedToken)) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
      });
    }

    // Parse payload
    const payload: RepairCallbackPayload = await req.json();

    // Validate payload
    if (!payload.repair_job_id) {
      return new Response(
        JSON.stringify({ error: "Missing repair_job_id" }),
        { status: 400 }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing Supabase configuration");
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update repair_jobs with callback data
    const updates: Record<string, unknown> = {
      status: payload.status,
    };

    if (payload.action) {
      updates.action = payload.action;
    }
    if (payload.confidence_score !== undefined) {
      updates.confidence_score = payload.confidence_score;
    }
    if (payload.pr_number) {
      updates.pr_number = payload.pr_number;
    }
    if (payload.pr_url) {
      updates.pr_url = payload.pr_url;
    }
    if (payload.error_message) {
      updates.error_message = payload.error_message;
    }

    updates.completed_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("repair_jobs")
      .update(updates)
      .eq("id", payload.repair_job_id)
      .select();

    if (error) {
      console.error("Failed to update repair job:", error);
      return new Response(
        JSON.stringify({ error: "Failed to update repair job" }),
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return new Response(
        JSON.stringify({ error: "Repair job not found" }),
        { status: 404 }
      );
    }

    const repairJob = data[0];

    // Handle post-repair actions based on action routing
    if (payload.status === "completed") {
      await handleRepairCompletion(supabase, repairJob);
    }

    return new Response(
      JSON.stringify({
        success: true,
        repair_job_id: payload.repair_job_id,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in repair callback:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500 }
    );
  }
};

/**
 * Handle post-repair actions
 */
async function handleRepairCompletion(
  supabase: ReturnType<typeof createClient>,
  repairJob: Record<string, unknown>
): Promise<void> {
  const action = repairJob.action as string;

  // Log completion event
  await supabase.from("orchestration_events").insert({
    repair_job_id: repairJob.id,
    event_type: "completion",
    action: action,
    confidence_score: repairJob.confidence_score,
    pr_number: repairJob.pr_number,
    created_at: new Date().toISOString(),
  });

  // TODO: Handle action-specific post-processing
  // - fast_lane_ready_pr: trigger approval workflow
  // - ready_pr: notify developer
  // - draft_pr: add to review queue
  // - candidate_only: suggest in dashboard
  // - do_not_repair: log for learning
}
