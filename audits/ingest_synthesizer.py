#!/usr/bin/env python3
"""
Merge a LYRA synthesizer_output JSON into canonical audit state.

Updates:
  - audits/open_findings.json (history append + new rows + root last_updated / run_id)
  - audits/index.json (prepends synthesizer + agent runs from the same batch if missing)
  - audits/findings/<finding_id>.md for NEW finding IDs only (minimal case file from JSON)

Usage:
  python3 audits/ingest_synthesizer.py <path/to/synthesized-*.json> [--strict]
  python3 audits/session.py ingest-synth <path/to/synthesized-*.json> [--strict]

  --strict  Exit with code 1 if any finding still fixed_pending_verify in
            open_findings.json is missing from the synthesizer findings array
            (partial merge would leave verification stale).
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def repo_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _history_key(h: dict) -> tuple:
    return (h.get("timestamp"), h.get("actor"), h.get("event"), h.get("notes"))


def _ensure_finding_defaults(f: dict) -> dict:
    out = dict(f)
    if not out.get("description"):
        out["description"] = out.get("title", "")
    if "impact" not in out:
        out["impact"] = ""
    if "suggested_fix" not in out:
        out["suggested_fix"] = {
            "approach": "See synthesizer / agent notes.",
            "affected_files": [],
            "estimated_effort": "small",
            "tests_needed": [],
        }
    return out


def _render_case_file(f: dict, synth_run_id: str) -> str:
    """Markdown case file for a new finding (matches existing audits/findings style)."""
    fx = f.get("suggested_fix") or {}
    aff = fx.get("affected_files") or []
    aff_line = ", ".join(f"`{p}`" for p in aff) if aff else "—"
    hooks = f.get("proof_hooks") or []
    hook_lines = []
    for h in hooks:
        ht = h.get("hook_type", "?")
        sm = h.get("summary", "")
        hook_lines.append(f"- **[{ht}]** {sm}")
    hooks_block = "\n".join(hook_lines) if hook_lines else "- _(see JSON in open_findings.json)_"
    hist = f.get("history") or []
    hist_lines = []
    for h in hist:
        hist_lines.append(
            f"- {h.get('timestamp')} — **{h.get('actor')}** — {h.get('event')}"
            + (f": {h.get('notes')}" if h.get("notes") else "")
        )
    history_block = "\n".join(hist_lines) if hist_lines else f"- {NOW} — **ingest_synthesizer** — created"

    return f"""# Finding: {f["finding_id"]}

> **Status:** {f.get("status", "open")} | **Severity:** {f.get("severity", "?")} | **Priority:** {f.get("priority", "?")} | **Type:** {f.get("type", "?")} | **Confidence:** {f.get("confidence", "?")}

## Title

{f.get("title", "")}

## Description

{f.get("description", "").strip()}

## Impact

{f.get("impact", "").strip() or "—"}

## Suggested fix

{fx.get("approach", "—")}

**Affected files:** {aff_line}

## Proof hooks

{hooks_block}

## History

{history_block}

