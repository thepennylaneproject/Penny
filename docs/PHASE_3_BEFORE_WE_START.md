# Phase 3: Before We Start

**Everything you need to know before Phase 3.1 kickoff**

---

## What You Decided (Founder Defaults)

You made 5 critical calls about Penny's autonomy. These are **hard-coded into Phase 3.**

| Decision | Your Call | Document |
|----------|-----------|----------|
| GitHub PR Mode | Auto branch + ready PR (draft if low confidence) | Governance Policy, Section 1 |
| Repair Eligibility | Include vulnerabilities (strict 97% gating) | Governance Policy, Section 2 |
| Auto-Merge | Never (fast lane instead) | Governance Policy, Section 3 |
| Concurrency | 3–5 repairs per repo, queue system | Governance Policy, Section 4 |
| Timeout | 30s–15m (default ~3m), auto-cancel if stuck | Governance Policy, Section 5 |

**Source:** Your message dated today. Locked in. Not revisiting.

---

## What Confidence Actually Means

Because "95% confidence" was vibes, we defined it.

### Confidence = 4 Weighted Components

```
Confidence = (Validation × 0.40)
           + (Locality × 0.30) 
           + (Risk × 0.20)
           - (Uncertainty × 0.10)
```

| Component | What It Measures | Range | Examples |
|-----------|------------------|-------|----------|
| **Validation** | Did lint/typecheck/tests pass? | 0–100 | 100 = all pass, 0 = all fail |
| **Locality** | Is the patch surgical or invasive? | 0–100 | 100 = 1 file/5 lines, 0 = 15 files/wide refactor |
| **Risk** | What domain? How serious? | 0–100 | 90 = logic bug fix, 50 = security vulnerability |
| **Uncertainty** | Did the LLM doubt itself? | 0–15 | 0 = clear reasoning, 15 = multiple red flags |

**Examples:**
- Simple logic fix (1 file, all tests pass, high confidence writing) = **88% confidence** ✅
- Security patch (fails 1 test, risky code path, uncertainty phrases) = **59% confidence** ❌ BLOCKED
- Style cleanup (1 file, 12 lines, all tests pass) = **71% confidence** ⚠️ DRAFT PR

**Document:** `confidence-scoring-framework.md` (full details with scoring tables)

---

## What Confidence Drives

Your confidence score determines the **action automatically:**

```
≥98%   → "Fast Lane Ready PR" (1 approval to merge)
95-97% → "Ready PR" (normal 1-approval process)
85-94% → "Draft PR" (requires explicit review decision)
75-84% → "Candidate Only" (user decides if worth pursuing)
<75%   → BLOCKED (no repair attempted)
```

**No human overrides this.** It's code, not policy.

---

## The Three Phase 3 Documents

You now have:

### 1. **`PHASE_3_DESIGN_SUMMARY.md`** (3 min read)
**Start here.** High-level overview of repair service architecture, dashboard components, cost model, timeline. For stakeholders and decision-makers.

### 2. **`.claude/plans/phase-3-repair-service.md`** (15 min read)
**Technical deep dive.** FastAPI architecture, Supabase schema, all 5 API endpoints, worker integration, 7 dashboard components, security model. For engineers implementing Phase 3.

### 3. **`.claude/plans/PHASE_3_IMPLEMENTATION_ROADMAP.md`** (Reference)
**Week-by-week execution plan.** Phase 3.1–3.4 broken into tasks, testing checklist, deployment steps. For project management and timeline tracking.

### 4. **`.claude/plans/confidence-scoring-framework.md`** (Reference)
**How confidence is scored.** 4 components, scoring tables, 3 detailed examples, tuning guidance. For understanding "why this repair got blocked."

### 5. **`.claude/plans/PHASE_3_GOVERNANCE_POLICY.md`** (Reference)
**How decisions are enforced.** Confidence-to-action routing, vulnerability gating, no auto-merge, concurrency limiting, timeout bounds, audit trail. For understanding system constraints.

---

## What Happens When Phase 3.1 Starts

**Week 1-2: Core Service**

```
Worker discovers repair-eligible finding (high/critical, logic/data/security)
    ↓
POST /jobs → Repair Service
    ↓
Repair Service queues job (respects concurrency limit)
    ↓
Beam search executes (max 3-5 min, respects timeout)
    ↓
Confidence scorer runs (4-component calculation)
    ↓
Action routing:
  - ≥98% → Create ready PR
  - 85-97% → Create draft PR
  - 75-84% → Save candidate, no PR yet
  - <75% → Block, explain why
    ↓
Dashboard shows progress in real-time
    ↓
User can create PR manually or accept auto-PR
```

**No surprises. Everything in this chain is defined.**

---

## What Gets Built

### Repair Service (Python/FastAPI)

- 5 API endpoints (job submission, status, list, create PR, health)
- Beam search orchestration (from v2.0)
- Docker evaluator (from v2.0)
- LLM patch generation (new)
- Cost tracking to Supabase
- Confidence scorer (new)

### Database (Supabase)

- `repair_jobs` table (job metadata, results)
- `repair_candidates` table (candidate patches, scores)
- `repair_costs` table (cost breakdown per job)
- RLS policies (project isolation)

### Worker Integration

- `repair-client.ts` (submits jobs to repair service)
- Filters findings (only high/critical)
- Monitors repair progress

### Dashboard (7 Components)

1. **Repair Job Monitor** — Real-time progress
2. **Repair Config Tuner** — Beam width, depth, timeout
3. **Candidate Comparison** — Side-by-side diffs
4. **Cost Estimator** — Predict spend
5. **PR Manager** — Create/link PRs
6. **Repair History** — Table of all repairs
7. **Project Config** — Default settings

