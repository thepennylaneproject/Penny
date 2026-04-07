# LYRA Integrations: Linear + Cursor

## What This Does

Turns your audit workflow into:

1. Say "audit logic" in Cursor -- agent runs, outputs JSON
2. Run `python3 audits/session.py` -- tells you what to fix
3. Say "fix f-a3b7c9e1" in Cursor -- it loads the finding context and helps you fix
4. Run `python3 audits/session.py done f-a3b7c9e1 abc123` -- marks done
5. Run `python3 audits/linear_sync.py sync` -- pushes everything to Linear
6. Run `python3 audits/session.py canship` -- tells you if you're clear

## Setup: Cursor Rules (2 minutes)

Copy the `.mdc` rule files into your project's `.cursor/rules/` directory:

```bash
mkdir -p .cursor/rules
cp audits/integrations/cursor-rules/*.mdc .cursor/rules/
```

This gives Cursor 5 rules:

| Rule File | Triggers When You Say | What It Does |
|-----------|----------------------|-------------|
| `lyra-context.mdc` | Working in `audits/` files | Loads enum rules, ID format, file locations |
| `audit-core.mdc` | "audit logic", "audit security", etc. | Runs the appropriate core agent |
| `audit-logic.mdc` | "audit logic", "run logic audit" | Runs logic agent with full method |
| `audit-visual.mdc` | "audit visual", "check design" | Routes to visual agent prompts + synthesizer (`atlas_narrative`) + optional `visual-atlas-narrative.md` |
| `fix-finding.mdc` | "fix finding", "fix f-xxx" | Loads finding context, enforces fix rules |

After copying, restart Cursor (or open a new window) to load the rules.

### How It Works in Practice

In Cursor chat or Cmd+K:
- "Run a logic audit on src/services/" -- Cursor loads the logic agent rule and audits
- "Audit visual" -- Cursor shows routing table, you pick the agent
- "Fix f-a3b7c9e1" -- Cursor reads the case file, shows the fix plan, writes minimal code
- "What's the status of my audit?" -- Cursor reads open_findings.json and summarizes

## Setup: Linear Sync (5 minutes)

### 1. Get a Linear API Key

Linear > Settings > API > Personal API Keys > Create Key

### 2. Get Your Team ID

Look at your Linear URL: `app.linear.app/YOUR-TEAM/...`
Or run this after setting the API key:

```bash
export LINEAR_API_KEY="lin_api_xxxxxxxxxxxx"
python3 -c "
import json, urllib.request
req = urllib.request.Request('https://api.linear.app/graphql',
    data=json.dumps({'query': '{ teams { nodes { id name } } }'}).encode(),
    headers={'Content-Type': 'application/json', 'Authorization': '$LINEAR_API_KEY'})
with urllib.request.urlopen(req) as r:
    teams = json.loads(r.read())['data']['teams']['nodes']
    for t in teams: print(f\"{t['name']}: {t['id']}\")
"
```

### 3. (Optional) Create a LYRA Label

In Linear: Settings > Labels > Create Label named "LYRA Audit"
Copy the label ID from the URL when you click on it.

### 4. Set Environment Variables

Add to your shell profile (~/.zshrc, ~/.bashrc):

```bash
export LINEAR_API_KEY="lin_api_xxxxxxxxxxxx"
export LINEAR_TEAM_ID="your-team-uuid"
export LINEAR_LABEL_ID="your-label-uuid"      # optional
export LINEAR_PROJECT_ID="your-project-uuid"   # optional
```

### 5. First Sync

```bash
# Preview what will be created
python3 audits/linear_sync.py push --dry-run

# Create issues in Linear
python3 audits/linear_sync.py sync
```

### How It Maps

| LYRA | Linear |
|------|--------|
| P0 | Urgent (1) |
| P1 | High (2) |
| P2 | Medium (3) |
| P3 | Low (4) |
| open | Backlog |
| accepted | Todo |
| in_progress | In Progress |
| fixed_pending_verify | In Progress |
| fixed_verified | Done |
| wont_fix | Cancelled |

### Day-to-Day Usage

```bash
# After an audit run: push new findings to Linear
python3 audits/linear_sync.py push

# After triaging in Linear: pull status changes back
python3 audits/linear_sync.py pull

# Full round-trip
python3 audits/linear_sync.py sync

# Check sync health
python3 audits/linear_sync.py status
```

You can triage in either place:
- Use `session.py` for terminal-based triage (fastest for solo dev)
- Use Linear for visual board/list triage (better if you like dragging cards)
- They stay in sync via `linear_sync.py sync`

## Full Workflow (Everything Together)

```bash
# 1. Preflight
bash audits/setup.sh              # or manual preflight commands

# 2. Audit (in Cursor)
#    Say "audit logic" or "run full audit"
#    Save JSON outputs to audits/runs/<today>/

# 3. Synthesize (in Cursor)
#    Paste audits/prompts/synthesizer.md with the agent outputs

# 4. Triage
python3 audits/session.py         # tells you what to do next

# 5. Fix (in Cursor)
#    Say "fix f-a3b7c9e1"
#    Cursor loads context, you write the fix
python3 audits/session.py done f-a3b7c9e1 abc123

# 6. Re-audit
python3 audits/session.py reaudit  # tells you which agents to re-run

# 7. Ship check
python3 audits/session.py canship

# 8. Sync to Linear
python3 audits/linear_sync.py sync
```

## File Locations

After setup, your project has:

```
.cursor/
  rules/
    lyra-context.mdc           # Auto-loads in audits/
    audit-core.mdc             # "audit logic", "audit security", etc.
    audit-logic.mdc            # Detailed logic audit mode
    audit-visual.mdc           # Visual audit routing
    fix-finding.mdc            # "fix f-xxx" mode

audits/
  linear_sync.py               # Linear bidirectional sync
  linear_sync.json             # Finding ID <-> Linear issue ID map (auto-created)
  session.py                   # Terminal workflow runner
  ... (rest of LYRA suite)
```
