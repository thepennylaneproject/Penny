#!/usr/bin/env python3
"""
LYRA open_findings.json Cleanup Script v1.1

Normalizes:
  - severity, priority, type, status enums to schema-valid values
  - finding IDs longer than 50 chars to f-<8hex> format
  - Adds history events documenting every normalization
  - Renames corresponding finding case files

Usage:
  python3 cleanup_open_findings.py [--dry-run]

  --dry-run   Show what would change without writing files.
"""

import json
import hashlib
import os
import sys
import shutil
from datetime import datetime, timezone

# --- Configuration ---

OPEN_FINDINGS_PATH = "audits/open_findings.json"
FINDINGS_DIR = "audits/findings"
BACKUP_SUFFIX = ".pre-cleanup.bak"
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

DRY_RUN = "--dry-run" in sys.argv

# --- Normalization Maps ---

SEVERITY_MAP = {
    "critical": "blocker",
    "high": "major",
    "medium": "minor",
    "low": "nit",
    "info": "nit",
}

TYPE_MAP = {
    "vulnerability": "bug",
    "risk": "bug",
    "informational": "debt",
    "security": "bug",
}

STATUS_MAP = {
    "resolved": "fixed_verified",
    "closed": "fixed_verified",
    "fixed": "fixed_pending_verify",
    "new": "open",
}

PRIORITY_MAP = {
    "P4": "P3",
    "P5": "P3",
}

VALID_SEVERITY = {"blocker", "major", "minor", "nit"}
VALID_PRIORITY = {"P0", "P1", "P2", "P3"}
VALID_TYPE = {"bug", "enhancement", "debt", "question"}
VALID_STATUS = {
    "open", "accepted", "in_progress", "fixed_pending_verify",
    "fixed_verified", "wont_fix", "deferred", "duplicate",
    "converted_to_enhancement",
}

MAX_ID_LENGTH = 50

# --- Helpers ---

def hash_id(original):
    """Generate f-<8hex> from SHA-256 of original string."""
    h = hashlib.sha256(original.encode("utf-8")).hexdigest()[:8]
    return f"f-{h}"


def normalize_enum(finding, field, valid_set, remap, default, changes):
    """Normalize one enum field on a finding. Returns whether it changed."""
    val = finding.get(field, "")
    if val in valid_set:
        return False

    new_val = remap.get(val, default)
    old_val = val
    finding[field] = new_val

    # Add history event
    history = finding.setdefault("history", [])
    history.append({
        "timestamp": NOW,
        "actor": "cleanup-script",
        "event": "note_added",
        "notes": f"Normalized {field} from '{old_val}' to '{new_val}' per LYRA v1.1 enum rules.",
    })

    changes.append(f"  {finding.get('finding_id', '?')}: {field} '{old_val}' -> '{new_val}'")
    return True


def normalize_id(finding, id_remap, changes):
    """Normalize a finding ID if it exceeds MAX_ID_LENGTH. Returns whether it changed."""
    old_id = finding.get("finding_id", "")
    if len(old_id) <= MAX_ID_LENGTH:
        return False

    new_id = hash_id(old_id)

    # Handle collision (unlikely but safe)
    suffix = 0
    candidate = new_id
    while candidate in id_remap.values() and id_remap.get(candidate) != old_id:
        suffix += 1
        candidate = f"{new_id}-{suffix:02d}"
    new_id = candidate

    finding["finding_id"] = new_id
    finding["legacy_id"] = old_id
    id_remap[old_id] = new_id

    history = finding.setdefault("history", [])
    history.append({
        "timestamp": NOW,
        "actor": "cleanup-script",
        "event": "note_added",
        "notes": f"Finding ID shortened from '{old_id}' to '{new_id}'. Original stored in legacy_id.",
    })

    changes.append(f"  ID: '{old_id[:60]}...' -> '{new_id}'")
    return True


def update_related_ids(findings, id_remap):
    """Update related_ids to point to new IDs where remapped."""
    for f in findings:
        related = f.get("related_ids", [])
        updated = [id_remap.get(r, r) for r in related]
        if updated != related:
            f["related_ids"] = updated


