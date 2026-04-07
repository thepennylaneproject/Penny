# LYRA Expectations Integration & Portfolio Management

## What This Adds

Three capabilities on top of the core LYRA suite:

1. **Expectations Auditor** -- a new agent that reads your project's expectations doc and checks every rule against the codebase
2. **Expectations-Aware Agents** -- all existing agents respect your project's constraints before suggesting fixes
3. **Portfolio Dashboard** -- manage audit status across all 11 projects from one terminal

## File Manifest

```
prompts/
  agent-expectations.md       # New agent: checks codebase against expectations doc

cursor-rules/
  expectations.mdc            # Cursor rule: loads expectations into every session

project_setup.py              # Per-project setup: wires expectations into LYRA
portfolio.py                  # Cross-project dashboard and router
portfolio.json                # Pre-filled config for your 11 projects
bootstrap_portfolio.sh        # One-shot setup across all projects
project.json.template         # Template for audits/project.json
AGENT-PREAMBLE.md             # Reference: the expectations preamble for agent prompts
```

## Quick Start (One Project)

```bash
cd ~/Desktop/relevnt

# Copy the expectations agent prompt
cp agent-expectations.md audits/prompts/

# Run the project setup (copies expectations, generates project.json, installs Cursor rule)
python3 project_setup.py relevnt-expectations.md
```

This does:
- Copies `relevnt-expectations.md` to `audits/expectations.md`
- Generates `audits/project.json` with detected stack info
- Installs `expectations.mdc` Cursor rule
- Adds an expectations preamble to all agent prompts

## Quick Start (All Projects At Once)

```bash
# 1. Install the portfolio config
mkdir -p ~/.lyra
cp portfolio.json ~/.lyra/portfolio.json
# Edit paths if your projects aren't in ~/Desktop/

# 2. Bootstrap everything
bash bootstrap_portfolio.sh /path/to/lyra-starter /path/to/expectations-docs

# 3. See the dashboard
python3 portfolio.py
```

## Daily Workflow

### Working on one project:

```bash
cd ~/Desktop/relevnt
python3 audits/session.py          # What to do next?

# In Cursor: "audit logic" or "audit expectations"
# Cursor auto-loads expectations context

python3 audits/session.py fix f-xxx
# ... make the fix ...
python3 audits/session.py done f-xxx abc123
python3 audits/session.py canship
```

### Deciding which project to work on:

```bash
python3 portfolio.py              # Dashboard across all projects
python3 portfolio.py blockers     # Show all blockers everywhere
python3 portfolio.py next         # The single highest-value thing to do right now
python3 portfolio.py relevnt      # Jump into Relevnt's session runner
```

### Running an expectations compliance audit:

In Cursor or any LLM tool, paste `audits/prompts/agent-expectations.md`. It will:
1. Read `audits/expectations.md`
2. Check every rule against the codebase
3. Output a compliance summary with pass/fail per rule
4. Emit findings for violations, with the expectations rule ID in each title

Example output:
```
compliance_summary: {
  total_rules: 15,
  passing: 12,
  violated: 2,
  cannot_verify: 1,
  critical_violations: 1
}
```

## How Expectations Flow Through the System

```
audits/expectations.md (your project's rules)
  |
  +---> .cursor/rules/expectations.mdc
  |       (Cursor loads this into every session)
  |       (Agent sees constraints before writing code)
  |
  +---> Agent prompts (preamble injected by project_setup.py)
  |       (Every agent reads expectations before auditing)
  |       (Fixes must not violate critical constraints)
  |
  +---> agent-expectations.md (dedicated compliance audit)
  |       (Systematically checks every rule)
  |       (Outputs pass/fail with proof hooks)
  |
  +---> session.py / portfolio.py
          (Expectations violations show as P0 blockers)
          (canship checks for expectations violations)
```

## How Expectations Map to LYRA Severity

| Expectations Level | LYRA Severity | LYRA Priority |
|-------------------|---------------|---------------|
| `critical` | `blocker` | `P0` |
| `warning` | `major` | `P1` |
| `suggestion` | `minor` | `P2` |
| Out-of-scope violated | `blocker` | `P0` |

## Portfolio Config Reference

`~/.lyra/portfolio.json`:

```json
{
  "projects": [
    {"name": "relevnt", "path": "/Users/sarahsahl/Desktop/relevnt"},
    {"name": "codra", "path": "/Users/sarahsahl/Desktop/codra"},
    ...
  ]
}
```

The `name` must match the expectations filename pattern: `<name>-expectations.md`.

## What This Replaces

Instead of:
- Manually remembering each project's constraints
- Re-reading expectations docs before every audit
- Agents suggesting fixes that violate architecture rules
- Mentally tracking which of 11 projects has blockers
- Figuring out "what should I work on right now?" across the portfolio

You get:
- Agents that auto-load constraints
- A compliance auditor that checks every rule
- One command to see the state of everything
- One command to find the highest-value next action
