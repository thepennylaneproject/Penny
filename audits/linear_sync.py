#!/usr/bin/env python3
"""
LYRA Linear Integration

Syncs audit findings to Linear issues and pulls status changes back.

Setup:
  1. Create a Linear API key: Settings > API > Personal API Keys
  2. Set environment variables:
       export LINEAR_API_KEY="lin_api_..."
       export LINEAR_TEAM_ID="your-team-id"  (from Linear URL: app.linear.app/YOUR-TEAM/...)
  3. Optionally set a label and project:
       export LINEAR_LABEL_ID="label-uuid"    (create a "LYRA Audit" label in Linear)
       export LINEAR_PROJECT_ID="project-uuid" (optional: group under a project)

Usage:
  python3 audits/linear_sync.py push              # Push new/changed findings to Linear
  python3 audits/linear_sync.py pull              # Pull status changes from Linear back to findings
  python3 audits/linear_sync.py sync              # Push then pull (full round-trip)
  python3 audits/linear_sync.py status            # Show sync status
  python3 audits/linear_sync.py push --dry-run    # Preview what would be created/updated

Removals: Findings dropped from open_findings.json (after synthesizer merge) no longer appear in the
push loop. Push closes their Linear issues by treating non-terminal cached lyra_status as
fixed_verified → Done, and refreshes linear_sync.json so the map matches the repo.
"""

import json
import os
import sys
from typing import Optional
import urllib.request
import urllib.error
from datetime import datetime, timezone

# --- Config ---

def _load_env():
    """Load environment variables from .env and .env.local if they exist."""
    for filename in [".env", ".env.local"]:
        if os.path.exists(filename):
            with open(filename) as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, val = line.split("=", 1)
                    os.environ[key.strip()] = val.strip().strip('"').strip("'")

_load_env()

LINEAR_API = "https://api.linear.app/graphql"
LINEAR_API_KEY = os.environ.get("LINEAR_API_KEY", "")
LINEAR_TEAM_ID = os.environ.get("LINEAR_TEAM_ID", "")
LINEAR_LABEL_ID = os.environ.get("LINEAR_LABEL_ID", "")
LINEAR_PROJECT_ID = os.environ.get("LINEAR_PROJECT_ID", "")

OPEN_FINDINGS = "audits/open_findings.json"
SYNC_MAP = "audits/linear_sync.json"  # Maps finding_id <-> linear_issue_id
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

DRY_RUN = "--dry-run" in sys.argv

# Priority mapping: LYRA -> Linear (0=none, 1=urgent, 2=high, 3=medium, 4=low)
PRIORITY_MAP = {"P0": 1, "P1": 2, "P2": 3, "P3": 4}

# Severity to Linear label prefix (for issue titles)
SEVERITY_PREFIX = {
    "blocker": "[BLOCKER]",
    "major": "[MAJOR]",
    "minor": "[MINOR]",
    "nit": "[NIT]",
}

# Status mapping: LYRA -> Linear state name (customize to match your Linear workflow)
# Default Linear states: Backlog, Todo, In Progress, Done, Cancelled
#
# IMPORTANT: `fixed_pending_verify` must NOT map to the same Linear state as `in_progress`
# if that state round-trips to only one LYRA value on pull. Previously both mapped to
# "In Progress", so pull overwrote fixed_pending_verify -> in_progress (regression).
# Use "In Review" for verify-pending work when your team has that workflow state; push
# falls back to "In Progress" if "In Review" is missing.
LYRA_TO_LINEAR_STATUS = {
    "open": "Backlog",
    "accepted": "Todo",
    "in_progress": "In Progress",
    "fixed_pending_verify": "In Review",
    "fixed_verified": "Done",
    "wont_fix": "Cancelled",
    "deferred": "Backlog",
    "duplicate": "Cancelled",
    "converted_to_enhancement": "Backlog",
}

