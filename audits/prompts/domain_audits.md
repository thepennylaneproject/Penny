### Strategy 1 — Pre-audit: build a module manifest first

Before any audit run, generate a **complete map** of your codebase. This becomes the scope boundary every subsequent prompt works against.

> You are a senior software engineer doing a first-pass analysis of a codebase before a deep audit.
>
> Your only job is to produce a **module manifest**: a complete, structured inventory of everything in this repository that will later need to be audited.
>
> For every file, group, or module you can identify, produce an entry with:
>
> - **Path**: file path
> - **Domain**: e.g. Auth, Jobs, Profile, Data Ingestion, UI, Background Jobs, API, Config
> - **Type**: component / hook / service / util / route / schema / migration / config / script
> - **One-line description**: what it does
> - **Complexity**: Low / Medium / High (based on size, branching, dependencies)
>
> At the end, return:
>
> 1. The full manifest as a table
> 2. A **domain map**: which files belong to which domain
> 3. A **recommended audit order**: which domains/files to audit first (highest complexity + highest user impact first)
>
> Do not look for bugs yet. Only map. Be exhaustive — every file counts.

**Once you have this manifest**, you have a finite checklist. Every audit prompt from here on checks off specific items from it until the list is empty.

---

### Strategy 2 — Scope by domain, not the whole app

Instead of dumping the full repo every time, audit **one domain per run**. Use the manifest from Strategy 1 to pick the next unchecked domain.

Add this block to the top of Prompt 1:

> **Scope constraint for this run:**
> You are auditing ONLY the following domain: `[e.g. Jobs / Auto-Apply]`
> Files in scope: `[paste relevant file paths from manifest]`
> All other files are OUT OF SCOPE for this run.
>
> You must examine every file listed above. When you have finished examining all of them, say "COVERAGE COMPLETE: all [N] files in this domain have been reviewed."
> Do not stop before that declaration.

This forces the model to finish the domain before moving on and gives you a natural stopping point.[^4][^5]

---

### Strategy 3 — Feed prior receipts as "already known"

Before every new run, paste your existing bug list and instruct the model to skip duplicates:

> **Already-known bugs (do not re-report these):**
> [Paste ARCH-001 through ARCH-023 titles here]
>
> Your job is to find bugs NOT on this list. If you find something that overlaps with a known bug, note the overlap in one line but do not create a new entry for it. Focus exclusively on **net new findings**.

This is the single highest-leverage change you can make — it transforms each run from a repetitive loop into a genuinely additive one.[^1]

---

### Strategy 4 — Add explicit bug pattern checklists

General prompts get general results. Give the model a concrete checklist of patterns to check, so it can't skip anything or declare itself done early.

Add this block to Prompt 1:

> **You must explicitly check every item on this checklist before declaring this domain complete:**
>
> **Logic \& control flow**
>
> - [ ] All conditional branches have correct logic (no inverted booleans, wrong comparisons)
> - [ ] No off-by-one errors in loops, pagination, or counts
> - [ ] Async/await used correctly everywhere; no unhandled Promises
> - [ ] All early returns and guard clauses are correct
>
> **State management**
>
> - [ ] No state updated before async operations confirm success
> - [ ] No stale closures capturing outdated state
> - [ ] No duplicate or derived state that can become inconsistent
> - [ ] All state transitions are valid (no impossible states reachable)
>
> **Data \& API contracts**
>
> - [ ] All API responses are null-checked before use
> - [ ] No assumptions about response shape that aren't validated
> - [ ] No silent failures on API errors (missing error handling)
> - [ ] No hardcoded values that should be dynamic
>
> **Auth \& access**
>
> - [ ] All routes requiring auth are actually guarded
> - [ ] No user data accessible without ownership check
> - [ ] Sessions/tokens handled correctly on expire or revoke
>
> **Edge cases**
>
> - [ ] Empty state: what happens when lists are empty, user has no data
> - [ ] First-time user flows: no broken assumptions about existing data
> - [ ] Concurrent actions: can two actions race and corrupt state
>
> For each checklist item, either confirm it passes or file a bug. Do not skip any item.

---

## The upgraded workflow

```
STEP 1 (once): Run the Manifest Prompt
         ↓
Returns: full module list, domain map, audit order

STEP 2 (per domain): Run Prompt 1 with:
  - Domain scope (files listed explicitly)
  - Prior receipts pasted in ("already known")
  - Bug pattern checklist attached
  - "COVERAGE COMPLETE" declaration required
         ↓
Returns: net new bugs only, for that domain

STEP 3 (after all domains): Run a synthesis pass
  - Paste all receipts together
  - Ask: "What patterns appear across 3+ domains?"
  - Ask: "What are the top 10 highest-risk bugs overall?"
  - Ask: "What am I missing that a typical audit of this app type would catch?"
         ↓
Returns: cross-domain patterns + risk-ranked master list
```

---

## "Exhaustion" prompt

Add this at the end of every audit prompt to force a clear stopping signal:

> When you have reviewed every file in scope AND checked every item on the checklist, end your response with this block:
>
> `> AUDIT COMPLETE > Domain: [name] > Files reviewed: [N] > Bugs found this run: [N] > Net new bugs (not in prior receipts): [N] > Checklist items passed: [N] / [total] > Checklist items with bugs: [N] / [total] > Confidence level in completeness: [Low / Medium / High] > Reason if not High: [explain] >`

When you start seeing **"Net new bugs: 0"** and **"Confidence: High"** on a domain — you're actually done with it.[^6]

---

## In short

| Problem                       | Fix                                                |
| :---------------------------- | :------------------------------------------------- |
| Infinite findings             | Scope to one domain at a time with a file list     |
| Repeated bugs                 | Paste prior receipts as "already known"            |
| Model skips things            | Add explicit checklist it must check off           |
| No stopping condition         | Require "COVERAGE COMPLETE" + audit complete block |
| Missing cross-domain patterns | Run a final synthesis pass across all receipts     |

This turns your audit from an open-ended loop into a **finite, trackable process** with a real finish line.
