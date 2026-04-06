export interface DashboardRuntimeConfig {
  laneBaseUrl: string | null;
  laneServerConfigured: boolean;
}

function normalizeUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

export function resolveDashboardRuntimeConfig(
  env: Record<string, string | undefined> = process.env
): DashboardRuntimeConfig {
  const publicLaneBaseUrl = normalizeUrl(env.NEXT_PUBLIC_LANE_API_BASE_URL ?? null);
  const serverLaneBaseUrl = normalizeUrl(env.LANE_API_BASE_URL ?? null);
  const laneConfigured = Boolean(publicLaneBaseUrl || serverLaneBaseUrl);

  return {
    laneBaseUrl: laneConfigured ? "/api/lane" : null,
    laneServerConfigured: Boolean(serverLaneBaseUrl),
  };
}
