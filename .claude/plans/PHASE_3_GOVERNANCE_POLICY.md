# Phase 3: Penny Governance Policy

**"Dangerous in a good way" — Operationalized**

---

## High-Level Decision Summary

Your founder defaults for Penny's autonomy:

| Decision | Your Call | Rationale |
|----------|-----------|-----------|
| **GitHub PR Mode** | Auto branch + ready PR (draft if low confidence) | Keeps velocity high, safety at review layer |
| **Repair Eligibility** | Include vulnerabilities (strict gating) | High-impact fixes, but with high confidence thresholds |
| **Auto-Merge** | Never | Trust is harder to rebuild than reviewing a PR |
| **Concurrency** | 3–5 repairs per repo | Prevents chaos, merge conflicts, CI pipeline hell |
| **Timeout** | 30s–15m (default ~3m), auto-cancel if stuck | Prevents runaway costs and infinite spinners |

---

## Operationalization

These decisions translate into hard rules enforced by code:

---

## Policy 1: Confidence-Based Action Routing

All repairs go through confidence scoring. Action is **determined by confidence score**, not user choice.

### Confidence Buckets → Actions

```
Confidence ≥ 98%
├─ Status: "Fast Lane Ready PR"
├─ Branch: Auto-created (private branch)
├─ PR: Ready for review (not draft)
├─ Labels: ["ai-generated-patch", "penny-repair", "fast-lane"]
├─ Approval: Single approval + CI pass = mergeable
└─ Target User: Engineering leads, senior devs

Confidence 95–97%
├─ Status: "Ready PR"
├─ Branch: Auto-created
├─ PR: Ready for review
├─ Labels: ["ai-generated-patch", "penny-repair"]
├─ Approval: Single approval + CI pass = mergeable
└─ Target User: Mid-level engineers

Confidence 85–94%
├─ Status: "Draft PR"
├─ Branch: Auto-created
├─ PR: Draft (requires explicit "Ready for review" toggle)
├─ Labels: ["ai-generated-patch", "penny-repair", "caution"]
├─ Approval: Explicit decision required before merge
└─ Target User: Reviewers with deep domain knowledge

Confidence 75–84%
├─ Status: "Manual Candidate"
├─ Branch: None yet (user decides)
├─ PR: None yet (user decides)
├─ Display: In "Repair Candidates" panel, not auto-created
├─ Approval: User manually creates PR if interested
└─ Target User: Power users willing to review carefully

Confidence < 75%
├─ Status: "Blocked"
├─ Reason: Shown to user (e.g., "validation_score=55, locality_score=0")
├─ Branch: None
├─ PR: None
├─ Appeal: User cannot override (safety guardrail)
└─ Note: Repairs can be re-attempted with different config
```

### Code Implementation

**File:** `apps/repair-service/services/repair_executor.py`

```python
async def execute_and_route_repair(repair_job_id: UUID) -> None:
    """
    Execute beam search, score confidence, and route to appropriate action.
    """
    # 1. Run beam search
    best_candidate = await beam_search_repair(repair_job_id)
    
    # 2. Score confidence
    confidence_result = ConfidenceScorer().score_repair(
        validation_results=best_candidate.validation_results,
        patch_diff=best_candidate.patch_diff,
        finding_type=job.finding_type,
        finding_severity=job.finding_severity,
        llm_reasoning=best_candidate.llm_reasoning,
    )
    
    confidence = confidence_result['confidence']
    action = confidence_result['action']
    
    # 3. Save results
    await db.update_repair_job(repair_job_id, {
        "best_score": confidence,
        "action": action,
        "confidence_breakdown": confidence_result['breakdown'],
    })
    
    # 4. Route to action
    if action == "fast_lane_ready_pr":
        await route_to_fast_lane_pr(repair_job_id)
    elif action == "ready_pr":
        await route_to_ready_pr(repair_job_id)
    elif action == "draft_pr":
        await route_to_draft_pr(repair_job_id)
    elif action == "do_not_repair":
        await route_to_blocked(repair_job_id)
```

