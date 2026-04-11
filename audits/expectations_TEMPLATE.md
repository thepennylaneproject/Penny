# [App Name] — Expectations & Boundaries Document

## 1. Purpose & Scope
> What does this app do? What is it NOT responsible for?

**Responsibilities:**
- 

**Out of Scope:**
- 

---

## 2. API / Interface Contracts
> What endpoints, inputs, and outputs must always exist and behave how?

**Required endpoints:**
- 

**Input validation rules:**
- 

**Response format standards:**
- 

---

## 3. Security Boundaries
> What must never happen from a security perspective?

**Forbidden patterns:**
- No hardcoded secrets or credentials
- No direct database queries from frontend code
- All user input must be sanitized before use

**Required security features:**
- 

---

## 4. Code Standards
> What coding patterns, naming conventions, and structural rules must be followed?

**Language/framework rules:**
- 

**File structure rules:**
- 

**Naming conventions:**
- 

---

## 5. Testing Requirements
> What test coverage and test types are required?

- Minimum test coverage: ___%
- Required test types: unit / integration / e2e
- Tests must pass before merge: yes/no

---

## 6. Performance Boundaries
> What performance characteristics must be maintained?

- Max response time: ___ms
- Prohibited patterns (e.g., N+1 queries, blocking calls):

---

## 7. Dependencies & Integrations
> What external services/packages are allowed or forbidden?

**Approved dependencies:**
- 

**Forbidden dependencies:**
- 

---

## 8. Compliance Checklist
A quick yes/no list the audit agent can scan against:

- [ ] All API endpoints are documented
- [ ] No secrets in source code
- [ ] All inputs validated
- [ ] Tests present and passing
- [ ] Error handling present on all async operations
- [ ] Logging implemented per org standards