import type { Config } from "@netlify/functions";

/**
 * Monday 09:00 UTC — enqueues weekly_audit (same cadence as former GitHub Action).
 * Set ORCHESTRATION_ENQUEUE_SECRET in Netlify env (must match dashboard).
 */
export default async function handler() {
  const siteUrl =
    process.env.URL?.replace(/\/$/, "") ||
    process.env.DEPLOY_PRIME_URL?.replace(/\/$/, "") ||
    "";
  const secret = process.env.ORCHESTRATION_ENQUEUE_SECRET?.trim();
  if (!siteUrl || !secret) {
    console.error(
      "[enqueue-weekly-audit] Missing URL or ORCHESTRATION_ENQUEUE_SECRET"
    );
    return;
  }
  const res = await fetch(`${siteUrl}/api/orchestration/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ job_type: "weekly_audit" }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("[enqueue-weekly-audit] Failed", res.status, text);
  } else {
    console.log("[enqueue-weekly-audit] OK", text.slice(0, 200));
  }
}

export const config: Config = {
  schedule: "0 9 * * 1",
};