---

## Policy 2: Vulnerability Gating (Strict)

Vulnerabilities are high-impact but high-risk. Gate heavily.

### Rules

**Vulnerability repairs are allowed ONLY if:**

```python
if finding_type == "vulnerability":
    
    # Rule 2a: Must be very confident
    assert confidence >= 97, "Vulnerability requires ≥97% confidence"
    
    # Rule 2b: Must be surgical (no wide refactors)
    assert locality_score >= 90, "Must be localized fix"
    
    # Rule 2c: No dependency upgrades allowed
    assert "upgrade" not in patch_diff.lower(), "No dep upgrades for vulns"
    
    # Rule 2d: No new external dependencies
    assert "import" not in patch_diff or "local" in reasoning, "Only local imports"
    
    # If ANY rule fails → confidence = 0 → blocked
```

### Example: CVE Fix

**Finding:** SQL injection in user lookup

**Confidence:** 96% (close but not quite)

**Result:** BLOCKED (< 97%)

**Message to user:**
```
Vulnerability repairs require ≥97% confidence. 
Your confidence: 96%

Breakdown:
- Validation: 100 (all tests pass) ✅
- Locality: 95 (single function) ✅
- Risk: 85 (security patch) ✅
- Uncertainty: 1% penalty (one phrase: "might break legacy...")

Recommended: Increase max_depth to 4 (allow more refinement) and retry.
```

---

## Policy 3: Never Auto-Merge

Even at 99% confidence, require human review.

### Enforcement

```python
# This endpoint does NOT exist:
# POST /jobs/{id}/auto-merge  ← FORBIDDEN

# This endpoint DOES exist:
# POST /jobs/{id}/create-pr   ← Creates PR (draft or ready)

# Human must:
# 1. Read the PR
# 2. Check the patch
# 3. Verify CI/CD
# 4. Click "Approve" on GitHub
# 5. Merge manually
```

### Why

- Trust is asymmetric (hard to rebuild)
- "99% confidence" ≠ "5% risk" (often unknown unknowns)
- Human review catches edge cases at scale
- Audit trail matters for compliance

### Fast Lane (Alternative to Auto-Merge)

For high-confidence repairs:

**Fast Lane Ready PR:**
- Auto-created, ready for review (not draft)
- Single approval to merge (not 2 reviewers)
- Prioritized in PR queue
- Labels make it obvious: `[fast-lane]`

**Workflow:**
```
Confidence ≥ 98%
    ↓
Create ready PR (not draft)
    ↓
Assign to senior engineer (1 person)
    ↓
They review in <5 minutes (they're used to this)
    ↓
CI passes
    ↓
They click Merge
    ↓
Done (no 2-reviewer overhead)
```

**This is fast without being reckless.**

---

## Policy 4: Concurrency Limiting

Max 3–5 repairs per repository at once.

### Calculation

```python
MAX_CONCURRENT_REPAIRS = 5

def should_queue_repair(repo_id: str) -> bool:
    """
    Check if a new repair can start immediately or should queue.
    """
    active_repairs = db.count_repairs(
        repo_id=repo_id,
        status__in=["in_progress", "queued_for_pr"]
    )
    return active_repairs < MAX_CONCURRENT_REPAIRS

async def dequeue_repairs():
    """
    Periodically (every 30 seconds) check queued repairs and start any
    that have room in their repository's queue.
    """
    queued = db.get_repairs(status="queued", limit=100)
    for repair in queued:
        if should_queue_repair(repair.project_id):
            await start_repair(repair.id)
```

### Why 3–5?

- **3:** Prevents merge conflicts (most repos have 2–3 main developers)
- **5:** Allows parallelism without chaos
- **>5:** Risk of:
  - Merge conflicts between repairs A, B, C
  - CI pipeline overload
  - All repairs failing due to branch conflicts

