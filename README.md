# Penny v3.0

Multi-agent code auditing and automated repair system. Cloud-native, no local machine required beyond initial GitHub repo connection.

## Architecture

**Three services, all in the cloud:**

- **Dashboard** (Next.js on Netlify) — UI, API routes, webhook management
- **Audit Worker** (TypeScript/BullMQ on Railway) — Runs 17 LLM audit agents
- **Repair Service** (Python/FastAPI on Railway) — Beam-search patch generation + Docker evaluation

**Supporting infrastructure:**

- Supabase (PostgreSQL + Edge Functions + RLS)
- Upstash Redis (BullMQ job queue)
- Qdrant Cloud (patch memory vector store)
- GitHub API (code fetching + PR creation)
- Sentry (error tracking)

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- pnpm
- Supabase CLI
- Docker (for running repairs locally)

### Setup

```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your actual secrets

# Initialize Supabase (if using local dev)
cd supabase
supabase start

# Run all services in parallel
pnpm dev
```

Services will be available at:
- Dashboard: http://localhost:3000
- Worker: runs in background
- Repair service: http://localhost:8000

## Monorepo Structure

```
penny/
├── apps/
│   ├── dashboard/          ← Next.js UI (Netlify)
│   └── worker/             ← TypeScript BullMQ (Railway)
├── services/
│   └── repair/             ← Python FastAPI (Railway)
├── packages/
│   └── shared-types/       ← TypeScript types
├── supabase/
│   ├── migrations/         ← Database schema
│   └── functions/          ← Edge Functions
└── audits/
    └── prompts/            ← 17 LLM audit agents
```

## Development

```bash
# Run all services
pnpm dev

# Build
pnpm build

# Type check
pnpm typecheck

# Lint
pnpm lint

# Clean
pnpm clean
```

## Deployment

**Dashboard hosting:** Production uses the repo-root [`netlify.toml`](./netlify.toml) (Next.js on Netlify). There is intentionally no `apps/dashboard/vercel.json` — Netlify is authoritative; a second platform file would duplicate install/build commands and env conventions.

### Dashboard → Netlify

```bash
cd apps/dashboard
npm run build
# Deploy via Netlify CLI or GitHub integration
```

### Worker → Railway

```bash
cd apps/worker
docker build -t penny-worker .
# Push to Railway via GitHub integration
```

### Repair Service → Railway

```bash
cd services/repair
docker build -t penny-repair .
# Push to Railway via GitHub integration
```

## Environment Variables

See `.env.example` for all required variables. Each service needs a specific subset:

- **Dashboard**: Supabase, GitHub App, Repair Service, Sentry
- **Worker**: Supabase, Redis, LLM providers, Repair Service, GitHub App. The worker reads `.env` / `.env.local` from the repo root first, then `apps/dashboard`, then `apps/worker`.
- **Repair Service**: Supabase, LLM providers, Qdrant, engine tuning vars

## Features

### 17 Audit Agents

**Core Safety (6):** Logic, Data/Schema, UX, Performance, Security, Deploy

**Visual Cohesion (6):** Color, Components, Layout, Polish, Tokens, Typography

**Strategic (5):** Blind Spot, Ship Ready, Kill List, Investor Diligence, Unclaimed Value

### Granular UI Controls

- Agent toggling (per-project, per-suite)
- LLM tier selection (aggressive/balanced/precision)
- Repair parameters (auto_apply, beam_width, max_depth, etc.)
- Webhook management
- Schedule scheduling
- Cost dashboard

### Automation

- GitHub webhook triggers (push/PR)
- Cron-based scheduling
- Automated PR creation
- Re-audit on merge
- Self-audit ("Penny auditing itself")

## Key Phases (Phase 0 Complete)

| Phase | Status | Focus |
|-------|--------|-------|
| 0 | ✅ | Monorepo bootstrap, build verification |
| 1 | 🔜 | Cloud database backbone (Supabase v2.0 schema) |
| 2 | 🔜 | Worker audit engine (all 17 agents) |
| 3 | 🔜 | Repair service as FastAPI |
| 4 | 🔜 | Granular UI controls |
| 5 | 🔜 | Webhook + schedule automation |
| 6 | 🔜 | Self-audit + intelligence reports |
| 7 | 🔜 | GitHub PR automation |

## References

- [Penny Plan](/.claude/plans/staged-munching-harbor.md)
- [Supabase Docs](https://supabase.com/docs)
- [Turbo Docs](https://turbo.build)
- [Next.js Docs](https://nextjs.org/docs)

## License

All rights reserved. © Sarah Sahl / The Penny Lane Project.
