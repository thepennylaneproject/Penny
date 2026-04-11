#!/usr/bin/env python3
"""
LYRA Session Runner v2.0

One script for the entire audit-fix-ship cycle. Reduces cognitive load to:
  1. Run this script
  2. Do what it says
  3. Run it again when done
  4. Ship when it says you can

Usage:
  python3 audits/session.py                  # Show what to do next
  python3 audits/session.py triage           # Show prioritized fix list
  python3 audits/session.py fix <finding_id> # Mark a finding as in-progress
  python3 audits/session.py done <finding_id> [commit_sha]  # Mark fix applied
  python3 audits/session.py skip <finding_id> [reason]      # Defer a finding
  python3 audits/session.py reaudit          # Show which agents to re-run
  python3 audits/session.py preflight        # Run lint/typecheck/test/build → audits/artifacts/_run_/
  python3 audits/session.py audit-batch      # Preflight + re-audit plan + one batched checklist file
  python3 audits/session.py audit-batch --full   # Same, but all 6 agents + monorepo scope (no WIP required)
  python3 audits/session.py audit-batch --skip-preflight  # Plan + checklist only (reuse last artifacts)
  python3 audits/session.py ingest-synth audits/runs/<date>/synthesized-<id>.json [--strict]  # Merge synth JSON → open_findings + case files + index (--strict fails if fixed_pending_verify IDs omitted)
  python3 audits/session.py verify <finding_id>  # Mark re-audit passed (fixed_pending_verify -> fixed_verified)
  python3 audits/session.py prune-closed [--dry-run]  # Drop terminal findings from open_findings.json (case .md kept)
  python3 audits/session.py status           # Full dashboard
  python3 audits/session.py canship          # Am I ready to deploy?
  python3 audits/session.py decide <finding_id> <decision>  # Answer a question finding
  python3 audits/session.py init                            # Generate audits/project.toml with auto-detected paths
"""

import json
import sys
import os
import shutil
import subprocess
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

# Stable order for batched checklists and terminal output
AGENT_ORDER = ["logic", "data", "ux", "performance", "security", "deploy"]

# Removed from open_findings.json by prune-closed (history remains in audits/findings/*.md and run JSON).
PRUNE_CLOSED_STATUSES = frozenset(
    {"fixed_verified", "wont_fix", "duplicate", "converted_to_enhancement"}
)

# Default trigger map — used when project.toml is absent.
# Maps path prefixes to which agents should re-run when those paths change.
# When project.toml exists, this is rebuilt from [paths.*] sections so it
# always matches the actual project layout.
DEFAULT_TRIGGER_MAP = {
    "src/": ["logic", "ux"],
    "lib/": ["logic"],
    "app/": ["logic", "ux"],
    "pages/": ["ux", "logic"],
    "server/": ["logic", "data", "security"],
    "api/": ["logic", "data", "security"],
    "backend/": ["logic", "data", "security"],
    "frontend/": ["logic", "ux", "performance"],
    "apps/": ["logic", "ux", "data"],
    "packages/": ["logic", "performance"],
    "services/": ["logic", "data"],
    "supabase/migrations/": ["data", "security"],
    "supabase/": ["data"],
    "netlify/functions/": ["logic", "data", "security"],
    "infra/": ["deploy", "security"],
    ".env": ["security", "deploy"],
    "package.json": ["deploy", "performance"],
    "vite.config": ["deploy", "performance"],
    "next.config": ["deploy", "performance"],
    "netlify.toml": ["deploy"],
    ".github/workflows/": ["deploy"],
    "tsconfig": ["deploy"],
    "docker": ["deploy"],
    "Dockerfile": ["deploy"],
}

# --- Project config ---

def _try_load_toml(path):
    """Load a TOML file. Uses tomllib (3.11+) or falls back to a minimal parser."""
    try:
        import tomllib
    except ImportError:
        try:
            import tomli as tomllib  # pip install tomli for <3.11
        except ImportError:
            return None
    if not os.path.isfile(path):
        return None
    with open(path, "rb") as f:
        return tomllib.load(f)