### Example

```
Scenario: 7 repairs submitted for same repo

Queue:
[repair-1 in_progress] [repair-2 queued] [repair-3 queued]
[repair-4 in_progress] [repair-5 queued]
[repair-6 in_progress] [repair-7 queued]

Status: 3 active, 4 queued
Max: 5 active
Available: 2 slots

→ repair-2 and repair-3 start (both fit in available slots)

As repair-1 completes:
→ repair-5 starts (moves from queued to in_progress)
```

### Dashboard Display

```tsx
<ConcurrencyStatus>
  <ActiveRepairs>
    <Item>repair-1: logic-fix (in progress, 2min/3m est)</Item>
    <Item>repair-4: security-patch (in progress, 1min/3m est)</Item>
    <Item>repair-6: perf-optimize (in progress, 0.5min/2m est)</Item>
  </ActiveRepairs>
  
  <QueuedRepairs>
    <Item>repair-2: data-validation (queued, est 2min wait)</Item>
    <Item>repair-3: style-cleanup (queued, est 4min wait)</Item>
    <Item>repair-5: logic-bug (queued, est 5min wait)</Item>
    <Item>repair-7: ux-improvement (queued, est 7min wait)</Item>
  </QueuedRepairs>
  
  <Status>
    Capacity: 3/5 active
    Next slot available in: ~1 min (when repair-1 completes)
  </Status>
</ConcurrencyStatus>
```

---

## Policy 5: Timeout with Auto-Cancel

Repairs have hard time limits. If stuck, auto-cancel and save work.

### Rules

```python
MIN_TIMEOUT = 30  # seconds
DEFAULT_TIMEOUT = 180  # 3 minutes
MAX_TIMEOUT = 900  # 15 minutes

# User can configure, but clamped within bounds
user_timeout = clamp(config.timeout_seconds, MIN_TIMEOUT, MAX_TIMEOUT)

# If confidence is low, reduce max timeout to prevent wasted spend
if confidence_estimate < 0.70:
    timeout = min(timeout, 180)  # Force max 3 min for low-confidence repairs
```

### Auto-Cancel Behavior

```python
async def execute_repair_with_timeout(repair_job_id, timeout_seconds):
    try:
        result = await asyncio.wait_for(
            beam_search_repair(repair_job_id),
            timeout=timeout_seconds
        )
        return result
    
    except asyncio.TimeoutError:
        # Don't discard work—save partial results
        best_so_far = get_best_candidate_so_far(repair_job_id)
        
        if best_so_far and best_so_far.score >= 75:
            # Good enough to present
            return best_so_far
        else:
            # Not ready, block the repair
            await mark_repair_blocked(
                repair_job_id,
                reason=f"Timeout after {timeout_seconds}s. Best score: {best_so_far.score if best_so_far else 0}%"
            )
            return None
```

### Example

**User config:** beam_width=10, max_depth=5, timeout=60s

**Reality:** 60s is too short for that config
- Layer 0: 20 candidates × 10s eval = 200s
- Timeout fires at 60s (during layer 0)

**What happens:**
```
Repair starts...
60 seconds pass, no completion
→ Auto-cancel
→ Get best candidate from layer 0 (say, 45% confidence)
→ Block the repair (45% < 75%)
→ Message: "Timeout. Best score was 45%. Try higher timeout or lower beam_width."
```

### Dashboard Feedback

```tsx
<RepairTimeoutWarning>
  <Alert type="warning">
    Your timeout (60s) may be too low for this configuration.
    Estimated time: 180s+
    
    Suggestions:
    • Increase timeout to 240s, or
    • Reduce beam_width to 3, or
    • Reduce max_depth to 3
  </Alert>
</RepairTimeoutWarning>
```

---

## Enforcement Matrix

