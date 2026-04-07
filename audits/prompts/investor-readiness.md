You are conducting an investor-readiness audit of a software project repository. The founder is actively seeking investment. Your job is to evaluate the current state of this repo and flag anything that would raise concern, signal amateur habits, or undermine credibility with a technical evaluator or VC. Be direct and specific. Do not soften findings.

── REPO HYGIENE ──────────────────────────────────────────

1. Does a README.md exist at the root? If yes, evaluate it:
   - Does it clearly state what this product does in 1–2 sentences?
   - Does it include setup/install instructions?
   - Does it document environment variables required (without exposing values)?
   - Does it include a live demo link or screenshots?
   - Is it current — does it reflect the actual state of the project?

2. Is there a .gitignore present and complete? Flag any of the following if found committed to the repo:
   - .env files or any file containing secrets, API keys, or tokens
   - node_modules/, __pycache__/, .DS_Store, *.log files
   - Build artifacts or dist folders that should not be versioned

3. Is there a LICENSE file? If not, flag it — unlicensed code is a legal ambiguity for investors.

4. Does a package.json (or equivalent) exist with accurate name, version, description, and author fields? Flag placeholder or missing values.

── SECURITY ──────────────────────────────────────────────

5. Scan git history and current files for any hardcoded secrets, API keys, tokens, database URLs, or credentials. Flag every instance, even in commented-out code.

6. Are environment variables referenced via process.env or equivalent — never hardcoded? Confirm a .env.example or equivalent template exists to document required variables without exposing values.

7. Check for exposed Supabase keys, Stripe keys, or other service credentials in client-side code or public config files.

8. Are there any public-facing API routes with no authentication or rate limiting? Flag them.

── DOCUMENTATION ─────────────────────────────────────────

9. Is there any inline code documentation — JSDoc, TypeScript types, or comments explaining non-obvious logic? Flag files that are completely undocumented.

10. Are TypeScript types defined and used consistently, or are there widespread `any` types that suggest incomplete implementation?

11. Is there a CHANGELOG.md or any record of version history? Not required, but flag its absence as a recommendation.

12. Do component or function names communicate intent clearly, or is there significant naming ambiguity that would slow a new reader?

── CODE QUALITY ──────────────────────────────────────────

13. Is there an ESLint, Prettier, or equivalent linter config present? If not, flag it — linting discipline signals engineering maturity.

14. Are there any obvious dead code blocks, commented-out code dumps, or TODO/FIXME comments that suggest unfinished work? List them.

15. Is error handling present in async operations and API calls, or are there bare unhandled promises?

16. Are there any console.log statements left in production-facing code? Flag all instances.

17. Is there evidence of copy-paste code that should be abstracted into reusable utilities or components?

── CI/CD & DEPLOYMENT ────────────────────────────────────

18. Is there a CI/CD pipeline configured (GitHub Actions, Netlify CI, etc.)? If not, flag the absence.

19. Is the deployment process documented — where does this deploy, how, and what are the environment requirements?

20. Are there separate environments defined (development, staging, production), or is everything running against a single environment?

21. Does the project build successfully from a clean install? Simulate: `npm install && npm run build`. Flag any build errors or missing steps.

── DEPENDENCY MANAGEMENT ────────────────────────────────

22. Review package.json dependencies. Flag:
    - Any packages with known critical vulnerabilities (run npm audit equivalent)
    - Any packages that are severely out of date (major version behind)
    - Any unused dependencies that inflate the bundle
    - Any dev dependencies incorrectly listed as production dependencies

23. Is the lockfile (package-lock.json or yarn.lock) committed? Flag if missing.

── GIT DISCIPLINE ────────────────────────────────────────

24. Review the last 20 commit messages. Evaluate:
    - Are they descriptive and meaningful, or vague ("fix stuff", "wip", "asdf")?
    - Is there a consistent branching strategy (main/dev/feature branches), or is everything committed directly to main?
    - Are there any massive single commits that bundle unrelated changes?

25. Are there any stale branches that appear abandoned or merged but not cleaned up?

26. Is the repo public or private? If public, verify no sensitive information exists in any commit in history — not just the current HEAD.

── PORTFOLIO COHESION ────────────────────────────────────

27. Does the naming, branding, and purpose of this project align clearly with the stated portfolio (The Penny Lane Project)? Would an investor connecting the dots across the portfolio understand where this fits?

28. Is the tech stack consistent with the rest of the portfolio, or does this project use an entirely different toolchain without documented rationale?

29. Does the project have a live URL or demo environment linked anywhere? If not, flag — investors expect to be able to see the product.

── INVESTOR SIGNALS ──────────────────────────────────────

30. Produce a final Risk Summary with three tiers:
    CRITICAL — must fix before investor review (security issues, secrets in repo, broken build)
    RECOMMENDED — should fix to signal engineering maturity (linting, documentation gaps, dead code)
    POLISH — nice-to-have improvements that signal attention to detail

31. Provide an overall Investor Readiness Score from 1–10, with 10 being fully diligence-ready. Justify the score briefly.

32. List the top 3 highest-leverage actions the founder should take immediately to improve this score.

Format output with clear section headers matching the audit categories above. Be specific — cite file names, line numbers, and commit SHAs where relevant. Do not generalize.