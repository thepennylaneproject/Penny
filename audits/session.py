#!/usr/bin/env python3
"""
LYRA Session Runner v1.1

One script for the entire audit-fix-ship cycle. Reduces cognitive load to:
  1. Run this script
  2. Do what it says
  3. Run it again when done
  4. Ship when it says you can

Usage:
  python3 session.py                  # Show what to do next
  python3 session.py triage           # Show prioritized fix list
  python3 session.py fix <finding_id> # Mark a finding as in-progress
  python3 session.py done <finding_id> [commit_sha]  # Mark fix applied
  python3 session.py skip <finding_id> [reason]      # Defer a finding
  python3 session.py reaudit          # Show which agents to re-run
  python3 session.py status           # Full dashboard
  python3 session.py canship          # Am I ready to deploy?
  python3 session.py decide <finding_id> <decision>  # Answer a question finding
"""

import json
import sys
import os
from datetime import datetime, timezone
from collections import defaultdict

# --- Config ---

OPEN_FINDINGS = "audits/open_findings.json"
INDEX = "audits/index.json"
FINDINGS_DIR = "audits/findings"
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

# Priority sort order (lower = more urgent)
PRIORITY_ORDER = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
SEVERITY_ORDER = {"blocker": 0, "major": 1, "minor": 2, "nit": 3}
EFFORT_ORDER = {"trivial": 0, "small": 1, "medium": 2, "large": 3, "epic": 4}
CONFIDENCE_ORDER = {"evidence": 0, "inference": 1, "speculation": 2}

# Agent mapping: which agent covers which categories
CATEGORY_TO_AGENT = {
    "null-ref": "logic", "type-error": "logic", "race-condition": "logic",
    "dead-code": "logic", "error-handling": "logic", "async-bug": "logic",
    "runtime-error": "logic", "runtime_logic": "logic",
    "schema-mismatch": "data", "missing-rls": "data", "constraint-violation": "data",
    "migration-gap": "data", "orphaned-data": "data", "type-drift": "data",
    "validation-gap": "data",
    "copy-mismatch": "ux", "missing-state": "ux", "broken-flow": "ux",
    "a11y-gap": "ux", "nav-dead-end": "ux", "inconsistent-label": "ux",
    "missing-boundary": "ux",
    "n-plus-one": "performance", "missing-index": "performance",
    "bundle-size": "performance", "render-waste": "performance",
    "api-cost": "performance", "cache-miss": "performance",
    "auth-bypass": "security", "xss": "security", "injection": "security",
    "secrets-exposure": "security", "cors-misconfiguration": "security",
    "data-leakage": "security", "missing-validation": "security",
    "build-config": "deploy", "ci-gap": "deploy",
    "missing-error-boundary": "deploy", "logging-gap": "deploy",
    "env-management": "deploy", "deploy-risk": "deploy",
}

AGENT_PROMPTS = {
    "logic": "audits/prompts/agent-logic.md",
    "data": "audits/prompts/agent-data.md",
    "ux": "audits/prompts/agent-ux.md",
    "performance": "audits/prompts/agent-performance.md",
    "security": "audits/prompts/agent-security.md",
    "deploy": "audits/prompts/agent-deploy.md",
}

# What "changed" means for triggering re-audit
TRIGGER_MAP = {
    "src/services/": ["logic", "data"],
    "src/hooks/": ["logic", "ux"],
    "src/components/": ["ux", "logic"],
    "src/pages/": ["ux", "logic"],
    "src/lib/": ["logic", "security"],
    "src/utils/": ["logic", "performance"],
    "netlify/functions/": ["logic", "data", "security"],
    "supabase/migrations/": ["data", "security"],
    "supabase/": ["data"],
    ".env": ["security", "deploy"],
    "package.json": ["deploy", "performance"],
    "vite.config": ["deploy", "performance"],
    "netlify.toml": ["deploy"],
    ".github/workflows/": ["deploy"],
    "tsconfig": ["deploy"],
}


# --- Helpers ---

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


