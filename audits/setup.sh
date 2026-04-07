#!/bin/bash
# LYRA Audit Suite v1.1 -- Quick Setup
#
# Usage: Run from your project root.
#   bash audits/setup.sh
#
# This script:
#   1. Verifies the audits/ directory exists with all required files
#   2. Creates any missing directories
#   3. Runs a preflight capture
#   4. Prints next steps

set -e

AUDIT_DIR="audits"

echo "LYRA Audit Suite v1.1 -- Setup"
echo "=============================="
echo ""

# Check we're in a reasonable location
if [ ! -d "$AUDIT_DIR" ]; then
    echo "ERROR: audits/ directory not found."
    echo "Copy the audits/ starter kit into your project root first."
    exit 1
fi

# Verify required files
REQUIRED_FILES=(
    "$AUDIT_DIR/schema/audit-output.schema.json"
    "$AUDIT_DIR/prompts/agent-logic.md"
    "$AUDIT_DIR/prompts/agent-data.md"
    "$AUDIT_DIR/prompts/agent-ux.md"
    "$AUDIT_DIR/prompts/agent-performance.md"
    "$AUDIT_DIR/prompts/agent-security.md"
    "$AUDIT_DIR/prompts/agent-deploy.md"
    "$AUDIT_DIR/prompts/synthesizer.md"
    "$AUDIT_DIR/findings/TEMPLATE.md"
    "$AUDIT_DIR/open_findings.json"
    "$AUDIT_DIR/index.json"
)

MISSING=0
for f in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$f" ]; then
        echo "  MISSING: $f"
        MISSING=$((MISSING + 1))
    fi
done

if [ $MISSING -gt 0 ]; then
    echo ""
    echo "ERROR: $MISSING required files missing. Check your starter kit."
    exit 1
fi

echo "All required files present."
echo ""

# Ensure directories exist
mkdir -p "$AUDIT_DIR/artifacts/_run_"
mkdir -p "$AUDIT_DIR/runs"
mkdir -p "$AUDIT_DIR/external_wisdom"

# Detect package manager
if [ -f "pnpm-lock.yaml" ]; then
    PKG="pnpm"
elif [ -f "yarn.lock" ]; then
    PKG="yarn"
else
    PKG="npm"
fi
echo "Detected package manager: $PKG"
echo ""

# Run preflight
echo "Running preflight captures..."
rm -rf "$AUDIT_DIR/artifacts/_run_/*" 2>/dev/null || true

if command -v $PKG &> /dev/null; then
    $PKG test -- --run > "$AUDIT_DIR/artifacts/_run_/tests.txt" 2>&1 || true
    echo "  tests.txt captured (exit $?)"

    $PKG run lint > "$AUDIT_DIR/artifacts/_run_/lint.txt" 2>&1 || true
    echo "  lint.txt captured (exit $?)"

    $PKG run build > "$AUDIT_DIR/artifacts/_run_/build.txt" 2>&1 || true
    echo "  build.txt captured (exit $?)"

    npx tsc --noEmit > "$AUDIT_DIR/artifacts/_run_/typecheck.txt" 2>&1 || true
    echo "  typecheck.txt captured (exit $?)"
else
    echo "  WARNING: $PKG not found. Skipping preflight."
fi

echo ""
echo "Setup complete."
echo ""
echo "Next steps:"
echo "  1. Review audits/prompts/ and update Required Inputs for your repo structure."
echo "  2. Review audits/WORKFLOW.md and update qualifying change paths."
echo "  3. Open an agent prompt, paste into your LLM tool, save the JSON to audits/runs/."
echo "  4. Run the synthesizer prompt last."
echo "  5. git add audits/ && git commit -m 'audit: first LYRA run'"