| Policy | Enforced By | Bypass Possible? | Notes |
|--------|-------------|------------------|-------|
| Confidence-based routing | Code (service) | No | Score computed, action determined |
| Vulnerability gating | Code (assert) | No | Hard blocking condition |
| No auto-merge | Missing endpoint | No | Endpoint doesn't exist |
| Concurrency limiting | Queue system | No | Hard limit enforced |
| Timeout bounds | Code + clamping | No | User input clamped to [30, 900] |

---

## Audit Trail

Every repair logs:

```json
{
  "repair_job_id": "uuid",
  "finding_id": "logic-001",
  "confidence_score": 88,
  "confidence_breakdown": {
    "validation": 100,
    "locality": 100,
    "risk": 75,
    "uncertainty": 0
  },
  "action": "ready_pr",
  "pr_created": true,
  "pr_number": 234,
  "pr_merged": true,
  "pr_merged_by": "user@example.com",
  "pr_merged_at": "2026-04-03T15:30:00Z",
  "cost_usd": 0.42,
  "duration_seconds": 180,
  "outcome": "success" // success | partial | blocked
}
```

---

## Escalation & Appeals

What if a user disagrees with a blocked repair?

### No Direct Override

Users **cannot override** blocking decisions.

Instead:

1. **Try again with different config:**
   - Increase max_depth (for more refinement)
   - Increase timeout (for more exploration)
   - Reduce beam_width (for faster iterations)

2. **Understand the bottleneck:**
   - Dashboard shows why it was blocked
   - "validation_score=45%: test failures in X, Y, Z"
   - User can fix those things manually, then re-audit

3. **Escalate to team:**
   - If "fast lane" repair has high confidence but low locality score
   - Create internal Slack message: "@architecture review this patch"
   - They can document exception & approve manually

**Philosophy:** Constraints are features, not bugs. Penny learns from blocked repairs.

---

## Success Metrics (Phase 3 Completion)

Track these to validate governance:

| Metric | Target | Method |
|--------|--------|--------|
| False positive rate | <2% | PRs merged successfully / total merged |
| False negative rate | <10% | Blocked repairs that would have worked / total blocked |
| Avg confidence accuracy | ±5% | Compare confidence score to PR outcomes |
| Fast lane merge time | <24h | Time from PR ready → merged |
| Standard PR merge time | <48h | Time from PR ready → merged |
| Vulnerability patch success | 100% | Zero security patch failures |
| Concurrent repair conflicts | 0 | Merge conflict incidents / month |
| User satisfaction | >80% | Post-repair survey |

---

## Phase 3.1 Deliverables (Governance)

By end of Phase 3.1, implement:

- [ ] Confidence scorer service
- [ ] Confidence-to-action routing logic
- [ ] Vulnerability gating rules (hard asserts)
- [ ] Concurrency queue system
- [ ] Timeout bounds + auto-cancel
- [ ] Audit logging (every repair decision)
- [ ] Dashboard confidence display + breakdown

---

## Questions for You

1. **Vulnerability confidence threshold:** 97% feels right, but want to dial it in?
   - Too strict: Miss opportunity to fix real vulnerabilities
   - Too loose: Risk reckless patches

2. **Concurrency default:** 3 or 5 per repo?
   - 3 = conservative (fewer conflicts)
   - 5 = faster (more parallelism)

3. **Timeout defaults:** 3 minutes or 5 minutes default?
   - 3m = cheaper, faster feedback
   - 5m = better chances at high beam widths

4. **Fast lane threshold:** 98% or 95%?
   - 98% = very selective
   - 95% = broader fast lane

5. **Appeals process:** Should there be an internal team override?
   - Yes: Allows exceptions for edge cases
   - No: Keeps system absolutely consistent

---

## Next Steps

1. **Confirm this governance policy** (or tweak)
2. **Implement confidence scorer** (Phase 3.1)
3. **Wire into routing logic** (Phase 3.1)
4. **Monitor metrics post-launch** (Phase 3.4+)

**Ready to lock these in?**