def load_project_config():
    """Load audits/project.toml from repo root. Returns dict or None."""
    root = repo_root()
    for candidate in ("audits/project.toml", "lyra.toml"):
        cfg = _try_load_toml(os.path.join(root, candidate))
        if cfg is not None:
            return cfg
    return None


def build_trigger_map(config):
    """Build trigger map from project.toml [paths.*] sections, or use defaults."""
    if config is None:
        return DEFAULT_TRIGGER_MAP
    paths = config.get("paths", {})
    if not paths:
        return DEFAULT_TRIGGER_MAP
    tmap = {}
    for agent_name, agent_paths in paths.items():
        if not isinstance(agent_paths, dict):
            continue
        for _key, val in agent_paths.items():
            entries = val if isinstance(val, list) else [val]
            for entry in entries:
                # Strip trailing glob for prefix matching
                prefix = entry.rstrip("*").rstrip("/")
                if prefix:
                    existing = tmap.get(prefix, [])
                    if agent_name not in existing:
                        existing.append(agent_name)
                    tmap[prefix] = existing
    # Merge with defaults for common config files
    for key in (".env", "package.json", "tsconfig", ".github/workflows/",
                "docker", "Dockerfile", "netlify.toml"):
        if key not in tmap:
            tmap[key] = DEFAULT_TRIGGER_MAP.get(key, ["deploy"])
    return tmap


def get_agent_paths(config, agent_name):
    """Return the list of paths for a given agent from project.toml, or empty list."""
    if config is None:
        return []
    paths = config.get("paths", {}).get(agent_name, {})
    result = []
    for _key, val in paths.items():
        if isinstance(val, list):
            result.extend(val)
        elif isinstance(val, str) and val:
            result.append(val)
    return result


def get_preflight_config(config):
    """Return preflight commands + cwd from project.toml, or detect defaults."""
    defaults = {
        "lint": None,
        "typecheck": None,
        "test": None,
        "build": None,
        "cwd": "",
    }
    if config and "preflight" in config:
        pf = config["preflight"]
        for key in ("lint", "typecheck", "test", "build", "cwd"):
            if key in pf and pf[key]:
                defaults[key] = pf[key]
        return defaults

    # Auto-detect: find the first directory with a package.json
    root = repo_root()
    # Check for apps/dashboard (Turbo monorepo pattern)
    dash = os.path.join(root, "apps", "dashboard")
    if os.path.isdir(dash) and os.path.isfile(os.path.join(dash, "package.json")):
        pkg = "pnpm" if os.path.isfile(os.path.join(root, "pnpm-lock.yaml")) else "npm"
        defaults["cwd"] = dash
        for key in ("lint", "typecheck", "test", "build"):
            defaults[key] = f"{pkg} run {key}"
        return defaults
    # Check for frontend/ subdirectory
    fe = os.path.join(root, "frontend")
    if os.path.isdir(fe) and os.path.isfile(os.path.join(fe, "package.json")):
        pkg = "pnpm" if os.path.isfile(os.path.join(root, "pnpm-lock.yaml")) else "npm"
        defaults["cwd"] = fe
        for key in ("lint", "typecheck", "test", "build"):
            defaults[key] = f"{pkg} run {key}"
        return defaults
    # Fallback: repo root
    pkg = "pnpm" if os.path.isfile(os.path.join(root, "pnpm-lock.yaml")) else "npm"
    for key in ("lint", "typecheck", "test", "build"):
        defaults[key] = f"{pkg} run {key}"
    return defaults


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


def is_open_question(f):
    return is_question(f) and f.get("status") == "open"


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


def repo_root():
    """Repo root (parent of audits/)."""
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def git_changed_paths():
    """Paths changed vs HEAD. Empty if not a git checkout or on error."""
    root = repo_root()
    try:
        r = subprocess.run(
            ["git", "diff", "--name-only", "HEAD"],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=120,
        )
        if r.returncode != 0:
            return []
        return [line.strip() for line in r.stdout.splitlines() if line.strip()]
    except (OSError, subprocess.TimeoutExpired, FileNotFoundError):
        return []