def sort_key(f):
    """Sort findings by: priority -> severity -> confidence -> effort (all ascending = most urgent first)."""
    fix = f.get("suggested_fix", {}) if isinstance(f.get("suggested_fix"), dict) else {}
    return (
        PRIORITY_ORDER.get(f.get("priority", "P3"), 9),
        SEVERITY_ORDER.get(f.get("severity", "nit"), 9),
        CONFIDENCE_ORDER.get(f.get("confidence", "speculation"), 9),
        EFFORT_ORDER.get(fix.get("estimated_effort", "epic"), 9),
    )


def actionable(f):
    """Is this finding something to work on right now?"""
    return f.get("status") in ("open", "accepted")


def in_progress(f):
    return f.get("status") == "in_progress"


def is_question(f):
    return f.get("type") == "question"


def is_blocker(f):
    return f.get("severity") == "blocker" and f.get("status") in ("open", "accepted", "in_progress")


def effort_str(f):
    fix = f.get("suggested_fix", {}) if isinstance(f.get("suggested_fix"), dict) else {}
    return fix.get("estimated_effort", "?")


def affected_files(f):
    fix = f.get("suggested_fix", {}) if isinstance(f.get("suggested_fix"), dict) else {}
    return fix.get("affected_files", [])


def agent_for_finding(f):
    cat = f.get("category", "")
    # Try exact match, then prefix match
    if cat in CATEGORY_TO_AGENT:
        return CATEGORY_TO_AGENT[cat]
    for key in CATEGORY_TO_AGENT:
        if key in cat or cat in key:
            return CATEGORY_TO_AGENT[key]
    return "logic"  # default


def add_history(f, event, notes, commit=None):
    history = f.setdefault("history", [])
    entry = {"timestamp": NOW, "actor": "solo-dev", "event": event, "notes": notes}
    if commit:
        entry["commit"] = commit
    history.append(entry)


# --- Commands ---

def cmd_status():
    findings, _ = load_findings()
    if not findings:
        print("No open findings. You're clear.")
        return

    by_status = defaultdict(int)
    by_severity = defaultdict(int)
    by_type = defaultdict(int)
    blockers = []
    questions = []
    wip = []

    for f in findings:
        by_status[f.get("status", "?")] += 1
        by_severity[f.get("severity", "?")] += 1
        by_type[f.get("type", "?")] += 1
        if is_blocker(f):
            blockers.append(f)
        if is_question(f) and actionable(f):
            questions.append(f)
        if in_progress(f):
            wip.append(f)

    print("LYRA Session Dashboard")
    print("=" * 50)
    print(f"Total findings: {len(findings)}")
    print()
    valid_statuses = ["open", "accepted", "in_progress", "fixed_pending_verify", "fixed_verified", "deferred", "wont_fix", "duplicate"]
    print("By status:")
    for s in valid_statuses:
        if by_status.get(s, 0) > 0:
            print(f"  {s}: {by_status[s]}")
    # Show any non-standard statuses (pre-cleanup drift)
    for s, count in sorted(by_status.items()):
        if s not in valid_statuses and count > 0:
            print(f"  {s}: {count}  (non-standard -- run cleanup_open_findings.py)")
    print()
    valid_severities = ["blocker", "major", "minor", "nit"]
    print("By severity:")
    for s in valid_severities:
        if by_severity.get(s, 0) > 0:
            print(f"  {s}: {by_severity[s]}")
    for s, count in sorted(by_severity.items()):
        if s not in valid_severities and count > 0:
            print(f"  {s}: {count}  (non-standard -- run cleanup_open_findings.py)")
    print()

    if blockers:
        print(f"!! {len(blockers)} OPEN BLOCKERS -- fix before shipping:")
        for b in blockers:
            print(f"   {b['finding_id']}: {b.get('title', '?')}")
        print()

    if questions:
        print(f"?? {len(questions)} QUESTIONS need your decision:")
        for q in questions:
            print(f"   {q['finding_id']}: {q.get('title', '?')}")
        print()

    if wip:
        print(f">> {len(wip)} findings in progress:")
        for w in wip:
            print(f"   {w['finding_id']}: {w.get('title', '?')}")
        print()