# Reverse: Linear state -> LYRA status
LINEAR_TO_LYRA_STATUS = {
    "Backlog": "open",
    "Triage": "open",
    "Todo": "accepted",
    "In Progress": "in_progress",
    "In Review": "fixed_pending_verify",
    "Done": "fixed_verified",
    "Cancelled": "wont_fix",
}


def resolve_linear_state_for_push(lyra_status: str, states: dict) -> tuple[str, str]:
    """Return (linear_state_name, state_id) for LYRA status, with In Review fallback."""
    name = LYRA_TO_LINEAR_STATUS.get(lyra_status, "Backlog")
    state_id = states.get(name, "")
    if not state_id and lyra_status == "fixed_pending_verify":
        name = "In Progress"
        state_id = states.get(name, "")
    return name, state_id


def resolve_lyra_status_for_pull(linear_state: str, old_lyra: str) -> Optional[str]:
    """
    Map Linear state to new LYRA status, or None to leave the finding unchanged.

    When Linear is still \"In Progress\" but LYRA was fixed_pending_verify, we cannot
    distinguish (legacy pushes used In Progress for both). Do not downgrade to in_progress.
    """
    mapped = LINEAR_TO_LYRA_STATUS.get(linear_state)
    if mapped is None:
        return None
    if mapped == old_lyra:
        return None
    if linear_state == "In Progress" and old_lyra == "fixed_pending_verify":
        return None
    return mapped


TERMINAL_LYRA_STATUSES = frozenset({"fixed_verified", "wont_fix", "duplicate"})


def effective_terminal_lyra_for_removed_finding(cached_lyra: str) -> tuple[str, bool]:
    """
    When a finding_id is no longer in open_findings.json, map to a terminal LYRA status for Linear.

    Returns (terminal_status, inferred). If cached_lyra is already terminal, use it. Otherwise
    assume fixed_verified (normal synthesizer merge removes resolved work from open_findings).
    """
    if cached_lyra in TERMINAL_LYRA_STATUSES:
        return cached_lyra, False
    return "fixed_verified", True


# --- GraphQL Helpers ---

def gql(query, variables=None):
    """Execute a GraphQL query against Linear API."""
    if not LINEAR_API_KEY:
        print("ERROR: LINEAR_API_KEY not set.")
        sys.exit(1)

    payload = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(
        LINEAR_API,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": LINEAR_API_KEY,
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"Linear API error ({e.code}): {body}")
        sys.exit(1)


def get_team_states():
    """Get workflow states for the team."""
    result = gql("""
        query($teamId: String!) {
            team(id: $teamId) {
                states { nodes { id name type } }
            }
        }
    """, {"teamId": LINEAR_TEAM_ID})
    states = result.get("data", {}).get("team", {}).get("states", {}).get("nodes", [])
    return {s["name"]: s["id"] for s in states}


def create_issue(title, description, priority, state_id, label_ids=None, project_id=None):
    """Create a Linear issue."""
    variables = {
        "teamId": LINEAR_TEAM_ID,
        "title": title,
        "description": description,
        "priority": priority,
    }
    if state_id:
        variables["stateId"] = state_id
    if label_ids:
        variables["labelIds"] = label_ids
    if project_id:
        variables["projectId"] = project_id

    result = gql("""
        mutation($teamId: String!, $title: String!, $description: String!,
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
        }
    """, variables)

    issue_data = result.get("data", {}).get("issueCreate", {})
    if issue_data.get("success"):
        return issue_data.get("issue", {})
    else:
        print(f"  Failed to create issue: {result}")
        return None


def update_issue_state(issue_id, state_id):
    """Update a Linear issue's state."""
    result = gql("""
        mutation($issueId: String!, $stateId: String!) {
            issueUpdate(id: $issueId, input: { stateId: $stateId }) {
                success
            }
        }
    """, {"issueId": issue_id, "stateId": state_id})
    return result.get("data", {}).get("issueUpdate", {}).get("success", False)


