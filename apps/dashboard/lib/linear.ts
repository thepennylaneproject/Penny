/**
 * Linear API client for syncing penny findings. Mirrors linear_sync.py mappings.
 */

import type { Finding, FindingStatus } from "./types";

const LINEAR_API = "https://api.linear.app/graphql";

export const penny_TO_LINEAR_STATUS: Record<FindingStatus, string> = {
  open: "Backlog",
  accepted: "Todo",
  assigned: "Todo",
  in_progress: "In Progress",
  fixed_pending_verify: "In Progress",
  fixed_verified: "Done",
  wont_fix: "Cancelled",
  deferred: "Backlog",
  duplicate: "Cancelled",
  converted_to_enhancement: "Backlog",
};

export const LINEAR_TO_penny_STATUS: Record<string, FindingStatus> = {
  Backlog: "open",
  Triage: "open",
  Todo: "accepted",
  "In Progress": "in_progress",
  "In Review": "fixed_pending_verify",
  Done: "fixed_verified",
  Cancelled: "wont_fix",
};

const PRIORITY_MAP: Record<string, number> = { P0: 1, P1: 2, P2: 3, P3: 4 };
const SEVERITY_PREFIX: Record<string, string> = {
  blocker: "[BLOCKER]",
  major: "[MAJOR]",
  minor: "[MINOR]",
  nit: "[NIT]",
};

function getEnv(key: string): string {
  return (process.env[key] ?? "").trim();
}