def cmd_triage():
    findings, _ = load_findings()
    todo = sorted([f for f in findings if actionable(f)], key=sort_key)

    if not todo:
        print("Nothing to triage. All findings are resolved, deferred, or in progress.")
        return

    # Split into tiers
    fix_now = [f for f in todo if f.get("priority") == "P0"]
    fix_soon = [f for f in todo if f.get("priority") == "P1" and not is_question(f)]
    questions = [f for f in todo if is_question(f)]
    the_rest = [f for f in todo if f.get("priority") in ("P2", "P3") and not is_question(f)]

    print("LYRA Triage Plan")
    print("=" * 50)
    print()

    if fix_now:
        print(f"FIX NOW ({len(fix_now)} items) -- do these before anything else:")
        print("-" * 50)
        for f in fix_now:
            _print_finding_line(f)
        print()

    if fix_soon:
        limit = min(5, len(fix_soon))
        print(f"FIX THIS SESSION (showing top {limit} of {len(fix_soon)}):")
        print("-" * 50)
        for f in fix_soon[:limit]:
            _print_finding_line(f)
        print()

    if questions:
        print(f"DECIDE ({len(questions)} questions blocking progress):")
        print("-" * 50)
        for f in questions:
            print(f"  {f['finding_id']}")
            print(f"    {f.get('title', '?')}")
            fix = f.get("suggested_fix", {})
            if isinstance(fix, dict):
                approach = fix.get("approach", "")
                if approach:
                    print(f"    Options: {approach[:120]}")
            print()

    if the_rest:
        print(f"LATER ({len(the_rest)} items -- do not touch these today)")
        print()

    total_now = len(fix_now) + min(5, len(fix_soon))
    print(f"Session target: fix {total_now} items, decide {len(questions)} questions, then re-audit and ship.")


def _print_finding_line(f):
    effort = effort_str(f)
    files = affected_files(f)
    file_str = files[0] if files else "?"
    if len(files) > 1:
        file_str += f" (+{len(files)-1})"
    print(f"  {f.get('priority','?')} {f.get('severity','?'):8s} [{effort:7s}] {f['finding_id']}")
    print(f"    {f.get('title', '?')}")
    print(f"    File: {file_str}")
    print()


def cmd_fix(finding_id):
    findings, data = load_findings()
    for f in findings:
        if f["finding_id"] == finding_id:
            if f.get("status") == "in_progress":
                print(f"Already in progress: {finding_id}")
                return
            f["status"] = "in_progress"
            add_history(f, "patch_proposed", "Marked in-progress via session runner.")
            save_findings(data, findings)
            print(f"Marked in_progress: {finding_id}")
            print()
            # Show what to do
            fix = f.get("suggested_fix", {})
            if isinstance(fix, dict):
                print(f"Approach: {fix.get('approach', '?')}")
                print(f"Files: {', '.join(fix.get('affected_files', ['?']))}")
                print(f"Effort: {fix.get('estimated_effort', '?')}")
                tests = fix.get("tests_needed", [])
                if tests:
                    print(f"Tests needed:")
                    for t in tests:
                        print(f"  - {t}")
            print()
            print(f"When done: python3 session.py done {finding_id} [commit_sha]")
            return
    print(f"Finding not found: {finding_id}")


def cmd_done(finding_id, commit=None):
    findings, data = load_findings()
    for f in findings:
        if f["finding_id"] == finding_id:
            f["status"] = "fixed_pending_verify"
            notes = "Fix applied via session runner."
            if commit:
                notes += f" Commit: {commit}"
            add_history(f, "patch_applied", notes, commit=commit)
            save_findings(data, findings)
            print(f"Marked fixed_pending_verify: {finding_id}")
            print()
            # Suggest re-audit
            agent = agent_for_finding(f)
            files = affected_files(f)
            print(f"Re-audit suggestion:")
            print(f"  Agent: {AGENT_PROMPTS.get(agent, agent)}")
            print(f"  Scope: {', '.join(files) if files else 'affected files'}")
            print()
            print("After re-audit, the synthesizer will verify and move to fixed_verified.")
            return
    print(f"Finding not found: {finding_id}")


