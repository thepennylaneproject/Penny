from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import json
import os

from .config import ApplyConfig
from .models import PatchCandidate


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _is_protected(path: str, protected_prefixes: list[str]) -> bool:
    return any(path.startswith(prefix) for prefix in protected_prefixes)


def apply_candidate_to_root(
    candidate: PatchCandidate,
    repo_root: str,
    config: ApplyConfig,
) -> tuple[bool, list[str], str]:
    touched: list[str] = []

    if len(candidate.operations) > config.max_files_changed:
        return False, touched, f"candidate exceeds max_files_changed={config.max_files_changed}"

    for op in candidate.operations:
        rel = op.file
        if not rel:
            return False, touched, "missing file path in operation"
        if _is_protected(rel, config.protected_prefixes):
            return False, touched, f"attempt to edit protected path: {rel}"
        full_path = os.path.join(repo_root, rel)
        if not os.path.exists(full_path):
            return False, touched, f"file not found: {rel}"
        with open(full_path) as f:
            content = f.read()
        if op.search not in content:
            return False, touched, f"search text not found: {rel}"
        if content.count(op.search) != 1:
            return False, touched, f"search text is not unique: {rel}"
        if config.dry_run:
            touched.append(rel)
            continue
        updated = content.replace(op.search, op.replace, 1)
        with open(full_path, "w") as f:
            f.write(updated)
        touched.append(rel)

    if not config.dry_run:
        for test_spec in candidate.tests_to_add:
            if not isinstance(test_spec, dict):
                continue
            test_file = test_spec.get("file")
            test_content = test_spec.get("content")
            if not test_file or not test_content:
                continue
            if _is_protected(str(test_file), config.protected_prefixes):
                continue
            test_full_path = os.path.join(repo_root, test_file)
            os.makedirs(os.path.dirname(test_full_path), exist_ok=True)
            with open(test_full_path, "w") as tf:
                tf.write(str(test_content))
            touched.append(str(test_file))

    return True, sorted(set(touched)), ""


def update_finding_after_apply(
    findings_file: str,
    finding_id: str,
    run_id: str,
    selected_node_id: str,
    touched_files: list[str],
    notes: str,
) -> bool:
    if not os.path.exists(findings_file):
        return False
    with open(findings_file) as f:
        data = json.load(f)

    key = "open_findings" if "open_findings" in data else "findings"
    findings = data.get(key, [])
    changed = False
    for finding in findings:
        if finding.get("finding_id") != finding_id:
            continue
        finding["status"] = "fixed_pending_verify"
        history = finding.setdefault("history", [])
        history.append(
            {
                "timestamp": utc_now(),
                "actor": "repair-engine",
                "event": "patch_applied",
                "notes": f"run={run_id} node={selected_node_id}. {notes}",
                "artifacts": [f"audits/repair_runs/{run_id}/tree.json", f"audits/repair_runs/{run_id}/summary.json"],
            }
        )
        if touched_files:
            existing_fix = finding.setdefault("suggested_fix", {})
            if isinstance(existing_fix, dict):
                existing_fix["affected_files"] = sorted(set(touched_files))
        changed = True
        break

    if not changed:
        return False

    data["last_updated"] = utc_now()
    with open(findings_file, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    return True

