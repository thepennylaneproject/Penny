You are conducting a comprehensive intelligence extraction of the Penny codebase. Your goal is to produce a structured, investor-grade profile of this project by reading the actual code, configuration, documentation, and commit history. Do not hallucinate or infer — only report what you can verify from the codebase itself. Where you identify gaps, flag them explicitly.

Work through every section below. Be thorough. Be precise. Be honest about what's mature and what's early.

SECTION 1: PROJECT IDENTITY
Project name (as defined in package.json, config files, or README)
Repository URL (if available in config/remotes)
One-line description (pull from README, package.json description, or meta tags — quote it exactly, then write a cleaner version if needed)
Project status — Based on what you see in the code, classify as one of:
Concept (mostly scaffolding/boilerplate)
Prototype (core features partially implemented)
Alpha (core features working, rough edges)
Beta (feature-complete for v1, needs polish)
Production (deployed, handling real users)
First commit date and most recent commit date
Total number of commits
Deployment status — Is this deployed? Where? (check for netlify.toml, vercel.json, Dockerfiles, CI/CD configs, environment configs referencing production URLs)
Live URL(s) if discoverable in config
SECTION 2: TECHNICAL ARCHITECTURE
Primary language(s) and frameworks (with versions from package.json, requirements.txt, etc.)
Full dependency list — Group into:
Core framework dependencies
UI/styling libraries
State management
API/data layer
AI/ML integrations
Authentication/authorization
Testing
Build tooling
Other notable dependencies
Project structure — Provide the top-level directory tree (2 levels deep) with a one-line explanation of each major directory's purpose
Architecture pattern — What pattern is this? (monolith, microservices, serverless functions, JAMstack, etc.) Describe the data flow from user interaction to database and back.
Database/storage layer — What databases, ORMs, or storage solutions are in use? List all tables/collections you can identify from schema files, migrations, or model definitions. For each table, note its columns/fields.
API layer — Document all API endpoints or serverless functions. For each, note:
Route/path
HTTP method
Brief purpose
Authentication required (yes/no)
External service integrations — List every third-party API or service the code connects to (Stripe, OpenAI, SendGrid, etc.) with what it's used for
AI/ML components — If the project uses AI, detail:
Which models/providers
What prompts or chains exist (summarize, don't reproduce full prompts)
How AI output is processed and presented to users
Authentication and authorization model — How do users log in? What permission levels exist?
Environment variables — List all env vars referenced in the code (names only, never values) grouped by purpose
SECTION 3: FEATURE INVENTORY
For each distinct feature or capability in the application:

Feature name
User-facing description (what does this let a user do?)
Implementation completeness — classify as:
Scaffolded (route/component exists but minimal logic)
Partial (core logic works, UI incomplete or vice versa)
Functional (works end-to-end)
Polished (works well, handles edge cases, good UX)
Key files (list the 2-5 most important files for this feature)
Dependencies on other features
SECTION 4: DESIGN SYSTEM & BRAND
Color palette — Extract all defined colors from:
Tailwind config
CSS custom properties / variables
Theme files
Any design token files List each color with its name, hex value, and where it's defined.
Typography — What fonts are loaded? What's the type scale?
Component library — Is there a shared component system? List all reusable UI components with a one-line description of each.
Design language — Based on the UI code, describe the visual style (minimal, playful, corporate, editorial, etc.)
Responsive strategy — How does the app handle mobile vs desktop?
Dark mode — Is it supported? How is it implemented?
Brand assets — List any logos, illustrations, or custom icons in the repo
SECTION 5: DATA & SCALE SIGNALS
User model — What data is stored per user? What's the user journey from signup to value?
Content/data volume — Are there seed files, fixture data, or references to data volume? How many records does the system seem designed to handle?
Performance considerations — Any caching, pagination, lazy loading, code splitting, rate limiting, or optimization patterns?
Analytics/tracking — Is there any analytics integration? What events are tracked?
Error handling — How are errors caught, logged, and reported?
Testing — What test coverage exists? List test files found and what they cover.
SECTION 6: MONETIZATION & BUSINESS LOGIC
Pricing/tier structure — Is there any pricing logic, plan definitions, or feature gating in the code?
Payment integration — Stripe, PayPal, or other payment processing?
Subscription/billing logic — Recurring payments? Trial periods? Plan limits?
Feature gates — What features are restricted by plan/tier?
Usage limits — Any rate limits, quotas, or credit systems?

For each item found above, extract the SPECIFIC RULE — not just that it exists, but what value it enforces:
- Revenue splits: What percentage? (e.g., "85% creator / 15% platform" — search for decimal constants near payment logic)
- Cost budgets: What are the per-request and daily limits? (search CostTracker, budget checks, rate limiters)
- Workflow ordering: What must happen before what? (e.g., "wallet verified BEFORE payout" — trace execution dependencies)
- Feature gating: Which features are intentionally hidden and why? (search feature flags, UI conditionals, phase comments)
- Send/rate limits: What are the actual numeric thresholds? (search for rateLimit, maxPerDay, perRequest constants)

If code evidence exists for a business rule but the exact constraint value is unclear or undocumented, flag it as:
UNDOCUMENTED CONSTRAINT: [description of what exists] — value/policy unclear, needs owner input
SECTION 7: CODE QUALITY & MATURITY SIGNALS
Code organization — Is there a clear separation of concerns? Are there well-defined modules/layers?
Patterns and conventions — What design patterns are used? (facade, repository, dependency injection, etc.) Are naming conventions consistent?
Documentation — README quality, inline comments, JSDoc/docstrings, architecture docs?
TypeScript usage — How strict? Any any types? Are interfaces well-defined?
Error handling patterns — Consistent try/catch? Custom error classes? User-facing error messages?
Git hygiene — Commit message patterns, branching strategy, PR history?
Technical debt flags — TODOs, FIXMEs, deprecated code, commented-out blocks, obvious workarounds?
Security posture — Input validation, SQL injection protection, XSS prevention, CORS config, secrets management?
SECTION 8: ECOSYSTEM CONNECTIONS
Shared code or patterns with other projects in The Penny Lane Project portfolio (Relevnt, Codra, Ready, Mythos, embr, passagr, advocera)
Shared dependencies or infrastructure (same Supabase instance? Same Netlify account? Shared component libraries?)
Data connections — Does this project read from or write to any data source shared with other projects?
Cross-references — Any imports, links, or references to sister projects in the code?
SECTION 9: WHAT'S MISSING (CRITICAL)
Based on your analysis, identify:

Gaps for a production-ready product — What would need to be built to serve real users at scale?
Gaps for investor readiness — What metrics, documentation, or infrastructure is missing that an investor would expect?
Gaps in the codebase itself — Dead code, unused dependencies, incomplete migrations, orphaned files?
Recommended next steps — If you had to prioritize the top 5 things to work on next, what would they be and why?

MATURITY CLASSIFICATION
Classify the project as one of:
- ALPHA: Core features partially working, significant gaps, not user-ready
- BETA: Feature-complete for v1, known rough edges, limited production use
- PRODUCTION: Deployed, handling real users, incident response in place

Then assess INVESTOR READINESS. List each item as PRESENT or MISSING:
- Core flow works end-to-end
- No P0 security vulnerabilities
- Error monitoring configured (Sentry, Bugsnag, or equivalent)
- Conversion/retention metrics available
- Uptime monitoring in place
- Technical debt quantified and tracked

SECTION 10: CONSTRAINT CATALOG
This section is the primary input for the project's expectations document. Produce a structured catalog of every enforceable rule you can infer from the codebase. This is not a summary — it is a constraint engineering output.

For each constraint, use this exact format:
CONSTRAINT: [specific, falsifiable rule — not a description of what exists, but what must always be true]
DOMAIN: [Architecture | Database | Security | API | Business Logic | Operations | Quality]
SEVERITY: [CRITICAL — blocks deployment | WARNING — needs approval | SUGGESTION — best practice]
EVIDENCE: [file path or pattern that proves this rule is in use]
VERIFY BY: [how an auditor would check compliance — grep pattern, schema check, test, etc.]
VIOLATION: [what to flag and at what severity if this rule is broken]

Cover all of these domains — if a domain has no constraints discoverable, write "No constraints found — needs owner input":

Architecture Constraints:
- Framework/runtime locks (e.g., "All server logic must run as Netlify Functions — no standalone Node server")
- API routing patterns (e.g., "All API routes must be prefixed /v1")
- Service abstraction rules (e.g., "All AI provider calls must route through AIRouter — no direct SDK calls in UI")
- Media/upload handling (e.g., "All uploads through S3 presigned URLs only")

Database & Data Layer Constraints:
- ORM/query rules (e.g., "All queries through Prisma — no raw SQL in application code")
- RLS requirements (e.g., "RLS must be enabled on every Supabase table")
- Migration rules (e.g., "Every schema change requires a numbered migration file")
- Schema enforcement (e.g., "All foreign keys must have explicit ON DELETE behavior")

Security & Authentication Constraints:
- Auth guard requirements (e.g., "All protected routes must have JwtAuthGuard")
- Secrets management (e.g., "No API keys in client-side code — all secrets in server env vars only")
- Token handling (e.g., "Refresh tokens must be httpOnly cookies — never localStorage")
- Credential rotation (e.g., "Service account keys must not be committed")

Business Logic Constraints (extract from code, do NOT invent):
- Revenue/split rules (e.g., "Creator payout rate must be 0.85 — never below")
- Workflow ordering (e.g., "Wallet must be verified before any payout is processed")
- Cost controls (e.g., "Per-request AI cost must not exceed $0.05 — enforced in CostTracker")
- Feature gating (e.g., "Phase-2 music features must remain behind ENABLE_MUSIC_PHASE2 flag")
- Send/rate limits (e.g., "Campaign send rate must not exceed 500/hour per account")

Operational Policy Constraints:
- Technical debt gates (e.g., "TypeScript compilation must have 0 errors — @ts-ignore additions banned")
- Quality gates (e.g., "Test coverage must not fall below 70%")
- Deployment requirements (e.g., "Error monitoring must be active before any production deploy")
- Rollback procedures (e.g., "Every deploy must have a documented rollback path")

If you find code evidence for a constraint but cannot determine the exact rule value (e.g., CostTracker exists but no budget constant is set), output:
CONSTRAINT: [description of what should be constrained]
DOMAIN: [domain]
SEVERITY: CRITICAL
EVIDENCE: [file where the mechanism exists]
VERIFY BY: Owner must define and document this value
VIOLATION: Cannot audit until constraint value is defined — flag as UNDOCUMENTED CONSTRAINT
SECTION 11: EXECUTIVE SUMMARY

Paragraph 1: What this is, what problem it solves, and for whom
Paragraph 2: Technical credibility — what's built, how it's built, and what it signals about the builder's capabilities
Paragraph 3: Honest assessment of current state and what it would take to reach the next milestone
OUTPUT FORMAT
Return the completed audit as a single structured document using the exact section headers above. Use code blocks for file paths and technical details. Use tables where they improve readability (dependency lists, feature inventories, API endpoints). Flag every instance where information was not found in the codebase versus where you inferred it.

End your output with a metadata block:

Code
---
AUDIT METADATA
Project: [PROJECT_NAME]
Date: [TODAY'S DATE]
Agent: [MODEL NAME AND VERSION]
Codebase access: [full repo / partial / read-only]
Confidence level: [high / medium / low] with explanation
Sections with gaps: [list section numbers]
Total files analyzed: [count]
---