def get_issue(issue_id):
    """Get a Linear issue's current state."""
    result = gql("""
        query($issueId: String!) {
            issue(id: $issueId) {
                id identifier title
                state { name }
                priority
                updatedAt
            }
        }
    """, {"issueId": issue_id})
    return result.get("data", {}).get("issue")


# --- Sync Map ---

def load_sync_map():
    if os.path.exists(SYNC_MAP):
        with open(SYNC_MAP) as f:
            return json.load(f)
    return {"mappings": {}, "last_sync": None}


def save_sync_map(sync_map):
    sync_map["last_sync"] = NOW
    with open(SYNC_MAP, "w") as f:
        json.dump(sync_map, f, indent=2)
        f.write("\n")


# --- Findings ---

def load_findings():
    if not os.path.exists(OPEN_FINDINGS):
        return [], {}
    with open(OPEN_FINDINGS) as f:
        data = json.load(f)
    findings = data.get("open_findings", data.get("findings", []))
    return findings, data


def save_findings(data, findings):
    key = "open_findings" if "open_findings" in data else "findings"
    data[key] = findings
    data["last_updated"] = NOW
    with open(OPEN_FINDINGS, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def finding_to_description(f):
    """Convert a finding to a Linear issue description (Markdown)."""
    lines = []
    lines.append(f"**LYRA Finding:** `{f.get('finding_id', '?')}`")
    lines.append(f"**Type:** {f.get('type', '?')} | **Severity:** {f.get('severity', '?')} | **Priority:** {f.get('priority', '?')}")
    lines.append(f"**Confidence:** {f.get('confidence', '?')}")
    lines.append("")
    lines.append(f.get("description", "No description."))
    lines.append("")

    # Proof hooks
    hooks = f.get("proof_hooks", [])
    if hooks:
        lines.append("### Proof")
        for h in hooks:
            hook_type = h.get("hook_type", "?")
            summary = h.get("summary", "")
            file_ref = h.get("file", "")
            lines.append(f"- **[{hook_type}]** {summary}")
            if file_ref:
                line_start = h.get("start_line", "")
                lines.append(f"  `{file_ref}`{f':{line_start}' if line_start else ''}")
        lines.append("")

    # Fix
    fix = f.get("suggested_fix", {})
    if isinstance(fix, dict) and fix.get("approach"):
        lines.append("### Suggested Fix")
        lines.append(fix["approach"])
        files = fix.get("affected_files", [])
        if files:
            lines.append(f"\n**Files:** {', '.join(f'`{ff}`' for ff in files)}")
        effort = fix.get("estimated_effort", "?")
        lines.append(f"**Effort:** {effort}")
        risk = fix.get("risk_notes", "")
        if risk:
            lines.append(f"**Risk:** {risk}")
        tests = fix.get("tests_needed", [])
        if tests:
            lines.append("\n**Tests needed:**")
            for t in tests:
                lines.append(f"- {t}")
        lines.append("")

    lines.append("---")
    lines.append(f"*Synced from LYRA audit suite. Finding ID: `{f.get('finding_id', '?')}`*")

    return "\n".join(lines)


# --- Commands ---

def cmd_push():
    findings, _ = load_findings()
    sync_map = load_sync_map()
    mappings = sync_map["mappings"]

    if not LINEAR_TEAM_ID:
        print("ERROR: LINEAR_TEAM_ID not set.")
        sys.exit(1)

    # Get team workflow states
    if not DRY_RUN:
        states = get_team_states()
    else:
        states = {}

    label_ids = [LINEAR_LABEL_ID] if LINEAR_LABEL_ID else None
    project_id = LINEAR_PROJECT_ID or None

    created = 0
    updated = 0
    skipped = 0

    open_ids = {f.get("finding_id") for f in findings if f.get("finding_id")}

    for f in findings:
        fid = f.get("finding_id", "")
        status = f.get("status", "open")

        linear_state_name, state_id = resolve_linear_state_for_push(status, states)
        title = f"{SEVERITY_PREFIX.get(f.get('severity', ''), '')} {f.get('title', fid)}".strip()
        priority = PRIORITY_MAP.get(f.get("priority", "P3"), 4)

        if fid in mappings:
            # Keep Linear in sync when LYRA status moves (including -> Done / Cancelled).
            # Also re-push when LYRA status is unchanged but the desired Linear workflow state
            # drifted (e.g. mapping fixed_pending_verify from In Progress -> In Review).
            existing = mappings[fid]
            status_changed = existing.get("lyra_status") != status
            linear_drift = False
            if not status_changed:
                if existing.get("last_linear_state") == linear_state_name:
                    skipped += 1
                    continue
                issue = get_issue(existing["linear_id"])
                cur = (issue or {}).get("state", {}).get("name", "")
                if cur and cur != linear_state_name:
                    linear_drift = True

            if not status_changed and not linear_drift:
                skipped += 1
                continue

            if DRY_RUN:
                reason = "LYRA status change" if status_changed else "Linear state drift"
                print(f"  Would update ({reason}): {fid} -> {linear_state_name}")
                updated += 1
            elif state_id and update_issue_state(existing["linear_id"], state_id):
                existing["lyra_status"] = status
                existing["last_synced"] = NOW
                existing["last_linear_state"] = linear_state_name
                why = "status" if status_changed else "state"
                print(f"  Updated ({why}): {existing.get('identifier', fid)} -> {linear_state_name}")
                updated += 1
            else:
                skipped += 1
            continue

        # New finding: do not open Linear issues for terminal LYRA statuses
        if status in ("fixed_verified", "wont_fix", "duplicate"):
            skipped += 1
            continue

        # New finding -- create issue
        if DRY_RUN:
            print(f"  Would create: {title[:80]}")
            created += 1
        else:
            description = finding_to_description(f)
            issue = create_issue(title, description, priority, state_id, label_ids, project_id)
            if issue:
                mappings[fid] = {
                    "linear_id": issue["id"],
                    "identifier": issue.get("identifier", ""),
                    "url": issue.get("url", ""),
                    "lyra_status": status,
                    "created_at": NOW,
                    "last_synced": NOW,
                }
                print(f"  Created: {issue.get('identifier', '?')} -- {title[:60]}")
                created += 1

    # Mappings for findings no longer in open_findings.json are skipped by the main loop.
    # Push terminal Linear state: use cached terminal lyra_status, or infer fixed_verified when the
    # map was never updated after synthesizer removed the row (previously caused perpetual open issues).
    for fid, info in mappings.items():
        if fid in open_ids:
            continue
        cached = info.get("lyra_status", "")
        terminal_lyra, inferred = effective_terminal_lyra_for_removed_finding(cached)
        linear_state_name, state_id = resolve_linear_state_for_push(terminal_lyra, states)
        if DRY_RUN:
            reason = "infer fixed_verified" if inferred else "cached terminal"
            print(
                f"  Would update (removed from open_findings; {reason}): {fid} -> {linear_state_name}"
            )
            updated += 1
            continue
        issue = get_issue(info["linear_id"])
        cur = (issue or {}).get("state", {}).get("name", "")
        if cur == linear_state_name:
            info["lyra_status"] = terminal_lyra
            info["last_linear_state"] = linear_state_name
            skipped += 1
            continue
        if state_id and update_issue_state(info["linear_id"], state_id):
            info["lyra_status"] = terminal_lyra
            info["last_synced"] = NOW
            info["last_linear_state"] = linear_state_name
            tag = "inferred Done" if inferred else "removed from open_findings"
            print(f"  Updated ({tag}): {info.get('identifier', fid)} -> {linear_state_name}")
            updated += 1
        else:
            skipped += 1

    if not DRY_RUN:
        save_sync_map(sync_map)

    print(f"\nPush complete: {created} created, {updated} updated, {skipped} skipped")
    if DRY_RUN:
        print("(dry run -- no changes made)")


def cmd_pull():
    findings, data = load_findings()
    sync_map = load_sync_map()
    mappings = sync_map["mappings"]

    if not mappings:
        print("No synced issues. Run 'push' first.")
        return

    pulled = 0
    for fid, info in mappings.items():
        linear_id = info.get("linear_id", "")
        if not linear_id:
            continue

        issue = get_issue(linear_id)
        if not issue:
            continue

        linear_state = issue.get("state", {}).get("name", "")

        # Find the finding and update
        for f in findings:
            if f.get("finding_id") == fid:
                old_status = f.get("status", "")
                lyra_status = resolve_lyra_status_for_pull(linear_state, old_status)
                if lyra_status is None:
                    break
                f["status"] = lyra_status
                history = f.setdefault("history", [])
                history.append({
                    "timestamp": NOW,
                    "actor": "linear-sync",
                    "event": "note_added",
                    "notes": f"Status synced from Linear ({info.get('identifier', '?')}): {linear_state} -> {lyra_status}",
                })
                info["lyra_status"] = lyra_status
                info["last_synced"] = NOW
                print(f"  Pulled: {fid} -- {old_status} -> {lyra_status} (from {info.get('identifier', '?')})")
                pulled += 1
                break

    save_findings(data, findings)
    save_sync_map(sync_map)
    print(f"\nPull complete: {pulled} findings updated from Linear")


def cmd_sync():
    print("--- PUSH (findings -> Linear) ---")
    cmd_push()
    print()
    if not DRY_RUN:
        print("--- PULL (Linear -> findings) ---")
        cmd_pull()


def cmd_status():
    sync_map = load_sync_map()
    mappings = sync_map["mappings"]
    findings, _ = load_findings()

    synced = set(mappings.keys())
    finding_ids = {f.get("finding_id", "") for f in findings}

    in_both = synced & finding_ids
    in_linear_only = synced - finding_ids
    in_lyra_only = finding_ids - synced

    # Filter out resolved findings from lyra_only
    unresolved_lyra_only = set()
    for f in findings:
        fid = f.get("finding_id", "")
        if fid in in_lyra_only and f.get("status") in ("open", "accepted", "in_progress", "fixed_pending_verify"):
            unresolved_lyra_only.add(fid)

    stale_removed = []
    for fid in in_linear_only:
        cached = mappings.get(fid, {}).get("lyra_status", "")
        if cached not in TERMINAL_LYRA_STATUSES:
            ident = mappings.get(fid, {}).get("identifier", "?")
            stale_removed.append((fid, ident, cached or "(empty)"))

    print("LYRA <-> Linear Sync Status")
    print("=" * 50)
    print(f"Last sync: {sync_map.get('last_sync', 'never')}")
    print(f"Synced findings: {len(in_both)}")
    print(f"In Linear only (finding resolved/removed): {len(in_linear_only)}")
    print(f"Unsynced unresolved findings: {len(unresolved_lyra_only)}")

    if stale_removed:
        print(f"\nStale mapping — removed from open_findings but map not terminal ({len(stale_removed)}):")
        print("  (next push will infer fixed_verified → Done and refresh the map)")
        for fid, ident, cached in sorted(stale_removed, key=lambda x: x[0])[:40]:
            print(f"  {fid}  {ident}  cached_lyra={cached}")
        if len(stale_removed) > 40:
            print(f"  ... and {len(stale_removed) - 40} more")

    if unresolved_lyra_only:
        print(f"\nRun 'python3 audits/linear_sync.py push' to sync {len(unresolved_lyra_only)} findings to Linear.")


# --- Main ---

def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("help", "--help", "-h"):
        print(__doc__)
        return

    cmd = sys.argv[1].lower()

    if cmd == "push":
        cmd_push()
    elif cmd == "pull":
        cmd_pull()
    elif cmd == "sync":
        cmd_sync()
    elif cmd == "status":
        cmd_status()
    else:
        print(f"Unknown command: {cmd}")
        print("Run 'python3 linear_sync.py help' for usage.")
        sys.exit(1)


if __name__ == "__main__":
    main()
