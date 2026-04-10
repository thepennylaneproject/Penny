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
  python3 audits/linear_sync.py status            # Show sync status + orphan mappings
  python3 audits/linear_sync.py diff              # Compare open_findings status vs map lyra_status
  python3 audits/linear_sync.py prune             # Drop map entries for removed findings
  python3 audits/linear_sync.py push --dry-run    # Preview what would be created/updated
  python3 audits/linear_sync.py prune --dry-run   # Preview prune

Push is source of truth for mapped issues: each push fetches the issue from Linear and updates
workflow state when it does not match open_findings (so the map file matching the JSON is not
enough — Linear must actually be moved to Done / In Progress, etc.).

Push will not move a Linear issue backward when the issue is already in a state that implies a
stronger LYRA status than open_findings (e.g. In Review while LYRA still says accepted), unless
LYRA status regressed since the last sync (so reopening a finding can still move Linear back).
Run pull to advance open_findings from Linear, or update statuses after verify ingest.

Pull refuses to downgrade LYRA status (e.g. fixed_verified -> open) when Linear is behind;
run push again to advance the issue, or edit open_findings intentionally to reopen.

Deferred: LYRA "deferred" maps to Linear Backlog; pull maps Backlog -> open, but open ranks below
deferred so pull will not clobber a locally deferred finding. Run push after session.py skip so
Linear and linear_sync.json stay aligned.
"""

import json
import os
import sys
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
LYRA_TO_LINEAR_STATUS = {
    "open": "Backlog",
    "accepted": "Todo",
    "in_progress": "In Progress",
    # Match LINEAR_TO_LYRA ("In Review" <-> fixed_pending_verify) so push does not yank issues
    # out of review into In Progress.
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

# Ordering for pull: never overwrite local with a "weaker" status (prevents Linear drift
# from undoing synthesizer-verified or pending-verify states when push did not move the issue).
# deferred > open so Backlog -> open from Linear cannot overwrite a locally deferred finding.
LYRA_STATUS_RANK = {
    "open": 0,
    "deferred": 1,
    "accepted": 2,
    "in_progress": 3,
    "fixed_pending_verify": 4,
    "fixed_verified": 5,
    "wont_fix": 5,
    "duplicate": 5,
    "converted_to_enhancement": 2,
}


def _lyra_rank(status: str) -> int:
    return LYRA_STATUS_RANK.get(status, 0)


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

    for f in findings:
        fid = f.get("finding_id", "")
        status = f.get("status", "open")

        linear_state_name = LYRA_TO_LINEAR_STATUS.get(status, "Backlog")
        state_id = states.get(linear_state_name, "")
        title = f"{SEVERITY_PREFIX.get(f.get('severity', ''), '')} {f.get('title', fid)}".strip()
        priority = PRIORITY_MAP.get(f.get("priority", "P3"), 4)

        if fid in mappings:
            # Keep Linear workflow state aligned with open_findings (source of truth on push).
            # Also reconcile when linear_sync.json already matches the file but Linear was
            # never updated (avoids pull downgrading fixed_verified -> open on the next sync).
            existing = mappings[fid]
            if DRY_RUN:
                if existing.get("lyra_status") != status:
                    print(f"  Would update: {fid} -> {linear_state_name}")
                    updated += 1
                else:
                    skipped += 1
                continue

            issue = get_issue(existing["linear_id"])
            current_linear_name = (
                (issue or {}).get("state") or {}
            ).get("name", "")
            map_stale = existing.get("lyra_status") != status
            linear_out_of_sync = current_linear_name != linear_state_name

            if linear_out_of_sync and state_id:
                linear_derived = LINEAR_TO_LYRA_STATUS.get(current_linear_name)
                linear_derived_rank = (
                    _lyra_rank(linear_derived) if linear_derived is not None else None
                )
                finding_rank = _lyra_rank(status)
                prev_status = existing.get("lyra_status")
                prev_rank = _lyra_rank(prev_status) if prev_status else None
                lyra_regressed = (
                    prev_rank is not None and finding_rank < prev_rank
                )
                would_regress_linear = (
                    linear_derived_rank is not None
                    and not lyra_regressed
                    and finding_rank < linear_derived_rank
                )
                if would_regress_linear:
                    implied = linear_derived or "?"
                    print(
                        f"  Skipped push (would regress Linear): "
                        f"{existing.get('identifier', fid)} stays {current_linear_name!r}; "
                        f"LYRA {status!r} is behind Linear (implies {implied!r}). "
                        f"Run pull or set LYRA status to match."
                    )
                    skipped += 1
                elif update_issue_state(existing["linear_id"], state_id):
                    print(
                        f"  Updated: {existing.get('identifier', fid)} "
                        f"{current_linear_name!r} -> {linear_state_name} (LYRA {status})"
                    )
                    updated += 1
                else:
                    print(
                        f"  WARN: Could not set {existing.get('identifier', fid)} "
                        f"to {linear_state_name}"
                    )
            elif linear_out_of_sync and not state_id:
                print(
                    f"  WARN: {fid} should be {linear_state_name!r} in Linear but team has no state "
                    f"with that name (current: {current_linear_name!r}). Check LYRA_TO_LINEAR_STATUS."
                )
            elif map_stale:
                print(
                    f"  Synced map: {fid} lyra_status -> {status} "
                    f"(Linear already {current_linear_name!r})"
                )
                updated += 1
            else:
                skipped += 1

            existing["lyra_status"] = status
            existing["last_synced"] = NOW
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
        lyra_status = LINEAR_TO_LYRA_STATUS.get(linear_state, "")

        if not lyra_status:
            continue

        # Find the finding and update
        for f in findings:
            if f.get("finding_id") == fid:
                old_status = f.get("status", "open")
                if old_status == lyra_status:
                    break
                if _lyra_rank(lyra_status) < _lyra_rank(old_status):
                    print(
                        f"  Skipped pull (would downgrade): {fid} -- keeping {old_status!r}, "
                        f"Linear {info.get('identifier', '?')} is {linear_state!r} -> would map to {lyra_status!r}. "
                        f"Run push to update Linear, or move the issue in Linear forward."
                    )
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

    print("LYRA <-> Linear Sync Status")
    print("=" * 50)
    print(f"Last sync: {sync_map.get('last_sync', 'never')}")
    print(f"Synced findings: {len(in_both)}")
    print(f"In Linear only (finding resolved/removed): {len(in_linear_only)}")
    print(f"Unsynced unresolved findings: {len(unresolved_lyra_only)}")

    if unresolved_lyra_only:
        print(f"\nRun 'python3 linear_sync.py push' to sync {len(unresolved_lyra_only)} findings to Linear.")

    if in_linear_only:
        print("\nOrphan mappings (in linear_sync.json but not in open_findings):")
        print("  Run: python3 audits/linear_sync.py prune --dry-run   then   prune")
        for fid in sorted(in_linear_only):
            info = mappings.get(fid, {})
            ident = info.get("identifier", "?")
            print(f"  {fid}  ({ident})")


def cmd_diff():
    """Print mismatches between open_findings status and sync map lyra_status."""
    findings, _ = load_findings()
    sync_map = load_sync_map()
    mappings = sync_map["mappings"]
    fid_status = {f.get("finding_id", ""): f.get("status", "open") for f in findings}

    mismatches = []
    for fid, status in fid_status.items():
        if not fid or fid not in mappings:
            continue
        mapped = mappings[fid].get("lyra_status")
        if mapped != status:
            mismatches.append(
                (fid, status, mapped, mappings[fid].get("identifier", ""))
            )

    orphans = sorted(set(mappings.keys()) - set(fid_status.keys()))

    print("LYRA status vs linear_sync.json lyra_status")
    print("=" * 50)
    if not mismatches and not orphans:
        print("OK — no mismatches; no orphan mappings.")
        return

    if mismatches:
        print("\nMismatches (run push after editing open_findings, or pull after editing Linear):")
        for fid, local, mapped, ident in sorted(mismatches):
            print(f"  {fid}  local={local!r}  map={mapped!r}  ({ident})")

    if orphans:
        print("\nOrphan mappings (finding removed from open_findings):")
        for fid in orphans:
            info = mappings[fid]
            print(
                f"  {fid}  map_lyra_status={info.get('lyra_status')!r}  "
                f"({info.get('identifier', '')})"
            )
        print("\nRun: python3 audits/linear_sync.py prune")


def cmd_prune():
    """Remove sync map entries for finding IDs not present in open_findings."""
    findings, _ = load_findings()
    sync_map = load_sync_map()
    mappings = sync_map["mappings"]
    fid_set = {f.get("finding_id", "") for f in findings}
    fid_set.discard("")

    to_remove = sorted(fid for fid in mappings if fid not in fid_set)
    if not to_remove:
        print("Nothing to prune — all mappings have a matching open finding.")
        return

    if DRY_RUN:
        print(f"Would remove {len(to_remove)} orphan mapping(s):")
    else:
        print(f"Removing {len(to_remove)} orphan mapping(s):")

    for fid in to_remove:
        info = mappings.get(fid, {})
        ident = info.get("identifier", "?")
        url = info.get("url", "")
        line = f"  {fid}  ({ident})"
        if url:
            line += f"\n    {url}"
        print(line)

    if not DRY_RUN:
        for fid in to_remove:
            mappings.pop(fid, None)
        save_sync_map(sync_map)
        print("\nClose or merge these issues in Linear if they are still open.")

    print()
    if DRY_RUN:
        print("(dry run — no changes made)")


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
    elif cmd == "diff":
        cmd_diff()
    elif cmd == "prune":
        cmd_prune()
    else:
        print(f"Unknown command: {cmd}")
        print("Run 'python3 linear_sync.py help' for usage.")
        sys.exit(1)


if __name__ == "__main__":
    main()