def full_scope_focus_paths():
    """
    Globs for audit-batch --full: probe repo root so Lane (backend/, frontend/) and
    generic monorepos (apps/, packages/) both get real trees, not only absent paths.
    """
    root = repo_root()
    dir_globs = []
    for name in (
        "backend",
        "frontend",
        "apps",
        "packages",
        "services",
        "supabase",
        "repair_engine",
        "infra",
    ):
        if os.path.isdir(os.path.join(root, name)):
            dir_globs.append(f"{name}/**")

    root_files = [
        "package.json",
        "package-lock.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "turbo.json",
    ]
    touched = dir_globs + [f for f in root_files if os.path.isfile(os.path.join(root, f))]
    gh = os.path.join(root, ".github", "workflows")
    if os.path.isdir(gh):
        touched.append(".github/workflows/**")
    return touched


def collect_reaudit_plan(full_scope=False):
    """
    full_scope: all six agents + monorepo path hints (deep audit), no WIP required.
    Otherwise: paths from in_progress / fixed_pending_verify findings, plus git diff
    vs HEAD when any such finding exists, merged with TRIGGER_MAP.
    """
    if full_scope:
        touched = full_scope_focus_paths()
        return {
            "touched_files": touched,
            "agents_needed": [a for a in AGENT_ORDER if a in AGENT_PROMPTS],
            "has_wip": False,
            "full_scope": True,
        }

    findings, _ = load_findings()
    touched_files = set()
    agents_needed = set()
    has_wip = False

    for f in findings:
        if f.get("status") in ("in_progress", "fixed_pending_verify"):
            has_wip = True
            for path in affected_files(f):
                if path:
                    touched_files.add(path)
            agents_needed.add(agent_for_finding(f))

    if has_wip:
        for p in git_changed_paths():
            touched_files.add(p)

    config = load_project_config()
    trigger_map = build_trigger_map(config)

    for tf in list(touched_files):
        for pattern, agents in trigger_map.items():
            if pattern in tf:
                for a in agents:
                    agents_needed.add(a)

    agents_sorted = [a for a in AGENT_ORDER if a in agents_needed]
    for a in sorted(agents_needed):
        if a not in agents_sorted:
            agents_sorted.append(a)

    return {
        "touched_files": sorted(touched_files),
        "agents_needed": agents_sorted,
        "has_wip": has_wip,
        "full_scope": False,
    }


def cmd_preflight():
    """Run lint, typecheck, test, build into audits/artifacts/_run_/."""
    root = repo_root()
    art = os.path.join(root, "audits", "artifacts", "_run_")
    os.makedirs(art, exist_ok=True)
    config = load_project_config()
    pf = get_preflight_config(config)
    cwd = pf["cwd"] if pf["cwd"] else root

    steps = [
        ("lint", pf["lint"]),
        ("typecheck", pf["typecheck"]),
        ("tests", pf["test"]),
        ("build", pf["build"]),
    ]
    print(f"Preflight ({cwd}) → audits/artifacts/_run_/")
    print("=" * 50)
    for name, cmd_str in steps:
        if not cmd_str:
            print(f"  {name}: skipped (not configured)")
            continue
        log = os.path.join(art, f"{name}.txt")
        try:
            with open(log, "w", encoding="utf-8") as fp:
                p = subprocess.run(
                    cmd_str,
                    shell=True,
                    cwd=cwd,
                    stdout=fp,
                    stderr=subprocess.STDOUT,
                    timeout=900,
                )
            status = "ok" if p.returncode == 0 else f"exit {p.returncode}"
            print(f"  {name}: {status}  → {log}")
        except (OSError, subprocess.TimeoutExpired) as e:
            print(f"  {name}: FAILED ({e})  → {log}")