def rename_finding_file(old_id, new_id, changes):
    """Rename the case file if it exists."""
    old_path = os.path.join(FINDINGS_DIR, f"{old_id}.md")
    new_path = os.path.join(FINDINGS_DIR, f"{new_id}.md")

    if os.path.exists(old_path):
        if DRY_RUN:
            changes.append(f"  Would rename: {old_path} -> {new_path}")
        else:
            # Read, prepend a note, write to new path
            with open(old_path, "r") as fh:
                content = fh.read()
            note = f"\n> **ID Remapped:** This finding was previously `{old_id}`. Remapped on {NOW}.\n\n"
            # Insert note after first heading line
            lines = content.split("\n", 1)
            if len(lines) > 1:
                content = lines[0] + "\n" + note + lines[1]
            else:
                content = lines[0] + "\n" + note
            with open(new_path, "w") as fh:
                fh.write(content)
            os.remove(old_path)
            changes.append(f"  Renamed: {old_path} -> {new_path}")


# --- Main ---

def main():
    if not os.path.exists(OPEN_FINDINGS_PATH):
        print(f"ERROR: {OPEN_FINDINGS_PATH} not found. Run from repo root.")
        sys.exit(1)

    # Load
    with open(OPEN_FINDINGS_PATH, "r") as f:
        data = json.load(f)

    # Handle both field names (findings vs open_findings)
    findings_key = "open_findings" if "open_findings" in data else "findings"
    findings = data.get(findings_key, [])

    print(f"Loaded {len(findings)} findings from {OPEN_FINDINGS_PATH}")
    print(f"Mode: {'DRY RUN' if DRY_RUN else 'LIVE (will write files)'}")
    print()

    changes = []
    id_remap = {}  # old_id -> new_id

    # --- Pass 1: Normalize enums ---
    enum_fixes = 0
    for f in findings:
        if normalize_enum(f, "severity", VALID_SEVERITY, SEVERITY_MAP, "minor", changes):
            enum_fixes += 1
        if normalize_enum(f, "priority", VALID_PRIORITY, PRIORITY_MAP, "P2", changes):
            enum_fixes += 1
        if normalize_enum(f, "type", VALID_TYPE, TYPE_MAP, "debt", changes):
            enum_fixes += 1
        if normalize_enum(f, "status", VALID_STATUS, STATUS_MAP, "open", changes):
            enum_fixes += 1

    # --- Pass 2: Normalize IDs ---
    id_fixes = 0
    for f in findings:
        if normalize_id(f, id_remap, changes):
            id_fixes += 1

    # --- Pass 3: Update related_ids ---
    if id_remap:
        update_related_ids(findings, id_remap)

    # --- Pass 4: Rename finding files ---
    file_renames = []
    for old_id, new_id in id_remap.items():
        rename_finding_file(old_id, new_id, file_renames)

    # --- Summary ---
    print(f"Enum normalizations: {enum_fixes}")
    print(f"ID normalizations: {id_fixes}")
    print(f"File renames: {len(file_renames)}")
    print()

    if changes:
        print("Changes:")
        for c in changes:
            print(c)
        print()

    if file_renames:
        print("File operations:")
        for r in file_renames:
            print(r)
        print()

    if not changes and not file_renames:
        print("No changes needed. All findings are schema-compliant.")
        return

    if DRY_RUN:
        print("DRY RUN complete. No files modified. Run without --dry-run to apply.")
        return

    # --- Write ---

    # Backup original
    backup_path = OPEN_FINDINGS_PATH + BACKUP_SUFFIX
    if not os.path.exists(backup_path):
        shutil.copy2(OPEN_FINDINGS_PATH, backup_path)
        print(f"Backup saved to: {backup_path}")

    # Update metadata
    data[findings_key] = findings
    data["last_updated"] = NOW
    data["cleanup_applied"] = NOW

    with open(OPEN_FINDINGS_PATH, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

    print(f"Written: {OPEN_FINDINGS_PATH}")
    print()

    # --- Validation ---
    print("Post-cleanup validation:")
    invalid = 0
    for f in findings:
        issues = []
        if f.get("severity") not in VALID_SEVERITY:
            issues.append(f"severity={f.get('severity')}")
        if f.get("priority") not in VALID_PRIORITY:
            issues.append(f"priority={f.get('priority')}")
        if f.get("type") not in VALID_TYPE:
            issues.append(f"type={f.get('type')}")
        if f.get("status") not in VALID_STATUS:
            issues.append(f"status={f.get('status')}")
        if len(f.get("finding_id", "")) > MAX_ID_LENGTH:
            issues.append(f"id_length={len(f.get('finding_id',''))}")
        if issues:
            invalid += 1
            print(f"  STILL INVALID: {f.get('finding_id')}: {issues}")

    if invalid == 0:
        print("  All findings now pass enum and ID validation.")
    else:
        print(f"  WARNING: {invalid} findings still have issues.")


if __name__ == "__main__":
    main()
