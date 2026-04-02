# Penny Phase 3: Governance Decisions LOCKED

**Date Locked:** 2026-04-02  
**Locked By:** Founder decision  
**Status:** BINDING — All Phase 3 implementation must comply

---

## Decision 1: Fast Lane Confidence Threshold
**Value:** 98%  
**Meaning:** Only repairs with ≥98% confidence create "Ready PR" (no draft)  
**Enforcement:** Code-level (confidence_scorer.py, route_to_action())

---

## Decision 2: Vulnerability Confidence Minimum
**Value:** 97%  
**Meaning:** Security/vulnerability repairs require ≥97% confidence to attempt  
**Enforcement:** Code-level assertion in repair executor

---

## Decision 3: Concurrency Limit Per Repo
**Value:** 4 concurrent repairs maximum  
**Meaning:** Queue any repairs beyond 4 active per repository  
**Enforcement:** Queue system checks active count before starting repair

---

## Decision 4: Default Repair Timeout
**Value:** 3 minutes (180 seconds)  
**Bounds:** Min 30s, Max 15m (configurable, but clamped)  
**Meaning:** Beam search auto-cancels after 3m, preserves best candidate  
**Enforcement:** Asyncio timeout + auto-cancel logic

---

## Decision 5: Appeals Process
**Value:** Internal team override only (no direct user override)  
**Meaning:** If user disagrees with blocked repair:
  1. Cannot directly override
  2. Can retry with different config (higher depth, longer timeout)
  3. Internal team (via Slack/email) can document exception & approve manually
  4. Exception creates audit trail entry
**Enforcement:** No `/override` endpoint, no UI toggle

---

## Decision 6: Vulnerability Gating Rules (All Four)

### Rule 6a: Confidence Minimum
- Security/vulnerability repairs require ≥97% confidence
- Assertion: `assert confidence >= 97`

### Rule 6b: Locality Minimum  
- Security/vulnerability repairs require ≥90% locality score
- Assertion: `assert locality_score >= 90`

### Rule 6c: No Dependency Upgrades
- Security/vulnerability repairs cannot upgrade dependencies
- Assertion: `assert "upgrade" not in patch_diff.lower()`

### Rule 6d: No New External Imports
- Security/vulnerability repairs cannot add external dependencies
- Assertion: `assert "external" not in reasoning or "local" in reasoning`

---

## Implementation Checklist (Phase 3.1)

- [ ] Create confidence scorer with locked thresholds
- [ ] Implement fast lane routing at 98%
- [ ] Implement vulnerability gating at 97% + 4 rules
- [ ] Implement concurrency queue (max 4 per repo)
- [ ] Implement timeout bounds (30s–900s, default 180s)
- [ ] Implement internal team override flow (Slack integration)
- [ ] Add audit logging for every decision
- [ ] Add internal team override documentation

---

## Locked Dates

- **Phase 3.1:** Starts 2026-04-02, completes ~2026-04-16
- **Phase 3.2:** Starts 2026-04-16, completes ~2026-04-30
- **Phase 3.3:** Starts 2026-04-30, completes ~2026-05-07
- **Phase 3.4:** Starts 2026-05-07, completes ~2026-05-14
- **Deployment:** ~2026-05-14

---

## No Changes Allowed Without Founder Approval

If Phase 3 implementation reveals need to adjust these decisions:
1. Document the constraint
2. Get explicit founder approval
3. Update this file
4. Create new commit with "GOVERNANCE AMENDMENT"

---

**These decisions are now code. Go build.**