def cmd_audit_batch(skip_preflight=False, full_scope=False):
    """
    One-shot: optional preflight, re-audit plan, and a single markdown file you can
    paste into an AI session (ordered agent prompts + run_id convention + paths).
    """
    root = repo_root()
    if not skip_preflight:
        cmd_preflight()
        print()

    plan = collect_reaudit_plan(full_scope=full_scope)
    touched = plan["touched_files"]
    agents = plan["agents_needed"]

    if not agents and not full_scope:
        print("audit-batch: No in-progress / fixed_pending_verify findings and no --full.")
        print("  Run: python3 audits/session.py audit-batch --full")
        print("  Or mark fixes in progress: python3 audits/session.py fix <id>")
        return

    batch_dir = os.path.join(root, "audits", "artifacts", "_batch")
    os.makedirs(batch_dir, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%SZ")
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    path_out = os.path.join(batch_dir, f"audit-batch-{stamp}.md")
    latest = os.path.join(batch_dir, "LATEST.md")

    run_ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    lines = [
        "# LYRA audit batch",
        "",
        f"- Generated: `{stamp}` (UTC)",
        f"- Scope: **{'full monorepo' if full_scope else 'WIP / git + triggers'}**",
        "",
        "## Preflight artifacts",
        "",
        "Read these in agents that ask for them:",
        "",
        "- `audits/artifacts/_run_/lint.txt`",
        "- `audits/artifacts/_run_/typecheck.txt`",
        "- `audits/artifacts/_run_/tests.txt`",
        "- `audits/artifacts/_run_/build.txt`",
        "",
        "(If you used `--skip-preflight`, re-run `python3 audits/session.py preflight` first.)",
        "",
        "## Focus paths",
        "",
    ]
    if touched:
        for p in touched:
            lines.append(f"- `{p}`")
    else:
        lines.append("- _(none — use repo-wide prompts)_")
    lines.extend(
        [
            "",
            "## Run IDs (UTC)",
            "",
            f"- Date folder: `audits/runs/{day}/`",
            f"- Example stem: `{run_ts}` → `logic-{run_ts}`, `data-{run_ts}`, …",
            "",
            "## Agent checklist (run in order; JSON only per prompt)",
            "",
        ]
    )
    step = 1
    config = load_project_config()
    for a in agents:
        prompt = AGENT_PROMPTS.get(a, "?")
        suite = a if a != "performance" else "perf"
        agent_paths = get_agent_paths(config, a)
        path_hint = ""
        if agent_paths:
            path_hint = "  Paths: " + ", ".join(f"`{p}`" for p in agent_paths[:6])
        lines.append(f"{step}. **{a}** — read `{prompt}`, write `{suite}-{run_ts}.json`{path_hint}")
        step += 1
    lines.extend(
        [
            "",
            f"{step}. **synthesizer** — read `audits/prompts/synthesizer.md`, merge all agent JSON above, write `synthesized-{run_ts}.json`",
            "",
            f"{step + 1}. **canonical merge** — `python3 audits/session.py ingest-synth audits/runs/{day}/synthesized-{run_ts}.json --strict`  _(updates `open_findings.json`, `findings/*.md` for new IDs, `index.json`; fails if carry-forward contract is violated)_",
            "",
            "## One-block prompt (paste into Cursor / ChatGPT)",
            "",
            "Audit pass: do not edit application source code. For each agent prompt below, read the prompt file and emit exactly one JSON object per LYRA output contract. Use preflight artifacts under `audits/artifacts/_run_/`, read `audits/open_findings.json`, and focus on the paths listed under Focus paths. Save agent and synthesizer JSON under `audits/runs/<YYYY-MM-DD>/` with the run_id format shown in each prompt. After the synthesizer JSON is saved, run the **ingest-synth** command from the checklist so canonical audit files update.",
            "",
        ]
    )
    for a in agents:
        prompt = AGENT_PROMPTS.get(a, "?")
        lines.append(f"- `{prompt}`")
    lines.append("- `audits/prompts/synthesizer.md`")
    lines.append("")
    lines.append("---")
    lines.append("")
    body = "\n".join(lines)
    with open(path_out, "w", encoding="utf-8") as f:
        f.write(body)
    with open(latest, "w", encoding="utf-8") as f:
        f.write(body)

    print("Batched checklist written:")
    print(f"  {path_out}")
    print(f"  → {latest}  (symlink-style duplicate for easy open)")
    print()
    print("Agents:", ", ".join(agents))
    print("Files:", len(touched), "path(s)")


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
    questions = [f for f in todo if is_open_question(f)]
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
            print("After re-audit: merge the synthesizer JSON into canonical state:")
            print("  python3 audits/session.py ingest-synth audits/runs/<YYYY-MM-DD>/synthesized-<id>.json")
            print("Or mark verified without a full merge:")
            print(f"  python3 audits/session.py verify {finding_id}")
            print()
            print("Push to Linear:  python3 audits/linear_sync.py push")
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
            print("Push to Linear:  python3 audits/linear_sync.py push")
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
    plan = collect_reaudit_plan(full_scope=False)
    touched_files = plan["touched_files"]
    agents_needed = plan["agents_needed"]

    if not touched_files and not agents_needed:
        print("No fixes in progress or pending verification. Nothing to re-audit.")
        print("Tip: full deep checklist →  python3 audits/session.py audit-batch --full")
        return

    print("Re-audit Plan")
    print("=" * 50)
    print()
    print("Files touched by fixes (and git vs HEAD when WIP):")
    for tf in touched_files:
        print(f"  {tf}")
    print()
    print("Agents to re-run:")
    for agent in agents_needed:
        prompt = AGENT_PROMPTS.get(agent, "?")
        print(f"  {agent}: {prompt}")
    print()
    print("After all agents run, run the synthesizer:")
    print("  audits/prompts/synthesizer.md")
    print()
    print("Batched checklist (preflight + paste-ready prompts):")
    print("  python3 audits/session.py audit-batch")
    print()
    print("Scope hint for agents: focus on these files only, not full codebase.")
    print()
    print("To clear 'pending verification' without a full synthesizer merge:")
    print("  python3 audits/session.py verify <finding_id>")
    print("  (after you have confirmed the fix in code/tests — same bar as synthesizer would use.)")


def cmd_verify(finding_id):
    """Advance fixed_pending_verify -> fixed_verified after human/small re-audit confirms the fix.

    Full LYRA still expects the synthesizer to merge canonical state; this command
    unblocks session.py when you have verified manually but have not reapplied synth JSON.
    """
    findings, data = load_findings()
    for f in findings:
        if f["finding_id"] != finding_id:
            continue
        if f.get("status") != "fixed_pending_verify":
            print(
                f"Cannot verify {finding_id}: status is {f.get('status')!r}, "
                "expected 'fixed_pending_verify'."
            )
            print("Use 'done' after fixing, or 'fix' / 'skip' as appropriate.")
            return
        f["status"] = "fixed_verified"
        add_history(
            f,
            "verified",
            "Marked fixed_verified via session runner after re-audit confirmation.",
        )
        save_findings(data, findings)
        print(f"Verified: {finding_id} -> fixed_verified")
        print()
        print("Optional: push status to Linear (maps to Done):")
        print("  python3 audits/linear_sync.py push")
        return
    print(f"Finding not found: {finding_id}")


def cmd_canship():
    findings, _ = load_findings()

    blockers = [f for f in findings if is_blocker(f)]
    open_questions = [f for f in findings if is_open_question(f)]
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


def cmd_prune_closed(dry_run: bool = False):
    """Remove terminal-status rows from open_findings.json; keep audits/findings/*.md as archive."""
    findings, data = load_findings()
    if not findings:
        print("No findings to prune.")
        return

    pruned = [f for f in findings if f.get("status") in PRUNE_CLOSED_STATUSES]
    kept = [f for f in findings if f.get("status") not in PRUNE_CLOSED_STATUSES]
    pruned_ids = {f["finding_id"] for f in pruned}
    kept_ids = {f["finding_id"] for f in kept}

    for f in kept:
        rel = f.get("related_ids")
        if not rel:
            continue
        new_rel = [r for r in rel if r in kept_ids]
        if new_rel != rel:
            f["related_ids"] = new_rel

    print(f"Prune-closed ({'DRY RUN' if dry_run else 'live'})")
    print(f"  Ledger rows: {len(findings)} -> {len(kept)} (removing {len(pruned)} terminal)")
    if pruned:
        for f in sorted(pruned, key=lambda x: x.get("finding_id", "")):
            print(f"    - {f.get('finding_id')}: {f.get('status')} — {f.get('title', '')[:70]}")
    print()

    if not pruned_ids:
        print("Nothing to prune — no fixed_verified / wont_fix / duplicate / converted_to_enhancement rows.")
        return

    if dry_run:
        print("Dry run complete. Run without --dry-run to write open_findings.json.")
        print("Afterward: python3 audits/linear_sync.py prune   # drop orphan Linear map entries")
        return

    backup = OPEN_FINDINGS + ".pre-prune.bak"
    shutil.copy2(OPEN_FINDINGS, backup)
    print(f"Backup: {backup}")

    data["prune_closed_applied"] = NOW
    save_findings(data, kept)
    print(f"Written: {OPEN_FINDINGS} ({len(kept)} rows)")
    print("Next: python3 audits/linear_sync.py prune   # if you use Linear sync")


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
    open_questions = [f for f in findings if is_open_question(f)]
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
        for f in pending:
            print(f"  {f['finding_id']}: {f.get('title', '?')}")
        print()
        print("Re-audit + synthesizer, then apply canonical merge:")
        print("  python3 audits/session.py reaudit")
        print("  # agents → synthesizer JSON → ingest:")
        print("  python3 audits/session.py ingest-synth audits/runs/<YYYY-MM-DD>/synthesized-<id>.json")
        print()
        print("Or, if you already confirmed fixes (tests/code review), mark verified:")
        print("  python3 audits/session.py verify <finding_id>")
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

def cmd_init():
    """Generate audits/project.toml with auto-detected values for this repo."""
    root = repo_root()
    out = os.path.join(root, "audits", "project.toml")
    if os.path.isfile(out):
        print(f"Already exists: {out}")
        print("Delete it first if you want to regenerate.")
        return

    # Detect project name from directory
    name = os.path.basename(root).lower().replace(" ", "-")

    # Detect package manager
    if os.path.isfile(os.path.join(root, "pnpm-lock.yaml")):
        pkg = "pnpm"
    elif os.path.isfile(os.path.join(root, "yarn.lock")):
        pkg = "yarn"
    else:
        pkg = "npm"

    # Detect preflight cwd
    cwd = ""
    for candidate in ("apps/dashboard", "frontend"):
        d = os.path.join(root, candidate)
        if os.path.isdir(d) and os.path.isfile(os.path.join(d, "package.json")):
            cwd = candidate
            break

    # Detect source directories
    detected_dirs = []
    for d in ("backend", "frontend", "src", "lib", "app", "apps", "packages",
              "services", "server", "api", "supabase", "infra", ".github/workflows"):
        if os.path.isdir(os.path.join(root, d)):
            detected_dirs.append(d)

    # Detect stack from files present
    stack_hints = []
    for marker, hint in [
        ("next.config.js", "Next.js"), ("next.config.ts", "Next.js"), ("next.config.mjs", "Next.js"),
        ("vite.config.ts", "Vite"), ("vite.config.js", "Vite"),
        ("requirements.txt", "Python"), ("pyproject.toml", "Python"),
        ("supabase/config.toml", "Supabase"),
        ("turbo.json", "Turborepo"),
        ("netlify.toml", "Netlify"),
    ]:
        if os.path.isfile(os.path.join(root, marker)):
            stack_hints.append(hint)
    stack = " + ".join(dict.fromkeys(stack_hints))  # dedupe preserving order

    lines = [
        f'# audits/project.toml — LYRA project config for {name}',
        f'# Generated by: python3 audits/session.py init',
        f'# Detected directories: {", ".join(detected_dirs) or "none"}',
        '',
        '[project]',
        f'name = "{name}"',
        f'description = ""',
        f'stack = "{stack}"',
        '',
        '[preflight]',
        f'lint = "{pkg} run lint"',
        f'typecheck = "{pkg} run typecheck"',
        f'test = "{pkg} run test"',
        f'build = "{pkg} run build"',
        f'cwd = "{cwd}"',
        '',
        '# --- Agent paths ---',
        '# Fill in the paths each agent should examine in YOUR repo.',
        '# Use globs. session.py verifies they exist before including them.',
        '# Leave arrays empty to let session.py auto-detect.',
        '',
        '[paths.logic]',
        f'source = {_toml_array([f"{d}/**" for d in detected_dirs if d in ("backend", "frontend", "src", "apps", "packages", "services", "lib", "app", "server", "api")])}',
        f'config = {_toml_array([f for f in ("package.json", "tsconfig.json") if os.path.isfile(os.path.join(root, f))])}',
        '',
        '[paths.data]',
        f'migrations = {_toml_array([f"{d}/migrations/**" for d in detected_dirs if d == "supabase"] or [])}',
        'types = []',
        'validation = []',
        'writers = []',
        '',
        '[paths.ux]',
        f'ui = {_toml_array([f"{d}/**" for d in detected_dirs if d in ("frontend", "src", "apps")])}',
        'styles = []',
        'i18n = []',
        '',
        '[paths.performance]',
        'queries = []',
        'fetching = []',
        f'build_config = {_toml_array([f for f in ("package.json", "vite.config.ts", "next.config.ts", "next.config.js") if os.path.isfile(os.path.join(root, f))])}',
        '',
        '[paths.security]',
        'auth = []',
        'endpoints = []',
        f'env = {_toml_array([".env.example"] if os.path.isfile(os.path.join(root, ".env.example")) else [])}',
        '',
        '[paths.deploy]',
        f'build = {_toml_array([f for f in ("vite.config.ts", "next.config.ts", "next.config.js") if os.path.isfile(os.path.join(root, f))])}',
        f'ci = {_toml_array([".github/workflows/**"] if os.path.isdir(os.path.join(root, ".github/workflows")) else [])}',
        f'infra = {_toml_array([f"{d}/**" for d in detected_dirs if d == "infra"])}',
        'logging = []',
        '',
        '[paths.visual]',
        f'ui = {_toml_array([f"{d}/**" for d in detected_dirs if d in ("frontend", "src", "apps")])}',
        'styles = []',
        'config = []',
        '',
        '[integrations.linear]',
        'api_key_env = "LINEAR_API_KEY"',
        'team_id_env = "LINEAR_TEAM_ID"',
        'project_id_env = "LINEAR_PROJECT_ID"',
        'label_ids_env = "LINEAR_LABEL_IDS"',
    ]
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"Created: {out}")
    print(f"Edit the [paths.*] sections to match your repo layout.")
    print(f"Detected: {pkg} package manager, {len(detected_dirs)} source dir(s)")


