#!/usr/bin/env python3
"""
LYRA Project Setup

Configures a LYRA installation for a specific project by:
1. Copying the expectations doc into audits/expectations.md
2. Generating audits/project.json from the expectations doc
3. Installing the expectations Cursor rule
4. Prepending the expectations preamble to all agent prompts

Usage:
  python3 project_setup.py <path-to-expectations.md>
  python3 project_setup.py expectations/relevnt-expectations.md

Run from the project root (where audits/ lives).
"""

import json
import os
import sys
import re
from pathlib import Path

AUDITS_DIR = "audits"
PROMPTS_DIR = f"{AUDITS_DIR}/prompts"
CURSOR_DIR = ".cursor/rules"
PREAMBLE_MARKER = "# LYRA Agent Preamble"
PREAMBLE_END = "---\n"


def detect_stack(expectations_text):
    """Infer project stack from expectations doc content."""
    text_lower = expectations_text.lower()

    stack = {}

    # Language
    if "python stdlib only" in text_lower or "python" in text_lower and "typescript" not in text_lower:
        stack["language"] = "python"
    else:
        stack["language"] = "typescript"

    # Framework
    if "next.js" in text_lower:
        stack["framework"] = "nextjs"
    elif "react native" in text_lower or "expo" in text_lower:
        stack["framework"] = "react-native"
    elif "nestjs" in text_lower:
        stack["framework"] = "nestjs"
    elif "react" in text_lower:
        stack["framework"] = "react"
    elif "streamlit" in text_lower:
        stack["framework"] = "streamlit"
    elif "static html" in text_lower or "static site" in text_lower:
        stack["framework"] = "static"
    elif "express" in text_lower:
        stack["framework"] = "express"
    else:
        stack["framework"] = "unknown"

    # Build
    if "vite" in text_lower:
        stack["build"] = "vite"
    elif "turborepo" in text_lower:
        stack["build"] = "turborepo"
    elif "no javascript build tooling" in text_lower:
        stack["build"] = "none"
    else:
        stack["build"] = "unknown"

    # Hosting
    if "netlify" in text_lower:
        stack["hosting"] = "netlify"
    elif "vercel" in text_lower:
        stack["hosting"] = "vercel"
    elif "no public cloud" in text_lower:
        stack["hosting"] = "local-only"
    else:
        stack["hosting"] = "unknown"

    # Database
    if "supabase" in text_lower:
        stack["database"] = "supabase"
    elif "drizzle" in text_lower:
        stack["database"] = "postgresql-drizzle"
    elif "prisma" in text_lower:
        stack["database"] = "postgresql-prisma"
    elif "sqlite" in text_lower:
        stack["database"] = "sqlite"
    else:
        stack["database"] = "unknown"

    # CSS
    if "tailwind" in text_lower:
        stack["css"] = "tailwind"
    else:
        stack["css"] = "unknown"

    return stack


def detect_source_dirs(expectations_text):
    """Infer source directories from expectations doc."""
    dirs = set()

    patterns = [
        r"`src/[^`]*`",
        r"`apps/[^`]*`",
        r"`packages/[^`]*`",
        r"`netlify/functions/[^`]*`",
        r"`server/[^`]*`",
        r"`api/[^`]*`",
    ]

    for pattern in patterns:
        matches = re.findall(pattern, expectations_text)
        for m in matches:
            m = m.strip("`").rstrip("/")
            # Get the top-level dir
            parts = m.split("/")
            if len(parts) >= 2:
                dirs.add(f"{parts[0]}/{parts[1]}/")
            else:
                dirs.add(f"{parts[0]}/")

    # Defaults if nothing found
    if not dirs:
        dirs = {"src/"}

    return sorted(dirs)


def extract_project_name(filepath):
    """Extract project name from expectations filename."""
    name = Path(filepath).stem.replace("-expectations", "")
    return name


