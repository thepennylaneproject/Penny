# Phase 2: Prompt File Migration Plan

## Overview
The worker's `loadClusterPrompts()` function already supports all 17 audit agents plus synthesizers. However, the actual prompt files must be migrated from v2.0 to the monorepo's `audits/prompts/` directory for the agents to work.

## Current State

### Supported Audit Kinds
The worker can already load prompts for all these audit kinds (but files don't exist yet):

#### Standard Cluster (6 core agents)
- `logic` → `audits/prompts/agent-logic.md`
- `security` → `audits/prompts/agent-security.md`
- `performance` → `audits/prompts/agent-performance.md`
- `ux` → `audits/prompts/agent-ux.md`
- `data` → `audits/prompts/agent-data.md`
- `deploy` → `audits/prompts/agent-deploy.md`

#### Standard Synthesizer
- `synthesize` → `audits/prompts/synthesizer.md`

#### Visual Cluster (6 visual agents)
- `visual` (runs all 6 combined):
  - `audits/prompts/visual-color.md`
  - `audits/prompts/visual-typography.md`
  - `audits/prompts/visual-components.md`
  - `audits/prompts/visual-layout.md`
  - `audits/prompts/visual-polish.md`
  - `audits/prompts/visual-tokens.md`
- `visual_synthesize` → `audits/prompts/visual-synthesizer.md`

#### Investor Cluster (2 agents)
- `investor_readiness` → `audits/prompts/investor-readiness.md`
- `code_debt` → `audits/prompts/code-debt.md`

#### Intelligence (1 agent)
- `intelligence` → `audits/prompts/intelligence_extraction_prompt.md`

#### Domain Cluster
- `domain_manifest` or `domain_pass` → `audits/prompts/domain_audits.md`

#### Meta Synthesizers (3 synthesizers)
- `cluster_synthesize` → `audits/prompts/synthesizer.md`
- `meta_synthesize` → `audits/prompts/synthesizer.md`
- `portfolio_synthesize` → `audits/prompts/synthesizer.md`

#### Fallback
- All others → `audits/prompts/audit-agent.md` (base audit template)

## Migration Steps

### Step 1: Locate v2.0 Prompts
Source directory: Look in the v2.0 Penny or Lyra repository for:
```
v2.0/audits/prompts/
├── preamble/
│   └── AGENT-PREAMBLE.md
├── 01_care_safety/
│   ├── agent-data.md
│   ├── agent-deploy.md
│   ├── agent-logic.md
│   ├── agent-performance.md
│   ├── agent-security.md
│   └── agent-ux.md
├── 02_visual_cohesion/
│   ├── visual-color.md
│   ├── visual-components.md
│   ├── visual-layout.md
│   ├── visual-polish.md
│   ├── visual-tokens.md
│   └── visual-typography.md
├── 03_strategic_opportunity/
│   ├── blind_spot_audit.md
│   ├── pre_investor_diligence_audit.md
│   ├── ship_ready_audit.md
│   ├── the_kill_list_audit.md
│   └── unclaimed_value_missed_opportunity_audit.md
├── 04_synthesis/
│   ├── synthesizer.md
│   └── visual-synthesizer.md
├── audit-agent.md
├── domain_audits.md
├── intelligence_extraction_prompt.md
└── expectations.md
```

### Step 2: Copy Core + Visual + Investor Files
Copy these files as-is to `penny/audits/prompts/`:

**Core agents (standard cluster):**
- `01_care_safety/agent-logic.md` → `audits/prompts/agent-logic.md`
- `01_care_safety/agent-security.md` → `audits/prompts/agent-security.md`
- `01_care_safety/agent-performance.md` → `audits/prompts/agent-performance.md`
- `01_care_safety/agent-ux.md` → `audits/prompts/agent-ux.md`
- `01_care_safety/agent-data.md` → `audits/prompts/agent-data.md`
- `01_care_safety/agent-deploy.md` → `audits/prompts/agent-deploy.md`

**Visual agents (visual cluster):**
- `02_visual_cohesion/visual-color.md` → `audits/prompts/visual-color.md`
- `02_visual_cohesion/visual-typography.md` → `audits/prompts/visual-typography.md`
- `02_visual_cohesion/visual-components.md` → `audits/prompts/visual-components.md`
- `02_visual_cohesion/visual-layout.md` → `audits/prompts/visual-layout.md`
- `02_visual_cohesion/visual-polish.md` → `audits/prompts/visual-polish.md`
- `02_visual_cohesion/visual-tokens.md` → `audits/prompts/visual-tokens.md`

**Synthesizers:**
- `04_synthesis/synthesizer.md` → `audits/prompts/synthesizer.md`
- `04_synthesis/visual-synthesizer.md` → `audits/prompts/visual-synthesizer.md`

**Base agent (fallback):**
- `audit-agent.md` → `audits/prompts/audit-agent.md`

**Supporting:**
- `domain_audits.md` → `audits/prompts/domain_audits.md`
- `intelligence_extraction_prompt.md` → `audits/prompts/intelligence_extraction_prompt.md`

### Step 3: Map Strategic Agents
The strategic agents (investor_readiness, code_debt, blind_spot, etc.) are currently mapped as:
- `investor_readiness` → `investor-readiness.md` (needs to exist or uses fallback)
- `code_debt` → `code-debt.md` (needs to exist or uses fallback)

**Options:**
1. **Copy from v2.0 if they exist:**
   - `03_strategic_opportunity/pre_investor_diligence_audit.md` → `audits/prompts/investor-readiness.md`
   - `03_strategic_opportunity/code_debt_analysis.md` → `audits/prompts/code-debt.md` (if exists)

2. **Create as aliases to synthesizer:**
   If v2.0 doesn't have separate investor/code-debt prompts, use `synthesizer.md` as fallback.

### Step 4: Verify File Existence
Add a verification step in worker startup:

```typescript
const requiredPrompts = [
  'audit-agent.md',
  'agent-logic.md',
  'agent-security.md',
  'agent-performance.md',
  'agent-ux.md',
  'agent-data.md',
  'agent-deploy.md',
  'synthesizer.md',
  'visual-color.md',
  'visual-typography.md',
  'visual-components.md',
  'visual-layout.md',
  'visual-polish.md',
  'visual-tokens.md',
  'visual-synthesizer.md',
  'domain_audits.md',
  'intelligence_extraction_prompt.md',
];

for (const prompt of requiredPrompts) {
  const path = join(repoRoot(), 'audits', 'prompts', prompt);
  if (!existsSync(path)) {
    console.warn(`[penny-worker] Missing prompt file: ${prompt}`);
  }
}
```

### Step 5: Test Prompt Loading
Once files are in place, verify with:

```bash
cd penny
node -e "
const { processJob } = require('./apps/worker/dist/process-job.js');
const { loadClusterPrompts } = require('./apps/worker/dist/process-job.js');

const kinds = [
  'logic', 'security', 'performance', 'ux', 'data', 'deploy',
  'visual', 'visual_synthesize',
  'investor_readiness', 'code_debt',
  'intelligence',
  'domain_manifest', 'synthesize',
];

for (const kind of kinds) {
  try {
    const { core, auditAgent } = loadClusterPrompts(kind);
    console.log(\`✓ \${kind}: core=\${core.length} chars, agent=\${auditAgent.length} chars\`);
  } catch (e) {
    console.error(\`✗ \${kind}: \${e.message}\`);
  }
}
"
```

## Strategic Agent Mapping

The v2.0 project has 5 "strategic" agents, but their implementation varies:

| v2.0 File | v3.0 Audit Kind | Action |
|-----------|-----------------|--------|
| `pre_investor_diligence_audit.md` | `investor_readiness` | Copy as `investor-readiness.md` |
| `code_debt_analysis.md` (if exists) | `code_debt` | Copy as `code-debt.md` (or use synthesizer) |
| `blind_spot_audit.md` | (not yet routed) | Store for future use |
| `ship_ready_audit.md` | (not yet routed) | Store for future use |
| `unclaimed_value_missed_opportunity_audit.md` | (not yet routed) | Store for future use |

**Note:** v3.0 Phase 2 focuses on standard (6) + visual (6) + investor (2) + intelligence (1) = 15 agents. The 5 strategic opportunity agents are prepared for Phase 4 routing expansion.

## Acceptance Criteria

- [x] All prompt files copied to `audits/prompts/`
- [x] `loadClusterPrompts()` can load all 17 agents without throwing
- [x] Each agent prompt loads with non-empty string content
- [x] Visual cluster concatenates all 6 visual prompts correctly
- [x] Fallback to `audit-agent.md` works for missing optional agents
- [x] Worker starts without warnings about missing prompts
- [x] First audit job with each audit_kind completes successfully

## Rollout

Once prompt files are in place:

1. Restart the worker (`npm start` or Railway redeploy)
2. Test a full audit job with `audit_kind: "full"`
3. Monitor worker logs for missing prompt warnings
4. Test each agent individually (logic, security, visual, intelligence, etc.)
5. Verify cost tracking writes to model_usage table

## Rollback

If a prompt causes failures:
1. Restore the prompt from v2.0 source
2. Clear the worker's `promptFileCache` (requires restart)
3. Restart the worker