All components show **confidence score and breakdown.**

---

## Questions to Decide NOW (Before Phase 3.1)

These need answers before we start building:

### Q1: Confidence Thresholds (Tunable)

**What confidence threshold for fast lane?**

- [ ] 98% (very selective, fast lane reserved for near-perfect repairs)
- [ ] 95% (broader fast lane, more repairs bypass draft stage)

**My rec:** 98% (keep it selective, teach users to trust it)

---

### Q2: Vulnerability Confidence (Locked)

**Keep vulnerability gating at 97% minimum?**

- [ ] Yes, 97% is right (very high bar for security fixes)
- [ ] Loosen to 95% (more security fixes go through)
- [ ] Tighten to 98% (only near-perfect security patches)

**My rec:** 97% (good balance)

---

### Q3: Concurrency Default (Tunable)

**Default max repairs per repo?**

- [ ] 3 (conservative, fewer conflicts)
- [ ] 5 (more parallelism, manageable)
- [ ] Other: _____

**My rec:** 4 (sweet spot)

---

### Q4: Timeout Defaults (Tunable)

**Default repair timeout?**

- [ ] 2 minutes (cheaper, faster feedback)
- [ ] 3 minutes (balanced)
- [ ] 5 minutes (more exploration, more cost)

**My rec:** 3 minutes (default), let power users increase to 5min if needed

---

### Q5: Appeals Process

**If user disagrees with blocked repair, should there be override?**

- [ ] No (strict enforcement, no exceptions)
- [ ] Internal team override (must go through Slack approval)
- [ ] Power user override (advanced setting, logs audit trail)

**My rec:** No direct override. If something got blocked, the system is probably right. User can tweak config and retry. Internal team override available for documented exceptions.

---

### Q6: Vulnerability Scope (Locked)

**Keep vulnerability eligibility gated with:**

- [ ] 97% confidence minimum
- [ ] 90% locality score minimum (surgical fixes only)
- [ ] No dependency upgrades allowed
- [ ] No new external imports allowed

**My rec:** Yes to all four (strict gating for security fixes)

---

## Answers to Lock In

Once you answer the 6 questions above, reply with:

```
Q1: 98% [or 95%]
Q2: 97% [or other]
Q3: 4 [or 3 or 5]
Q4: 3 minutes [or other]
Q5: No override [or Internal team]
Q6: All four gating rules [or modified to:]
```

Then we lock these in code, and Phase 3.1 starts.

---

## Risk Checklist (Pre-Launch)

Before deploying to production, confirm:

- [ ] Confidence scorer tested with 20+ patches (accuracy ±5%)
- [ ] Docker sandbox tested on Railway environment
- [ ] Vulnerability gating tested (99 confidence attempts still blocked)
- [ ] Concurrency queue tested with 10+ concurrent repairs
- [ ] Timeout auto-cancel tested (partial results preserved)
- [ ] Audit trail verified (every decision logged)
- [ ] GitHub token scoped correctly (push, branch, PR permissions only)
- [ ] Sentry monitoring in place (repair errors alerted)
- [ ] Cost tracking validated (±20% accuracy)
- [ ] Dashboard displays confidence breakdown accurately

---

## Success Definition (Phase 3 Complete)

Phase 3 is done when:

- ✅ Repair service deployed to production
- ✅ 50+ repairs completed (mix of low/medium/high confidence)
- ✅ 0 security incidents (Docker escape, prompt injection, etc.)
- ✅ 0 unintended auto-merges (human review always required)
- ✅ Fast lane PR merge time < 24 hours
- ✅ Standard PR merge time < 48 hours
- ✅ PR merge success rate > 95% (repairs user actually accepts)
- ✅ Confidence score accuracy ±5% (actual vs predicted)
- ✅ Cost per repair < $0.50 average
- ✅ Uptime > 99.5%

---

## Approval Checklist

**Before starting Phase 3.1, get sign-off on:**

- [ ] Governance Policy (all 5 decisions locked)
- [ ] Confidence Framework (4 components, scoring tables)
- [ ] Technical Design (FastAPI, Supabase schema, API endpoints)
- [ ] 6 Questions answered and locked in code
- [ ] Risk checklist reviewed
- [ ] Success definition agreed

---

## What I Need from You

### To Proceed with Phase 3.1 (FastAPI Scaffold):

1. **Answer the 6 questions above**
2. **Read `PHASE_3_DESIGN_SUMMARY.md`** (confirm high-level architecture)
3. **Confirm** you're comfortable with confidence scoring (vibes → math)
4. **Confirm** these governance rules are enforceable and you want them enforced

Once you confirm, I'll start Phase 3.1:

- Create FastAPI service directory structure
- Define Pydantic models (type-safe requests)
- Create Supabase schema migration
- Implement job submission endpoint
- Deploy to Railway

**Estimated: 3-4 days**

---

## Timeline Reminder

```
Phase 3.0: Planning + Governance (TODAY) ✅
Phase 3.1: Core Service (2 weeks)
Phase 3.2: Beam Search (2 weeks)
Phase 3.3: GitHub Integration (1 week)
Phase 3.4: Dashboard UI (1 week)
────────────────────────────────
Total: 6 weeks
```

We're at the gate. Ready to go in?

---

## Next Message from You

Reply with:

```
Q1: [98% or 95%]
Q2: [97% or other]
Q3: [3 or 4 or 5]
Q4: [2m or 3m or 5m]
Q5: [No, Internal, or Power User]
Q6: [Yes to all four, or modifications]

Approval: [YES, I'm comfortable with this governance] or [CHANGES NEEDED]
```

Then Phase 3.1 kicks off. Let's build something dangerous in a good way.

