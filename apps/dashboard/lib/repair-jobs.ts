import type { SupabaseClient } from "@supabase/supabase-js";

export interface RepairJobLookup {
  id: string;
  repair_job_id: string;
}

export async function resolveRepairJobByPublicId(
  supabase: SupabaseClient,
  repairJobId: string
): Promise<RepairJobLookup | null> {
  const { data, error } = await supabase
    .from("repair_jobs")
    .select("id, repair_job_id")
    .eq("repair_job_id", repairJobId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: String(data.id),
    repair_job_id: String(data.repair_job_id),
  };
}

export async function resolveProjectIdByNameOrId(
  supabase: SupabaseClient,
  value: string
): Promise<string | null> {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const looksLikeUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed
    );

  if (looksLikeUuid) {
    const byId = await supabase
      .from("projects")
      .select("id")
      .eq("id", trimmed)
      .maybeSingle();
    if (byId.data?.id) {
      return String(byId.data.id);
    }
  }

  const byName = await supabase
    .from("projects")
    .select("id")
    .eq("name", trimmed)
    .maybeSingle();
  if (byName.data?.id) {
    return String(byName.data.id);
  }

  return null;
}
