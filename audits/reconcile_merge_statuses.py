#!/usr/bin/env python3
"""
LYRA — prevent accidental status downgrades when merging re-audit / synthesizer output.

After merging new agent JSON into audits/open_findings.json, a naive "incoming wins"
merge can set findings back to `open` even when they were `fixed_pending_verify` or
`fixed_verified`. This script restores those statuses from a baseline snapshot.

Usage:
  python3 audits/reconcile_merge_statuses.py --dry-run
  python3 audits/reconcile_merge_statuses.py --apply
  python3 audits/reconcile_merge_statuses.py --apply --baseline path/to/open_findings.json

  --git-baseline   Read baseline from `git show HEAD:audits/open_findings.json` (default with --apply if file exists in git)

Exit codes:
  0 — no downgrades found (or --dry-run with none)
  1 — downgrades found in --check-only mode (use with CI)
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OPEN_FINDINGS_PATH = REPO_ROOT / "audits" / "open_findings.json"
FINDINGS_DIR = REPO_ROOT / "audits" / "findings"

PROTECTED = frozenset({"fixed_pending_verify", "fixed_verified"})
WEAK = frozenset({"open", "accepted", "in_progress"})


def _load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def _git_baseline() -> dict | None:
    try:
        raw = subprocess.check_output(
            ["git", "show", "HEAD:audits/open_findings.json"],
            cwd=str(REPO_ROOT),
            text=True,
            stderr=subprocess.DEVNULL,
        )
        return json.loads(raw)
    except (subprocess.CalledProcessError, json.JSONDecodeError, FileNotFoundError):
        return None


def _findings_map(data: dict) -> dict[str, dict]:
    key = "open_findings" if "open_findings" in data else "findings"
    out = {}
    for item in data.get(key, []):
        if isinstance(item, dict) and item.get("finding_id"):
            out[item["finding_id"]] = item
    return out


def _sync_md_status(finding_id: str, status: str) -> bool:
    path = FINDINGS_DIR / f"{finding_id}.md"
    if not path.is_file():
        return False
    text = path.read_text(encoding="utf-8")
    new, n = re.subn(
        r"(\*\*Status:\*\*\s*)([^|\n]+)",
        rf"\g<1>{status}",
        text,
        count=1,
    )
    if n and new != text:
        path.write_text(new, encoding="utf-8")
        return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--merged",
        type=Path,
        default=OPEN_FINDINGS_PATH,
        help="Path to open_findings.json to fix (default: audits/open_findings.json)",
    )
    parser.add_argument(
        "--baseline",
        type=Path,
        default=None,
        help="Baseline JSON before merge (default: use --git-baseline)",
    )
    parser.add_argument(
        "--git-baseline",
        action="store_true",
        help="Load baseline from git HEAD:audits/open_findings.json",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write fixes to --merged and sync audits/findings/*.md headers",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would change; do not write",
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Exit 1 if any downgrade is present (after optional --apply, use alone to verify)",
    )
    args = parser.parse_args()

    merged_path = args.merged.resolve()
    if not merged_path.is_file():
        print(f"error: merged file not found: {merged_path}", file=sys.stderr)
        return 2

    merged_data = _load_json(merged_path)
    merged_map = _findings_map(merged_data)

    baseline_data: dict | None = None
    if args.baseline:
        baseline_path = args.baseline.resolve()
        if not baseline_path.is_file():
            print(f"error: baseline not found: {baseline_path}", file=sys.stderr)
            return 2
        baseline_data = _load_json(baseline_path)
    elif args.git_baseline or not args.baseline:
        baseline_data = _git_baseline()

    if baseline_data is None:
        print("warning: no baseline (use --baseline or commit open_findings.json for --git-baseline)")
        return 0

    baseline_map = _findings_map(baseline_data)

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    fixes: list[tuple[str, str, str]] = []

    for fid, base in baseline_map.items():
        b_status = base.get("status")
        if b_status not in PROTECTED:
            continue
        cur = merged_map.get(fid)
        if not cur:
            continue
        c_status = cur.get("status")
        if c_status in WEAK:
            fixes.append((fid, c_status or "?", b_status))

    if args.check_only and not args.apply and not args.dry_run:
        if fixes:
            for fid, was, restore in fixes:
                print(f"DOWNGRADE\t{fid}\t{was}\t-> should be\t{restore}")
            return 1
        print("OK: no merge status downgrades detected.")
        return 0

    if not fixes:
        print("No status downgrades to reconcile.")
        return 0

    for fid, was, restore in fixes:
        print(f"restore\t{fid}\t{was}\t->\t{restore}")

    if args.dry_run:
        print("(dry-run: no files written)")
        return 0

    if not args.apply:
        print("hint: pass --apply to write fixes, or --dry-run to preview only")
        return 1

    for fid, was, restore in fixes:
        f = merged_map[fid]
        f["status"] = restore
        hist = f.setdefault("history", [])
        hist.append(
            {
                "timestamp": now,
                "actor": "reconcile_merge_statuses",
                "event": "note_added",
                "notes": (
                    f"Status restored from {was} to {restore} "
                    "(blocked merge downgrade; see audits/reconcile_merge_statuses.py)."
                ),
            }
        )

    merged_data["last_updated"] = now
    findings_key = "open_findings" if "open_findings" in merged_data else "findings"
    merged_data[findings_key] = list(merged_map.values())

    with merged_path.open("w", encoding="utf-8") as fp:
        json.dump(merged_data, fp, indent=2)
        fp.write("\n")

    for fid, _, _ in fixes:
        if _sync_md_status(fid, merged_map[fid]["status"]):
            print(f"synced md\t{fid}")

    print(f"Wrote {merged_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