def count_rules(expectations_text):
    """Count rules by severity."""
    critical = len(re.findall(r"[Ff]ile `critical`", expectations_text))
    warning = len(re.findall(r"[Ff]ile `warning`", expectations_text))
    suggestion = len(re.findall(r"[Ff]ile `suggestion`", expectations_text))
    return critical, warning, suggestion


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    expectations_path = sys.argv[1]

    if not os.path.exists(expectations_path):
        print(f"ERROR: {expectations_path} not found.")
        sys.exit(1)

    if not os.path.exists(AUDITS_DIR):
        print(f"ERROR: {AUDITS_DIR}/ not found. Install the LYRA starter kit first.")
        sys.exit(1)

    # Read expectations
    with open(expectations_path) as f:
        expectations_text = f.read()

    project_name = extract_project_name(expectations_path)
    stack = detect_stack(expectations_text)
    source_dirs = detect_source_dirs(expectations_text)
    critical, warning, suggestion = count_rules(expectations_text)

    print(f"Project: {project_name}")
    print(f"Stack: {json.dumps(stack, indent=2)}")
    print(f"Source dirs: {source_dirs}")
    print(f"Rules: {critical} critical, {warning} warning, {suggestion} suggestion")
    print()

    # 1. Copy expectations doc
    dest = f"{AUDITS_DIR}/expectations.md"
    with open(dest, "w") as f:
        f.write(expectations_text)
    print(f"Copied expectations to {dest}")

    # 2. Generate project.json
    project_json = {
        "project_name": project_name,
        "expectations_path": dest,
        "stack": stack,
        "source_dirs": source_dirs,
        "rule_counts": {
            "critical": critical,
            "warning": warning,
            "suggestion": suggestion,
        },
    }

    project_json_path = f"{AUDITS_DIR}/project.json"
    with open(project_json_path, "w") as f:
        json.dump(project_json, f, indent=2)
        f.write("\n")
    print(f"Generated {project_json_path}")

    # 3. Install Cursor rule
    os.makedirs(CURSOR_DIR, exist_ok=True)
    cursor_rule_src = os.path.join(os.path.dirname(__file__) or ".", "cursor-rules", "expectations.mdc")
    cursor_rule_dest = os.path.join(CURSOR_DIR, "expectations.mdc")

    if os.path.exists(cursor_rule_src):
        with open(cursor_rule_src) as f:
            rule_content = f.read()
        with open(cursor_rule_dest, "w") as f:
            f.write(rule_content)
        print(f"Installed Cursor rule at {cursor_rule_dest}")
    else:
        # Generate inline if source not found
        rule = """---
description: Project expectations and boundaries. Prevents agents from violating project constraints.
globs:
  - "**/*"
---

# Project Expectations

This project has constraints defined in `audits/expectations.md`.
Before making any change, read that file and verify your suggestion does not violate any `critical` rule.
"""
        with open(cursor_rule_dest, "w") as f:
            f.write(rule)
        print(f"Generated Cursor rule at {cursor_rule_dest}")

    # 4. Add expectations lookup to agent prompts
    preamble_source_path = os.path.join(os.path.dirname(__file__) or ".", "AGENT-PREAMBLE.md")
    if os.path.exists(preamble_source_path):
        with open(preamble_source_path) as f:
            preamble_lines = f.readlines()
        
        # Strip the header if it exists
        start_idx = 0
        for i, line in enumerate(preamble_lines):
            if line.startswith("## Project Boundaries"):
                start_idx = i
                break
        
        preamble_text = "".join(preamble_lines[start_idx:])
        
        # Inject dynamic counts into the first paragraph
        injected_text = f"It defines {critical} critical, {warning} warning, and {suggestion} suggestion constraints for this project ({project_name}). "
        preamble_text = preamble_text.replace("It defines hard constraints for this project. ", injected_text)
        
        preamble = f"\n{preamble_text}\n"
    else:
        # Fallback if file not found
        preamble = f"""
## Project Boundaries (READ FIRST)

Before auditing, read `audits/expectations.md`. It defines {critical} critical, {warning} warning, and {suggestion} suggestion constraints for this project ({project_name}). Your findings and fix suggestions MUST respect these constraints. If a fix would violate a critical constraint, flag the conflict as a `question` finding instead of suggesting the violation.

"""

    prompts_updated = 0
    if os.path.exists(PROMPTS_DIR):
        for fname in sorted(os.listdir(PROMPTS_DIR)):
            if fname.endswith(".md") and fname.startswith("agent-"):
                fpath = os.path.join(PROMPTS_DIR, fname)
                with open(fpath) as f:
                    content = f.read()

                # Only add if not already present
                if "Project Boundaries" not in content:
                    # Insert after the first "---" line or after the READ-ONLY line
                    lines = content.split("\n")
                    insert_idx = 0
                    for i, line in enumerate(lines):
                        if "READ-ONLY AUDIT" in line:
                            insert_idx = i + 1
                            break
                        if line.startswith("## Mission") or line.startswith("## Required"):
                            insert_idx = i
                            break

                    lines.insert(insert_idx, preamble)
                    with open(fpath, "w") as f:
                        f.write("\n".join(lines))
                    prompts_updated += 1

    print(f"Updated {prompts_updated} agent prompts with expectations preamble")

    # Summary
    print()
    print("Setup complete. Next steps:")
    print(f"  1. Review {dest} to confirm expectations are correct")
    print(f"  2. Review {project_json_path} to confirm stack detection")
    print(f"  3. Restart Cursor to load the new rule")
    print(f"  4. Run: python3 audits/session.py")
    print()
    print("To run an expectations compliance audit:")
    print(f"  Paste audits/prompts/agent-expectations.md into your LLM tool")


if __name__ == "__main__":
    main()