def cmd_skip(finding_id, reason=None):
    findings, data = load_findings()
    for f in findings:
        if f["finding_id"] == finding_id:
            f["status"] = "deferred"
            notes = reason or "Deferred via session runner. No reason given."
            add_history(f, "deferred", notes)
            save_findings(data, findings)
            print(f"Deferred: {finding_id}")
            if reason:
                print(f"Reason: {reason}")
            return
    print(f"Finding not found: {finding_id}")


def cmd_decide(finding_id, decision):
    findings, data = load_findings()
    for f in findings:
        if f["finding_id"] == finding_id:
            if f.get("type") != "question":
                print(f"Warning: {finding_id} is type '{f.get('type')}', not 'question'. Proceeding anyway.")
            f["status"] = "accepted"
            add_history(f, "note_added", f"Decision: {decision}")
            save_findings(data, findings)
            print(f"Decision recorded for {finding_id}: {decision}")
            print(f"Status moved to 'accepted'. Convert to a concrete fix when ready.")
            return
    print(f"Finding not found: {finding_id}")


def cmd_reaudit():
    findings, _ = load_findings()

    # Collect all files touched by in-progress or recently fixed findings
    touched_files = set()
    agents_needed = set()
    for f in findings:
        if f.get("status") in ("in_progress", "fixed_pending_verify"):
            for path in affected_files(f):
                touched_files.add(path)
            agents_needed.add(agent_for_finding(f))

    if not touched_files and not agents_needed:
        print("No fixes in progress or pending verification. Nothing to re-audit.")
        return

    # Also check file paths against trigger map for additional agents
    for tf in touched_files:
        for pattern, agents in TRIGGER_MAP.items():
            if pattern in tf:
                for a in agents:
                    agents_needed.add(a)

    print("Re-audit Plan")
    print("=" * 50)
    print()
    print("Files touched by fixes:")
    for tf in sorted(touched_files):
        print(f"  {tf}")
    print()
    print("Agents to re-run:")
    for agent in sorted(agents_needed):
        prompt = AGENT_PROMPTS.get(agent, "?")
        print(f"  {agent}: {prompt}")
    print()
    print("After all agents run, run the synthesizer:")
    print(f"  audits/prompts/synthesizer.md")
    print()
    print("Scope hint for agents: focus on these files only, not full codebase.")


def cmd_canship():
    findings, _ = load_findings()

    blockers = [f for f in findings if is_blocker(f)]
    open_questions = [f for f in findings if is_question(f) and actionable(f)]
    in_prog = [f for f in findings if in_progress(f)]
    pending = [f for f in findings if f.get("status") == "fixed_pending_verify"]

    issues = []

    if blockers:
        issues.append(f"{len(blockers)} open blockers")
        for b in blockers:
            issues.append(f"  - {b['finding_id']}: {b.get('title', '?')}")

    if open_questions:
        issues.append(f"{len(open_questions)} undecided questions")
        for q in open_questions:
            issues.append(f"  - {q['finding_id']}: {q.get('title', '?')}")

    if in_prog:
        issues.append(f"{len(in_prog)} fixes still in progress (not yet verified)")

    if pending:
        issues.append(f"{len(pending)} fixes pending verification (run re-audit)")

    if issues:
        print("NOT READY TO SHIP")
        print("=" * 50)
        for i in issues:
            print(f"  {i}")
        print()
        if blockers:
            print("Action: fix blockers first.")
        elif pending:
            print("Action: run re-audit to verify pending fixes.")
        elif open_questions:
            print("Action: decide or defer open questions.")
        elif in_prog:
            print("Action: finish in-progress fixes or defer them.")
    else:
        actionable_count = sum(1 for f in findings if actionable(f))
        total = len(findings)
        print("READY TO SHIP")
        print("=" * 50)
        print(f"  {total} total findings in system")
        print(f"  {actionable_count} still open (none are blockers)")
        print(f"  0 undecided questions")
        print()
        print("Remaining open items are P1+ non-blockers. Safe to deploy.")