def _toml_array(items):
    """Format a Python list as a TOML inline array."""
    if not items:
        return "[]"
    return "[" + ", ".join(f'"{i}"' for i in items) + "]"


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
    elif cmd == "preflight":
        cmd_preflight()
    elif cmd == "audit-batch":
        rest = [a.lower() for a in sys.argv[2:]]
        skip = "--skip-preflight" in rest or "--no-preflight" in rest
        full = "--full" in rest
        cmd_audit_batch(skip_preflight=skip, full_scope=full)
    elif cmd in ("ingest-synth", "ingest-synthesizer"):
        args = sys.argv[2:]
        if not args:
            print(
                "Usage: python3 audits/session.py ingest-synth "
                "<path/to/synthesized-*.json> [--strict]"
            )
            sys.exit(1)
        strict = False
        if args[-1] == "--strict":
            strict = True
            args = args[:-1]
        if len(args) != 1:
            print(
                "Usage: python3 audits/session.py ingest-synth "
                "<path/to/synthesized-*.json> [--strict]"
            )
            sys.exit(1)
        ingest_mod = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ingest_synthesizer.py")
        cmd_line = [sys.executable, ingest_mod, args[0]]
        if strict:
            cmd_line.append("--strict")
        r = subprocess.run(cmd_line, cwd=repo_root())
        sys.exit(r.returncode)
    elif cmd == "verify":
        if len(sys.argv) < 3:
            print("Usage: python3 session.py verify <finding_id>")
            sys.exit(1)
        cmd_verify(sys.argv[2])
    elif cmd in ("prune-closed", "prune_closed"):
        dry = "--dry-run" in sys.argv or "-n" in sys.argv
        cmd_prune_closed(dry_run=dry)
    elif cmd == "canship":
        cmd_canship()
    elif cmd == "init":
        cmd_init()
    elif cmd == "help":
        print(__doc__)
    else:
        print(f"Unknown command: {cmd}")
        print("Run 'python3 session.py help' for usage.")
        sys.exit(1)


if __name__ == "__main__":
    main()