---
*Last canonical synthesizer run: `{synth_run_id}`*
"""


def _pending_verify_ids(findings: list) -> set[str]:
    return {f["finding_id"] for f in findings if f.get("status") == "fixed_pending_verify"}


def _synth_finding_ids(synth: dict) -> set[str]:
    out: set[str] = set()
    for sf in synth.get("findings", []) or []:
        fid = sf.get("finding_id")
        if fid:
            out.add(fid)
    return out


def _check_pending_verify_coverage(
    prior_findings: list, synth: dict, *, strict: bool
) -> None:
    pending = _pending_verify_ids(prior_findings)
    if not pending:
        return
    synth_ids = _synth_finding_ids(synth)
    missing = sorted(pending - synth_ids)
    if not missing:
        return
    lines = [
        "ingest_synthesizer: synthesizer output omits "
        f"{len(missing)} finding(s) still fixed_pending_verify in open_findings.json:",
        *(f"  - {fid}" for fid in missing),
        "Carry each ID in synthesizer findings (see audits/prompts/synthesizer.md Step 4/6) "
        "or mark verified manually (session.py verify).",
    ]
    msg = "\n".join(lines)
    if strict:
        print(msg, file=sys.stderr)
        sys.exit(1)
    print(msg, file=sys.stderr)


def _index_prepend_synthesizer(index_path: str, synth: dict, synth_rel_path: str) -> None:
    """If audits/index.json lacks this synthesizer run_id, prepend one row (idempotent)."""
    run_id = synth.get("run_id")
    if not run_id:
        return
    with open(index_path, encoding="utf-8") as fp:
        data = json.load(fp)
    runs = data.setdefault("runs", [])
    if any(r.get("run_id") == run_id for r in runs):
        return

    suites = ["logic", "data", "ux", "performance", "security", "deploy"]
    root = repo_root()
    day_folder = ""
    parts = synth_rel_path.replace("\\", "/").split("/")
    if "runs" in parts:
        i = parts.index("runs")
        if i + 1 < len(parts):
            day_folder = parts[i + 1]
    stem = run_id.removeprefix("synthesized-")
    present_suites = []
    for suite, prefix in (
        ("logic", "logic"),
        ("data", "data"),
        ("ux", "ux"),
        ("performance", "perf"),
        ("security", "security"),
        ("deploy", "deploy"),
    ):
        agent_id = f"{prefix}-{stem}"
        art = f"audits/runs/{day_folder}/{agent_id}.json"
        if day_folder and os.path.isfile(os.path.join(root, art)):
            present_suites.append(suite)

    row = {
        "run_id": run_id,
        "kind": "synthesizer_output",
        "timestamp": NOW,
        "artifact": synth_rel_path.replace("\\", "/"),
        "source_suites": present_suites or suites,
    }
    data["runs"] = [row] + runs
    with open(index_path, "w", encoding="utf-8") as fp:
        json.dump(data, fp, indent=2)
        fp.write("\n")
    print(f"Prepended synthesizer row to {index_path}")


def ingest(synth_path: str, *, strict: bool = False) -> None:
    root = repo_root()
    synth_path = os.path.normpath(os.path.join(root, synth_path))
    if not os.path.isfile(synth_path):
        print(f"Not found: {synth_path}", file=sys.stderr)
        sys.exit(1)

    with open(synth_path, encoding="utf-8") as fp:
        synth = json.load(fp)

    if synth.get("kind") != "synthesizer_output":
        print("JSON kind must be synthesizer_output", file=sys.stderr)
        sys.exit(1)

    open_path = os.path.join(root, "audits", "open_findings.json")
    findings_dir = os.path.join(root, "audits", "findings")
    index_path = os.path.join(root, "audits", "index.json")

    with open(open_path, encoding="utf-8") as fp:
        data = json.load(fp)

    key = "open_findings" if "open_findings" in data else "findings"
    findings: list = data[key]
    by_id = {f["finding_id"]: f for f in findings}

    _check_pending_verify_coverage(findings, synth, strict=strict)

    synth_run_id = synth.get("run_id", "unknown")
    new_ids: list[str] = []

    for sf in synth.get("findings", []):
        fid = sf.get("finding_id")
        if not fid:
            continue
        hist_incoming = sf.get("history") or []
        if fid in by_id:
            cur = by_id[fid]
            seen = {_history_key(h) for h in cur.get("history", [])}
            for h in hist_incoming:
                if _history_key(h) not in seen:
                    cur.setdefault("history", []).append(h)
                    seen.add(_history_key(h))
            # Refresh ledger fields from synthesizer when provided (full finding objects expected).
            for field in (
                "status",
                "title",
                "description",
                "category",
                "severity",
                "priority",
                "type",
                "confidence",
                "impact",
            ):
                if field in sf and sf[field] is not None and sf[field] != "":
                    cur[field] = sf[field]
            if sf.get("proof_hooks"):
                cur["proof_hooks"] = sf["proof_hooks"]
            if sf.get("suggested_fix") is not None:
                cur["suggested_fix"] = sf["suggested_fix"]
        else:
            nf = _ensure_finding_defaults(sf)
            findings.append(nf)
            by_id[fid] = nf
            new_ids.append(fid)

    data["last_updated"] = NOW
    data["run_id"] = synth_run_id
    with open(open_path, "w", encoding="utf-8") as fp:
        json.dump(data, fp, indent=2)
        fp.write("\n")

    os.makedirs(findings_dir, exist_ok=True)
    for fid in new_ids:
        md_path = os.path.join(findings_dir, f"{fid}.md")
        if os.path.isfile(md_path):
            print(f"Case file exists, skip: {md_path}")
            continue
        body = _render_case_file(by_id[fid], synth_run_id)
        with open(md_path, "w", encoding="utf-8") as fp:
            fp.write(body)
        print(f"Wrote {md_path}")

    _index_prepend_synthesizer(
        index_path,
        synth,
        os.path.relpath(synth_path, root),
    )

    print(f"Merged {len(synth.get('findings', []))} synthesizer finding row(s); {len(new_ids)} new ID(s).")
    print(f"Updated {open_path} run_id={synth_run_id}")


def main() -> None:
    argv = sys.argv[1:]
    strict = False
    if argv and argv[-1] == "--strict":
        strict = True
        argv = argv[:-1]
    if len(argv) != 1:
        print(__doc__.strip(), file=sys.stderr)
        sys.exit(1)
    ingest(argv[0], strict=strict)


if __name__ == "__main__":
    main()