/** Linear expects the raw key in Authorization (no `Bearer ` prefix). */
function linearApiKey(): string {
  let k = getEnv("LINEAR_API_KEY");
  if (/^bearer\s+/i.test(k)) k = k.replace(/^bearer\s+/i, "").trim();
  return k;
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

let cachedResolvedTeamId: string | null = null;

/**
 * LINEAR_TEAM_ID must be the team's UUID (Linear → Settings → API).
 * If you set a team *key* (e.g. ENG) instead, we resolve it via the API.
 */
async function resolveLinearTeamId(): Promise<string> {
  const raw = getEnv("LINEAR_TEAM_ID");
  if (!raw) throw new Error("LINEAR_TEAM_ID not set");
  if (looksLikeUuid(raw)) return raw.trim();
  if (cachedResolvedTeamId) return cachedResolvedTeamId;

  const result = (await gql(
    `query {
      teams {
        nodes { id key name }
      }
    }`
  )) as {
    data?: { teams?: { nodes?: { id: string; key: string; name: string }[] } };
  };

  const nodes = result.data?.teams?.nodes ?? [];
  const want = raw.trim().toLowerCase();
  const found = nodes.find(
    (n) => n.key?.toLowerCase() === want || n.name?.toLowerCase() === want
  );
  if (!found) {
    throw new Error(
      `LINEAR_TEAM_ID "${raw}" is not a UUID and does not match any team key/name. ` +
        `Use the team UUID from Linear (Settings → API → Your teams), or set LINEAR_TEAM_ID to your team key (e.g. ENG).`
    );
  }
  cachedResolvedTeamId = found.id;
  return found.id;
}

export function isLinearConfigured(): boolean {
  return !!(linearApiKey() && getEnv("LINEAR_TEAM_ID"));
}

type GqlResult<T> = { data?: T; errors?: Array<{ message?: string }> };

async function gql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<GqlResult<T>> {
  const apiKey = linearApiKey();
  if (!apiKey) throw new Error("LINEAR_API_KEY not set");

  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Linear API error (${res.status}): ${text.slice(0, 800)}`);
  }

  const json = (await res.json()) as GqlResult<T>;
  if (json.errors?.length) {
    const msg = json.errors
      .map((e) => e.message ?? JSON.stringify(e))
      .join("; ");
    throw new Error(`Linear GraphQL: ${msg}`);
  }
  return json;
}

/** Lightweight check that the API key works (used by dashboard status). */
export async function pingLinearApi(): Promise<{ ok: boolean; error?: string }> {
  try {
    await gql<{ viewer?: { id?: string } }>(`query { viewer { id } }`);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getTeamStates(): Promise<Record<string, string>> {
  const teamId = await resolveLinearTeamId();

  const result = (await gql(
    `query($teamId: String!) {
      team(id: $teamId) {
        id
        name
        states { nodes { id name type } }
      }
    }`,
    { teamId }
  )) as {
    data?: { team?: { states?: { nodes?: { id: string; name: string }[] } } };
  };

  const team = result.data?.team;
  if (!team) {
    throw new Error(
      "Linear returned no team for LINEAR_TEAM_ID. Use the team UUID from Linear (Settings → API), not the workspace ID."
    );
  }

  const nodes = team.states?.nodes ?? [];
  return Object.fromEntries(nodes.map((s) => [s.name, s.id]));
}

function isLinearLabelIdsAccessError(message: string): boolean {
  return (
    /labelIds/i.test(message) &&
    (/validateAccess/i.test(message) || /entity not found/i.test(message))
  );
}

export async function createIssue(params: {
  title: string;
  description: string;
  priority: number;
  stateId?: string;
  labelIds?: string[];
  projectId?: string;
}): Promise<{ id: string; identifier?: string; url?: string } | null> {
  const teamId = await resolveLinearTeamId();

  const runCreate = async (labelIds?: string[]) => {
    const variables: Record<string, unknown> = {
      teamId,
      title: params.title,
      description: params.description,
      priority: params.priority,
    };
    if (params.stateId) variables.stateId = params.stateId;
    if (labelIds?.length) variables.labelIds = labelIds;
    if (params.projectId) variables.projectId = params.projectId;

    const result = (await gql(
      `mutation($teamId: String!, $title: String!, $description: String!,
               $priority: Int, $stateId: String, $labelIds: [String!],
               $projectId: String) {
        issueCreate(input: {
          teamId: $teamId
          title: $title
          description: $description
          priority: $priority
          stateId: $stateId
          labelIds: $labelIds
          projectId: $projectId
        }) {
          success
          issue { id identifier url }
        }
      }`,
      variables
    )) as {
      data?: {
        issueCreate?: {
          success?: boolean;
          issue?: { id: string; identifier?: string; url?: string };
        };
      };
    };

    const issueCreate = result.data?.issueCreate;
    if (issueCreate?.success && issueCreate.issue) return issueCreate.issue;
    if (issueCreate && !issueCreate.success) {
      throw new Error(
        "Linear issueCreate returned success=false (check team permissions, label/project IDs, and title length)."
      );
    }
    return null;
  };

  try {
    return await runCreate(params.labelIds);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (params.labelIds?.length && isLinearLabelIdsAccessError(msg)) {
      console.warn(
        "[linear] LINEAR_LABEL_ID rejected by Linear (wrong workspace, deleted label, or no access). Creating issue without labels. Fix or remove LINEAR_LABEL_ID.",
        msg
      );
      return runCreate(undefined);
    }
    throw error;
  }
}

export async function updateIssueState(issueId: string, stateId: string): Promise<boolean> {
  const result = (await gql(
    `mutation($issueId: String!, $stateId: String!) {
      issueUpdate(id: $issueId, input: { stateId: $stateId }) { success }
    }`,
    { issueId, stateId }
  )) as { data?: { issueUpdate?: { success?: boolean } } };
  return result.data?.issueUpdate?.success ?? false;
}

export async function getIssue(issueId: string): Promise<{ state?: { name?: string } } | null> {
  const result = (await gql(
    `query($issueId: String!) {
      issue(id: $issueId) {
        id identifier title
        state { name }
        priority
        updatedAt
      }
    }`,
    { issueId }
  )) as { data?: { issue?: { state?: { name?: string } } } };
  return result.data?.issue ?? null;
}

export function findingToLinearTitle(finding: Finding): string {
  const prefix = SEVERITY_PREFIX[finding.severity] ?? "";
  const title = finding.title ?? finding.finding_id;
  return `${prefix} ${title}`.trim();
}

export function findingToDescription(finding: Finding): string {
  const lines: string[] = [];
  lines.push(`**penny Finding:** \`${finding.finding_id}\``);
  lines.push(`**Type:** ${finding.type} | **Severity:** ${finding.severity} | **Priority:** ${finding.priority}`);
  lines.push(`**Confidence:** ${finding.confidence ?? "?"}`);
  lines.push("");
  lines.push(finding.description ?? "No description.");
  lines.push("");

  const hooks = finding.proof_hooks ?? [];
  if (hooks.length > 0) {
    lines.push("### Proof");
    for (const h of hooks) {
      const hookType = h.hook_type ?? h.type ?? "?";
      const summary = h.summary ?? h.value ?? "";
      lines.push(`- **[${hookType}]** ${summary}`);
      if (h.file) {
        const line = h.start_line != null ? `:${h.start_line}` : "";
        lines.push(`  \`${h.file}${line}\``);
      }
    }
    lines.push("");
  }

  const fix = finding.suggested_fix;
  if (fix && typeof fix === "object" && fix.approach) {
    lines.push("### Suggested Fix");
    lines.push(fix.approach);
    if (fix.affected_files?.length) {
      lines.push(`\n**Files:** ${fix.affected_files.map((f) => `\`${f}\``).join(", ")}`);
    }
    lines.push(`**Effort:** ${fix.estimated_effort ?? "?"}`);
    if (fix.risk_notes) lines.push(`**Risk:** ${fix.risk_notes}`);
    if (fix.tests_needed?.length) {
      lines.push("\n**Tests needed:**");
      for (const t of fix.tests_needed) lines.push(`- ${t}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(`*Synced from penny dashboard. Finding ID: \`${finding.finding_id}\`*`);
  return lines.join("\n");
}

export function getLinearPriority(finding: Finding): number {
  return PRIORITY_MAP[finding.priority] ?? 4;
}

export function getEnvLabelId(cluster?: string): string | null {
  if (cluster) {
    const clusterLabel = getEnv(`LINEAR_LABEL_ID_${cluster.toUpperCase()}`);
    if (clusterLabel) return clusterLabel;
  }
  return getEnv("LINEAR_LABEL_ID") || null;
}

export function getEnvProjectId(projectName?: string): string | null {
  // Per-project lookup: LINEAR_PROJECT_ID_RELEVNT, LINEAR_PROJECT_ID_EMBR, etc.
  if (projectName) {
    const key = `LINEAR_PROJECT_ID_${projectName.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
    const perProject = getEnv(key);
    if (perProject) return perProject;
  }
  // Fall back to global LINEAR_PROJECT_ID
  const id = getEnv("LINEAR_PROJECT_ID");
  return id || null;
}