def cmd_default():
    """The zero-thought entry point. Just tells you what to do next."""
    findings, _ = load_findings()

    if not findings:
        print("No findings yet. Run your first audit:")
        print("  1. bash audits/setup.sh")
        print("  2. Paste audits/prompts/agent-logic.md into your LLM tool")
        print("  3. Save output to audits/runs/$(date +%Y-%m-%d)/")
        print("  4. Run the synthesizer")
        return

    blockers = [f for f in findings if is_blocker(f)]
    open_questions = [f for f in findings if is_question(f) and actionable(f)]
    in_prog = [f for f in findings if in_progress(f)]
    pending = [f for f in findings if f.get("status") == "fixed_pending_verify"]
    todo = sorted([f for f in findings if actionable(f) and not is_question(f)], key=sort_key)

    print("LYRA -- What To Do Next")
    print("=" * 50)
    print()

    # Step through the decision tree
    if in_prog:
        print(f"You have {len(in_prog)} fix(es) in progress:")
        for f in in_prog:
            print(f"  {f['finding_id']}: {f.get('title','?')}")
        print()
        print("Finish them or defer:")
        print(f"  python3 session.py done <finding_id> [commit]")
        print(f"  python3 session.py skip <finding_id> 'reason'")
        return

    if pending:
        print(f"You have {len(pending)} fix(es) pending verification.")
        print()
        print("Run a targeted re-audit:")
        print(f"  python3 session.py reaudit")
        print()
        print("Then run the synthesizer to verify fixes.")
        return

    if blockers:
        print(f"!! {len(blockers)} BLOCKERS. Fix these first:")
        for b in sorted(blockers, key=sort_key):
            _print_finding_line(b)
        fid = blockers[0]["finding_id"]
        print(f"Start: python3 session.py fix {fid}")
        return

    if open_questions:
        print(f"?? {len(open_questions)} questions need your decision:")
        for q in open_questions:
            print(f"  {q['finding_id']}: {q.get('title', '?')}")
            fix = q.get("suggested_fix", {})
            if isinstance(fix, dict) and fix.get("approach"):
                print(f"    Options: {fix['approach'][:120]}")
        print()
        qid = open_questions[0]["finding_id"]
        print(f"Decide: python3 session.py decide {qid} 'your decision'")
        print(f"Or defer: python3 session.py skip {qid} 'reason'")
        return

    if todo:
        # Show top 3
        top = todo[:3]
        print(f"{len(todo)} findings to work on. Top 3:")
        print()
        for f in top:
            _print_finding_line(f)
        fid = top[0]["finding_id"]
        print(f"Start: python3 session.py fix {fid}")
        print(f"Or see full list: python3 session.py triage")
        return

    # Nothing actionable
    print("All findings are resolved, deferred, or in progress.")
    print()
    cmd_canship()


# --- Main ---

def main():
    if len(sys.argv) < 2:
        cmd_default()
        return

    cmd = sys.argv[1].lower()

    if cmd == "status":
        cmd_status()
    elif cmd == "triage":
        cmd_triage()
    elif cmd == "fix":
        if len(sys.argv) < 3:
            print("Usage: python3 session.py fix <finding_id>")
            sys.exit(1)
        cmd_fix(sys.argv[2])
    elif cmd == "done":
        if len(sys.argv) < 3:
            print("Usage: python3 session.py done <finding_id> [commit_sha]")
            sys.exit(1)
        commit = sys.argv[3] if len(sys.argv) > 3 else None
        cmd_done(sys.argv[2], commit)
    elif cmd == "skip":
        if len(sys.argv) < 3:
            print("Usage: python3 session.py skip <finding_id> [reason]")
            sys.exit(1)
        reason = " ".join(sys.argv[3:]) if len(sys.argv) > 3 else None
        cmd_skip(sys.argv[2], reason)
    elif cmd == "decide":
        if len(sys.argv) < 4:
            print("Usage: python3 session.py decide <finding_id> <decision>")
            sys.exit(1)
        decision = " ".join(sys.argv[3:])
        cmd_decide(sys.argv[2], decision)
    elif cmd == "reaudit":
        cmd_reaudit()
    elif cmd == "canship":
        cmd_canship()
    elif cmd == "help":
        print(__doc__)
    else:
        print(f"Unknown command: {cmd}")
        print("Run 'python3 session.py help' for usage.")
        sys.exit(1)


if __name__ == "__main__":
    main()
