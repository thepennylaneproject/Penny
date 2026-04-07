import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { execFileSync } from "node:child_process";
import type {
  DecisionEvent,
  OnboardingState,
  Project,
  ProjectArtifact,
  ProjectArtifactVersion,
  ProjectProfileSummary,
  ProjectSourceType,
} from "./types";
// Pure helpers with no filesystem access — import from the lightweight module so
// that code paths that only need data-manipulation logic are not forced to drag
// this entire file (and its fs/child_process imports) into the server trace.
import { makeDecisionEvent } from "./onboarding-pure";
export {
  makeDecisionEvent,
  updateOnboardingArtifacts,
  summarizeAuditDecision,
} from "./onboarding-pure";

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".md",
  ".json",
  ".toml",
  ".yaml",
  ".yml",
  ".sql",
  ".css",
  ".html",
]);

// Onboarding prioritises accuracy over speed — see sampleFiles() for strategy.
const MAX_SAMPLE_FILES = 200;
const MAX_FILE_PREVIEW = 6000;  // chars for general source files
const MAX_KEY_FILE_SIZE = 40_000; // chars — netlify functions, migrations, entry points read in full

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".netlify",
  ".cache",
  ".turbo",
  "out",
  "coverage",
  "__pycache__",
  ".vercel",
  ".svelte-kit",
  ".nuxt",
  ".output",
  "archive_closet",
]);

export interface OnboardRepositoryInput {
  name?: string;
  repository_url?: string;
  default_branch?: string;
  actor?: string;
}

interface RepoAccess {
  path: string;
  sourceType: ProjectSourceType;
  sourceRef: string;
  repositoryUrl?: string;
  cleanup?: () => void;
}

interface RepoSnapshot {
  projectName: string;
  rootPath: string;
  repositoryUrl?: string;
  sourceType: ProjectSourceType;
  sourceRef: string;
  defaultBranch?: string;
  firstCommitDate?: string;
  latestCommitDate?: string;
  commitCount?: number;
  fileCount: number;
  packageName?: string;
  description?: string;
  readmeQuote?: string;
  deploymentSignals: string[];
  liveUrls: string[];
  configFiles: string[];
  scanRoots: string[];
  languages: string[];
  frameworks: string[];
  dependencyGroups: Record<string, string[]>;
  envVars: string[];
  testFiles: string[];
  allFilePaths: string[];
  topLevelTree: Array<{ path: string; note: string }>;
  fileSamples: Array<{ path: string; excerpt: string }>;
  commands: {
    test?: string;
    lint?: string;
    build?: string;
    typecheck?: string;
  };
  stack: Project["stack"];
  profileSummary: ProjectProfileSummary;
  // Deep-analysis fields — populated after fileSamples are read
  databaseSchema: string;
  stateStores: string[];
  architectureDetail: string;
  criticalFileSummaries: Array<{ file: string; role: string; exports: string[]; behaviors: string[] }>;
}

export function deriveProjectName(input: OnboardRepositoryInput): string {
  const explicit = input.name?.trim();
  if (explicit) return explicit;
  const repo = input.repository_url?.trim();
  if (repo) {
    const cleaned = repo.replace(/\/+$/g, "").replace(/\.git$/i, "");
    const last = cleaned.split("/").filter(Boolean).pop();
    if (last) return last;
  }
  throw new Error("Project name or repository_url is required");
}

export function createDraftProjectFromRepository(
  input: OnboardRepositoryInput
): Project {
  const actor = input.actor?.trim() || "dashboard";
  const access = resolveRepoAccess(input);
  try {
    const snapshot = collectRepoSnapshot(access, input.default_branch, input.name);
    const now = new Date().toISOString();
    const profileArtifact = makeArtifact(
      buildProjectProfile(snapshot),
      "generated",
      "draft"
    );
    const expectationsArtifact = makeArtifact(
      buildExpectations(snapshot),
      "generated",
      "draft"
    );
    const events: DecisionEvent[] = [
      makeDecisionEvent(actor, "onboarding_profile_generated", "profile", {
        after: { version: profileArtifact.draft?.version, source: profileArtifact.draft?.source },
      }),
      makeDecisionEvent(actor, "onboarding_expectations_generated", "expectations", {
        after: { version: expectationsArtifact.draft?.version, source: expectationsArtifact.draft?.source },
      }),
    ];
    const onboardingState: OnboardingState = {
      stage: "operator_review",
      reviewRequired: true,
      updatedAt: now,
      events,
    };
    return {
      name: snapshot.projectName,
      findings: [],
      lastUpdated: now,
      repositoryUrl: snapshot.repositoryUrl,
      status: "draft",
      sourceType: snapshot.sourceType,
      sourceRef: snapshot.sourceRef,
      stack: snapshot.stack,
      auditConfig: {
        defaultBranch: snapshot.defaultBranch,
        scanRoots: snapshot.scanRoots,
        configFiles: snapshot.configFiles,
        commands: snapshot.commands,
      },
      profile: profileArtifact,
      expectations: expectationsArtifact,
      onboardingState,
      decisionHistory: events,
      profileSummary: snapshot.profileSummary,
    };
  } finally {
    access.cleanup?.();
  }
}

function makeArtifact(
  content: string,
  source: "generated" | "manual",
  status: "draft" | "active"
): ProjectArtifact {
  const version: ProjectArtifactVersion = {
    version: 1,
    status,
    content,
    generatedAt: new Date().toISOString(),
    source,
  };
  return status === "active" ? { active: version } : { draft: version };
}


function resolveRepoAccess(input: OnboardRepositoryInput): RepoAccess {
  const repoUrl = input.repository_url?.trim();
  if (!repoUrl) {
    throw new Error("repository_url is required");
  }

  const branch = input.default_branch?.trim();
  const cloneArgs = ["clone", "--depth", "1"];
  if (branch) {
    cloneArgs.push("-b", branch);
  }
  cloneArgs.push(repoUrl);

  const target = mkdtempSync(join(tmpdir(), "penny-onboard-"));
  cloneArgs.push(target);
  try {
    // Full clone — no depth limit so commit history, count, and dates are accurate.
    // This takes longer than --depth 1 but onboarding correctness is worth it.
    execFileSync("git", ["clone", repoUrl, target], {
      stdio: "pipe",
      encoding: "utf8",
      timeout: 180_000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not clone repository: ${message}`);
  }

  return {
    path: target,
    sourceType: "git_url",
    sourceRef: repoUrl,
    repositoryUrl: repoUrl,
    cleanup: () => {
      try {
        execFileSync("rm", ["-rf", target], { stdio: "ignore" });
      } catch {
        /* ignore */
      }
    },
  };
}

function collectRepoSnapshot(access: RepoAccess, defaultBranch?: string, providedName?: string): RepoSnapshot {
  const root = access.path;
  const files = listFiles(root);
  // In monorepos the root has no package.json — find the sub-package with the most deps
  const pkg = readJsonIfExists(join(root, "package.json")) ?? findMonorepoPackageJson(root, files);
  const pyproject = readTextIfExists(join(root, "pyproject.toml"));
  // requirements.txt may live in a sub-package (e.g. repair_engine/)
  const requirements =
    readTextIfExists(join(root, "requirements.txt")) ||
    files
      .filter((f) => /^[^/]+\/requirements\.txt$/.test(f))
      .map((f) => readTextIfExists(join(root, f)))
      .find((t) => Boolean(t.trim())) ||
    "";
  const readmePath = findReadme(root);
  const readmeText = readmePath ? readTextIfExists(readmePath) : "";
  const scanRoots = detectScanRoots(files);
  const configFiles = detectConfigFiles(files);
  const topLevelTree = describeTopLevel(root);
  const dependencyGroups = groupDependencies(pkg, requirements);
  const envVars = extractEnvVars(files, root);
  const testFiles = files.filter((file) => /(^|\/)(test|tests|__tests__|spec)[/._-]/i.test(file));
  const packageScripts =
    pkg && typeof pkg === "object" && typeof pkg.scripts === "object"
      ? (pkg.scripts as Record<string, string>)
      : {};
  const languages = detectLanguages(files);
  const frameworks = detectFrameworks(pkg, pyproject, files);
  const deploymentSignals = detectDeploymentSignals(files, root);
  const liveUrls = extractUrls(files, root).filter((url) => /^https?:\/\//.test(url));
  const gitInfo = readGitInfo(root);
  // Deep analysis — depends on fileSamples, computed after main fields
  const fileSamplesEarly = sampleFiles(files, root);
  const stack = {
    language: languages[0] || guessPrimaryLanguage(files),
    framework: frameworks[0] || "unknown",
    build: detectBuildTool(pkg, files),
    hosting: detectHosting(files),
    database: detectDatabase(pkg, pyproject, files),
    css: detectCss(pkg, files),
  };
  const projectName =
    deriveProjectName({
      name:
        providedName ||
        (pkg && typeof pkg.name === "string" && pkg.name) ||
        basename(root),
    });
  return {
    projectName,
    rootPath: root,
    repositoryUrl: access.repositoryUrl,
    sourceType: access.sourceType,
    sourceRef: access.sourceRef,
    defaultBranch: defaultBranch || gitInfo.defaultBranch,
    firstCommitDate: gitInfo.firstCommitDate,
    latestCommitDate: gitInfo.latestCommitDate,
    commitCount: gitInfo.commitCount,
    fileCount: files.length,
    packageName: pkg && typeof pkg.name === "string" ? pkg.name : undefined,
    description:
      (pkg && typeof pkg.description === "string" && pkg.description) ||
      undefined,
    readmeQuote: extractReadmeQuote(readmeText),
    deploymentSignals,
    liveUrls: [...new Set(liveUrls)].slice(0, 10),
    configFiles,
    scanRoots,
    languages,
    frameworks,
    dependencyGroups,
    envVars,
    testFiles,
    allFilePaths: files,
    topLevelTree,
    fileSamples: fileSamplesEarly,
    commands: {
      test: packageScripts.test,
      lint: packageScripts.lint,
      build: packageScripts.build,
      typecheck: packageScripts.typecheck,
    },
    stack,
    databaseSchema: extractDatabaseSchema(fileSamplesEarly),
    stateStores: extractZustandStores(fileSamplesEarly),
    architectureDetail: detectArchitectureDetail(pkg, files, fileSamplesEarly),
    criticalFileSummaries: summarizeCriticalFiles(fileSamplesEarly),
    profileSummary: {
      status: classifyRepoStatus(files, testFiles, deploymentSignals),
      languages,
      frameworks,
      deployment:
        deploymentSignals.length > 0 ? deploymentSignals.join(", ") : "not detected",
      liveUrls: [...new Set(liveUrls)].slice(0, 5),
    },
  };
}

// ---------------------------------------------------------------------------
// Deep analysis — schema, architecture, state, critical-file summaries
// ---------------------------------------------------------------------------

function extractDatabaseSchema(fileSamples: Array<{ path: string; excerpt: string }>): string {
  const tables = new Map<string, Set<string>>();
  const migrations = fileSamples.filter(
    (s) => /migrations?\/.*\.sql$/i.test(s.path) || /schema\.sql$/i.test(s.path)
  );

  for (const sample of migrations) {
    // CREATE TABLE [IF NOT EXISTS] [schema.]name (body)
    for (const m of sample.excerpt.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?\w+"?\.)?"?(\w+)"?\s*\(([\s\S]*?)(?:\n\s*\);)/gi
    )) {
      const tableName = m[1].toLowerCase();
      // Skip system/extension tables
      if (/^(spatial_ref_sys|schema_migrations|_prisma|pg_)/i.test(tableName)) continue;
      const body = m[2];
      const cols = body
        .split(/\r?\n/)
        .map((l) => l.trim().match(/^"?(\w+)"?\s+\w/)?.[1] ?? "")
        .filter((c) => c && !c.match(/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT|INDEX|EXCLUDE|id$)/i) && c.length > 1);
      const set = tables.get(tableName) ?? new Set<string>();
      // Also capture id explicitly if present
      if (/\bUUID\b|\bSERIAL\b/i.test(body)) set.add("id");
      cols.forEach((c) => set.add(c));
      tables.set(tableName, set);
    }
    // ALTER TABLE name ADD COLUMN col
    for (const m of sample.excerpt.matchAll(
      /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:"?\w+"?\.)?"?(\w+)"?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi
    )) {
      const tableName = m[1].toLowerCase();
      if (/^(spatial_ref_sys|schema_migrations)/i.test(tableName)) continue;
      const set = tables.get(tableName) ?? new Set<string>();
      set.add(m[2]);
      tables.set(tableName, set);
    }
  }

  if (tables.size === 0) return "[NOT FOUND IN CODEBASE]";
  return [...tables.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([table, cols]) => {
      const list = [...cols].slice(0, 10);
      const more = cols.size > 10 ? ` + ${cols.size - 10} more cols` : "";
      return `- **${table}**: ${list.join(", ")}${more}`;
    })
    .join("\n");
}

function extractZustandStores(fileSamples: Array<{ path: string; excerpt: string }>): string[] {
  const stores: string[] = [];
  for (const sample of fileSamples) {
    // Zustand stores use create<T>() — match variable names assigned to create(
    for (const m of sample.excerpt.matchAll(/(?:export\s+)?const\s+(use\w+(?:Store|State)|use\w+)\s*=\s*create[<(]/g)) {
      if (!stores.includes(m[1])) stores.push(m[1]);
    }
    // File-name-based detection for store files that export a default store
    const base = sample.path.split("/").pop()?.replace(/\.(ts|tsx|js)$/, "") ?? "";
    if (/Store$|\.store$/i.test(base) && !stores.some((s) => s.toLowerCase().includes(base.toLowerCase()))) {
      stores.push(base);
    }
  }
  return stores;
}

function detectArchitectureDetail(
  pkg: Record<string, unknown> | null,
  allFilePaths: string[],
  fileSamples: Array<{ path: string; excerpt: string }>
): string {
  const deps = dependencyNames(pkg);
  const parts: string[] = [];

  // Build system / entry
  const hasIndexHtml = allFilePaths.includes("index.html");
  // Detect Next.js from deps OR from presence of app/api/*/route.ts (monorepo: dashboard/app/...)
  const hasNextDep = deps.has("next");
  const hasAppRouterFiles = allFilePaths.some((f) => /(?:^|[^/]+\/)app\/.*\/route\.(ts|js)$/.test(f));
  if (deps.has("vite") && hasIndexHtml) {
    parts.push("**Build**: Vite SPA — `index.html` is the entry point, output bundled to `dist/`");
  } else if (hasNextDep || hasAppRouterFiles) {
    const hasAppDir = allFilePaths.some((f) => /(?:^|[^/]+\/)app\//.test(f));
    parts.push(`**Build**: Next.js (${hasAppDir ? "App Router" : "Pages Router"})`);
  }

  // Routing
  if (deps.has("react-router-dom")) {
    const pkgDeps = pkg && typeof pkg.dependencies === "object"
      ? (pkg.dependencies as Record<string, string>) : {};
    const ver = pkgDeps["react-router-dom"] ?? "";
    parts.push(`**Routing**: React Router DOM ${ver} — client-side SPA routing with \`<BrowserRouter>\` + \`<Routes>\``);
  }

  // State management
  if (deps.has("zustand")) {
    const storeFiles = allFilePaths.filter((f) => /(store|slice)\.(ts|tsx)$/.test(f));
    const storeCount = storeFiles.length;
    parts.push(`**Client state**: Zustand${storeCount > 0 ? ` — ${storeCount} store file${storeCount > 1 ? "s" : ""} detected` : ""}`);
    if (deps.has("immer")) parts.push("**State mutations**: Immer (immutable produce() updates inside Zustand)");
  } else if (deps.has("@reduxjs/toolkit")) {
    parts.push("**Client state**: Redux Toolkit");
  } else if (deps.has("jotai")) {
    parts.push("**Client state**: Jotai atoms");
  }

  // Server state / data fetching
  if (deps.has("@tanstack/react-query") || deps.has("react-query")) {
    parts.push("**Server state**: TanStack React Query — async data fetching, caching, and background refetch");
  }

  // Backend pattern — handle both root-level and monorepo-prefixed netlify/functions/
  const netlifyFnAll = allFilePaths.filter((f) => /(?:^|[^/]+\/)netlify\/functions\/[^/]+\.(ts|js)$/.test(f));
  const hasEdge = allFilePaths.some((f) => /(?:^|[^/]+\/)netlify\/edge-functions\//.test(f));
  if (netlifyFnAll.length > 0) {
    parts.push(
      `**Backend**: ${netlifyFnAll.length} Netlify serverless functions (TypeScript)` +
      (hasEdge ? " + edge functions" : "") +
      " — each function verifies Supabase JWTs before processing"
    );
  } else if (hasAppRouterFiles) {
    const routeCount = allFilePaths.filter((f) => /(?:^|[^/]+\/)app\/api\/.*\/route\.(ts|js)$/.test(f)).length;
    parts.push(`**Backend**: Next.js App Router — ${routeCount} API route handler${routeCount !== 1 ? "s" : ""} under \`app/api/\``);
  }

  // Folder structure — accept both root-level and one-level-deep monorepo paths
  const folders: string[] = [];
  if (allFilePaths.some((f) => /(?:^|[^/]+\/)domain\//.test(f))) folders.push("`domain/` — business types, domain logic, policy");
  if (allFilePaths.some((f) => /(?:^|[^/]+\/)features\//.test(f))) folders.push("`features/` — vertical feature slices");
  if (allFilePaths.some((f) => /(?:^|[^/]+\/)lib\//.test(f))) folders.push("`lib/` — shared utilities, API clients, design tokens");
  if (allFilePaths.some((f) => /(?:^|[^/]+\/)components\//.test(f))) folders.push("`components/` — shared UI components");
  if (allFilePaths.some((f) => /(?:^|[^/]+\/)hooks\//.test(f))) folders.push("`hooks/` — custom React hooks");
  if (folders.length > 0) parts.push(`**Folder structure**: ${folders.join(", ")}`);

  // Validation
  if (fileSamples.some((s) => /z\.object|z\.string|z\.enum/i.test(s.excerpt))) {
    parts.push("**Validation**: Zod schema validation at API boundaries");
  }

  return parts.length > 0 ? parts.join("\n") : "[NOT FOUND IN CODEBASE]";
}

function summarizeCriticalFiles(
  fileSamples: Array<{ path: string; excerpt: string }>
): Array<{ file: string; role: string; exports: string[]; behaviors: string[] }> {
  // Patterns accept an optional leading monorepo subdirectory (e.g. dashboard/, src/)
  // Each pattern includes both the canonical path and common alternates across architectures.
  const targets: Array<{ match: RegExp; role: string }> = [
    // AI provider routing / gateway
    { match: /(?:[^/]+\/)*(?:lib\/ai\/router|providers\/(?:router|gateway))\./i, role: "AI provider router / fallback dispatch" },
    // AI model / provider registry
    { match: /(?:[^/]+\/)*(?:lib\/ai\/registry|providers\/registry)\./i, role: "AI model registry / provider registry" },
    // Netlify / serverless completion endpoints
    { match: /(?:[^/]+\/)*netlify\/functions\/providers\./i, role: "Provider configuration (endpoint + auth)" },
    { match: /(?:[^/]+\/)*(?:netlify\/functions\/ai-complete|app\/api\/engine\/complete\/route)\./i, role: "AI completion endpoint" },
    { match: /(?:[^/]+\/)*(?:netlify\/functions\/ai-stream|app\/api\/engine\/routing\/route)\./i, role: "AI routing / streaming endpoint" },
    { match: /netlify\/functions\/utils\/credential/i, role: "Credential encryption + storage utilities" },
    { match: /netlify\/functions\/utils\/retrieval/i, role: "RAG / retrieval provider utilities" },
    // Domain / pricing
    { match: /(?:[^/]+\/)*domain\/pricing/i, role: "Pricing tiers and feature gating" },
    { match: /(?:[^/]+\/)*domain\/cost-policy/i, role: "Cost and budget enforcement" },
    { match: /(?:[^/]+\/)*domain\/model-selector/i, role: "Model selection strategy" },
    // Model definitions (src/lib/models/ or repair_engine/models/)
    { match: /(?:[^/]+\/)*(?:lib\/models\/(?!__tests__)|models\/types)\./i, role: "Model definitions and metadata" },
    // Task queue / async work
    { match: /(?:[^/]+\/)*(?:domain\/task-queue|queue\/worker)\./i, role: "Async task queue / worker" },
    // Prompt template engine or base provider class
    { match: /(?:[^/]+\/)*(?:lib\/prompt-architect|providers\/base)\./i, role: "Prompt template engine / base provider" },
    // LLM client / orchestrator (top-level worker, repair_engine)
    { match: /(?:[^/]+\/)*(?:src\/llm\.|orchestrator\.)/i, role: "LLM client / orchestrator" },
  ];

  const results: Array<{ file: string; role: string; exports: string[]; behaviors: string[] }> = [];

  for (const { match, role } of targets) {
    // Exclude test files from subsystem summaries — they describe tests, not the subsystem
    const sample = fileSamples.find((s) => match.test(s.path) && !/__tests__|\.test\.|\.spec\./i.test(s.path));
    if (!sample || sample.excerpt === "(empty file)") continue;
    const e = sample.excerpt;

    // Exported symbols
    const exports: string[] = [];
    for (const m of e.matchAll(/export\s+(?:async\s+)?(?:const|function|class|default\s+(?:function|class)?)\s+(\w+)/g)) {
      if (m[1] && m[1] !== "default") exports.push(m[1]);
    }
    // Named exports: export { a, b }
    for (const m of e.matchAll(/export\s*\{([^}]+)\}/g)) {
      m[1].split(",").forEach((name) => {
        const n = name.trim().split(/\s+as\s+/).pop()?.trim();
        if (n && !exports.includes(n)) exports.push(n);
      });
    }

    // Behaviour signals from content
    const behaviors: string[] = [];
    // Named config / registry constants
    for (const m of e.matchAll(/(?:export\s+)?const\s+([A-Z_][A-Z0-9_]{3,})\s*(?::|=)/g)) {
      behaviors.push(`defines \`${m[1]}\``);
    }
    if (/fallback|retry.*provider|catch.*fallback/i.test(e)) behaviors.push("provider fallback / retry");
    if (/stream|ReadableStream|SSE|text\/event-stream/i.test(e)) behaviors.push("streaming response");
    if (/encrypt|decrypt|aes|hmac|crypto/i.test(e)) behaviors.push("AES encryption");
    if (/supabase.*getUser|verifyJwt|getBearerToken/i.test(e)) behaviors.push("Supabase JWT verification");
    if (/stripe\.customers|stripe\.subscriptions|stripe\.checkout/i.test(e)) behaviors.push("Stripe lifecycle");
    if (/p-limit|concurrency\s*:/i.test(e)) behaviors.push("concurrency limiting (p-limit)");
    if (/pgvector|embedding|vector.*search/i.test(e)) behaviors.push("pgvector / embedding search");
    if (/tier|quota|limit.*plan|plan.*limit/i.test(e)) behaviors.push("tier / quota enforcement");
    if (/template.*interpolat|handlebars|mustache|\{\{/i.test(e)) behaviors.push("template interpolation");
    if (/zod|z\.object/i.test(e)) behaviors.push("Zod input validation");

    results.push({ file: sample.path, role, exports: exports.slice(0, 10), behaviors });
  }

  return results;
}

function buildProjectProfile(snapshot: RepoSnapshot): string {
  const verified = (value?: string | number | null) =>
    value == null || value === "" ? "[NOT FOUND IN CODEBASE]" : String(value);
  const readmeSection = snapshot.readmeQuote
    ? `Quoted from README or metadata:\n> ${snapshot.readmeQuote}\n`
    : "[NOT FOUND IN CODEBASE]";
  const treeBlock = snapshot.topLevelTree
    .map((entry) => `- \`${entry.path}\` — ${entry.note}`)
    .join("\n");
  const dependencyTable = Object.entries(snapshot.dependencyGroups)
    .map(([label, deps]) => `### ${label}\n${deps.length > 0 ? deps.map((d) => `- ${d}`).join("\n") : "- [NOT FOUND IN CODEBASE]"}`)
    .join("\n\n");

  return `# ${snapshot.projectName} — Codebase Intelligence Audit

## SECTION 1: PROJECT IDENTITY

### 1. Project Name
${verified(snapshot.packageName || snapshot.projectName)} [VERIFIED]

### 2. Repository URL
${verified(snapshot.repositoryUrl)} ${snapshot.repositoryUrl ? "[VERIFIED]" : ""}

### 3. One-Line Description
${readmeSection}
Cleaner version: ${verified(snapshot.description || snapshot.readmeQuote)} [VERIFIED OR DIRECTLY QUOTED]

### 4. Project Status
${verified(snapshot.profileSummary.status)} [INFERRED FROM CODEBASE SIGNALS]

### 5. Commit Dates
- First commit: ${verified(snapshot.firstCommitDate)}
- Most recent commit: ${verified(snapshot.latestCommitDate)}

### 6. Total Number of Commits
${verified(snapshot.commitCount)}

### 7. Deployment Status
${snapshot.deploymentSignals.length > 0 ? snapshot.deploymentSignals.join(", ") : "[NOT FOUND IN CODEBASE]"}

### 8. Live URLs
${snapshot.liveUrls.length > 0 ? snapshot.liveUrls.map((url) => `- ${url}`).join("\n") : "[NOT FOUND IN CODEBASE]"}

## SECTION 2: TECHNICAL ARCHITECTURE

### 1. Primary Languages and Frameworks
- Languages: ${snapshot.languages.join(", ") || "[NOT FOUND IN CODEBASE]"}
- Frameworks: ${snapshot.frameworks.join(", ") || "[NOT FOUND IN CODEBASE]"}

### 2. Full Dependency List
${dependencyTable}

### 3. Project Structure
${treeBlock || "- [NOT FOUND IN CODEBASE]"}

### 4. Architecture Pattern
${snapshot.architectureDetail}

### 5. Database / Storage Layer
${verified(snapshot.stack?.database)} [VERIFIED OR INFERRED FROM CONFIG]

### 6. API Layer
${buildApiLayerSection(snapshot)}

### 7. External Service Integrations
${detectIntegrationsFromDependencies(snapshot.dependencyGroups, snapshot.fileSamples).join("\n") || "[NOT FOUND IN CODEBASE]"}

### 8. AI/ML Components
${detectAiSignals(snapshot.dependencyGroups, snapshot.fileSamples)}

### 9. Authentication and Authorization Model
${detectAuthSignals(snapshot.dependencyGroups, snapshot.fileSamples)}

### 10. Environment Variables
${snapshot.envVars.length > 0 ? snapshot.envVars.map((name) => `- ${name}`).join("\n") : "[NOT FOUND IN CODEBASE]"}

### 11. State Management
${buildStateManagementSection(snapshot)}

### 12. Database Schema
${snapshot.databaseSchema}

### 13. Key Subsystem Summaries
${buildCriticalFileSummariesSection(snapshot)}

## SECTION 3: FEATURE INVENTORY

${buildFeatureInventory(snapshot)}

## SECTION 4: DESIGN SYSTEM & BRAND

${detectDesignSignals(snapshot.fileSamples, snapshot.configFiles, snapshot.dependencyGroups)}

## SECTION 5: DATA & SCALE SIGNALS

${buildScaleSection(snapshot)}

## SECTION 6: MONETIZATION & BUSINESS LOGIC

${detectBillingSignals(snapshot.dependencyGroups, snapshot.fileSamples)}

## SECTION 7: CODE QUALITY & MATURITY SIGNALS

${buildCodeQualitySection(snapshot)}

## SECTION 8: ECOSYSTEM CONNECTIONS

${snapshot.repositoryUrl ? `- Primary repository: ${snapshot.repositoryUrl}` : "[NOT FOUND IN CODEBASE]"}

## SECTION 9: WHAT'S MISSING (CRITICAL)

${buildGapsSection(snapshot)}

## SECTION 10: EXECUTIVE SUMMARY

${buildExecutiveSummary(snapshot)}

\`\`\`
---
AUDIT METADATA
Project: ${snapshot.projectName}
Date: ${new Date().toISOString().slice(0, 10)}
Agent: penny-onboarding-foundation
Codebase access: full repo
Confidence level: medium; deterministic repo inspection without runtime execution
Sections with gaps: sections depending on runtime, external services, and undocumented product intent
Total files analyzed: ${snapshot.fileCount}
---
\`\`\``;
}

function buildStateManagementSection(snapshot: RepoSnapshot): string {
  const lines: string[] = [];
  const deps = Object.values(snapshot.dependencyGroups).flat();

  if (deps.some((d) => /\bzustand\b/i.test(d))) {
    if (snapshot.stateStores.length > 0) {
      lines.push(`**Zustand stores (${snapshot.stateStores.length}):** ${snapshot.stateStores.map((s) => `\`${s}\``).join(", ")}`);
    } else {
      lines.push("**Zustand** — detected in dependencies; no store variable names extracted from sampled files");
    }
    if (deps.some((d) => /\bimmer\b/i.test(d))) {
      lines.push("Immer is used for immutable state updates within stores.");
    }
  } else if (deps.some((d) => /@reduxjs\/toolkit/i.test(d))) {
    lines.push("**Redux Toolkit** — state slices and reducers");
  } else if (deps.some((d) => /\bjotai\b/i.test(d))) {
    lines.push("**Jotai** — atomic state");
  }

  if (deps.some((d) => /@tanstack\/react-query/i.test(d))) {
    lines.push("**TanStack React Query** — server state, background refetch, stale-while-revalidate caching");
  }

  // Context providers
  const contextFiles = snapshot.fileSamples.filter((s) => /(context|provider)\.(tsx|ts)$/i.test(s.path));
  if (contextFiles.length > 0) {
    lines.push(`**React Context providers (${contextFiles.length}):** ${contextFiles.slice(0, 6).map((s) => `\`${s.path}\``).join(", ")}${contextFiles.length > 6 ? ` + ${contextFiles.length - 6} more` : ""}`);
  }

  if (lines.length === 0) return "[NOT FOUND IN CODEBASE]";
  return lines.join("\n\n");
}

function buildCriticalFileSummariesSection(snapshot: RepoSnapshot): string {
  if (snapshot.criticalFileSummaries.length === 0) {
    return "[NOT FOUND IN CODEBASE — key source files not in sample set]";
  }
  return snapshot.criticalFileSummaries.map(({ file, role, exports, behaviors }) => {
    const parts: string[] = [`**\`${file}\`** — ${role}`];
    if (exports.length > 0) parts.push(`Exports: ${exports.map((e) => `\`${e}\``).join(", ")}`);
    if (behaviors.length > 0) parts.push(`Behaviours: ${behaviors.join(", ")}`);
    return parts.join("\n");
  }).join("\n\n");
}

function buildExpectations(snapshot: RepoSnapshot): string {
  const files = snapshot.allFilePaths;
  const samples = snapshot.fileSamples;
  const allDeps = Object.values(snapshot.dependencyGroups).flat();
  // Strip version suffix only (e.g. "react@18.2.0" → "react", "@supabase/supabase-js@2.0.0" → "@supabase/supabase-js")
  const deps = new Set(allDeps.map((d) => d.toLowerCase().replace(/@[0-9^~>=<*].*$/, "")));

  // ── Signal detection ──────────────────────────────────────────────────────

  // TypeScript strict mode
  const tsconfigSample = samples.find((s) => /tsconfig.*\.json$/i.test(s.path));
  const hasStrictMode = tsconfigSample
    ? /"strict"\s*:\s*true/.test(tsconfigSample.excerpt)
    : false;

  // React version constraint
  const reactDep = allDeps.find((d) => /^react@/.test(d));
  const reactVersion = reactDep ? reactDep.replace(/^react@\^?~?/, "").split(".")[0] : null;

  // Vite as build tool
  const isVite = snapshot.stack?.build?.toLowerCase().includes("vite") ?? false;

  // Node version (from .nvmrc or package.json engines)
  const nvmrcSample = samples.find((s) => /\.nvmrc$/.test(s.path));
  const nodeVersionRaw = nvmrcSample?.excerpt?.trim().replace(/^v/, "") ?? null;
  const nodeVersionMajor = nodeVersionRaw ? nodeVersionRaw.split(".")[0] : null;
  const pkgSample = samples.find((s) => s.path === "package.json" || /[^/]+\/package\.json$/.test(s.path));
  const enginesNode = pkgSample
    ? (pkgSample.excerpt.match(/"node"\s*:\s*"([^"]+)"/) ?? [])[1] ?? null
    : null;
  const nodeConstraint = nodeVersionMajor ?? (enginesNode ? enginesNode.replace(/[^0-9.]/g, "").split(".")[0] : null);

  // Netlify serverless backend
  const netlifyFunctions = files.filter((f) =>
    /(?:^|[^/]+\/)netlify\/functions\/[^/]+\.(ts|js)$/.test(f)
  );
  const hasNetlifyBackend = netlifyFunctions.length > 0;

  // AI provider router abstraction
  const hasAIRouter =
    files.some((f) =>
      /(?:[^/]+\/)*(?:lib\/ai\/router|providers\/(?:router|gateway))\./i.test(f)
    ) ||
    snapshot.criticalFileSummaries.some(
      (s) =>
        /router|gateway/i.test(s.role) &&
        (s.exports.some((e) => /[Rr]outer|[Gg]ateway/i.test(e)) ||
          s.behaviors.some((b) => /dispatch|fallback|route.*provider/i.test(b)))
    );
  const aiRouterName = (() => {
    // Prefer the exported class/function name (e.g. "AIRouter", "ProviderGateway")
    const routerSummary = snapshot.criticalFileSummaries.find(
      (s) => /router|gateway/i.test(s.role)
    );
    if (routerSummary) {
      const exportedName = routerSummary.exports.find((e) => /[A-Z].*[Rr]outer|[A-Z].*[Gg]ateway/i.test(e));
      if (exportedName) return exportedName;
    }
    // Fall back to the file path turned into a PascalCase label
    const routerFile = files.find((f) =>
      /(?:[^/]+\/)*(?:lib\/ai\/router|providers\/(?:router|gateway))\./i.test(f)
    );
    if (routerFile) {
      const base = routerFile.split("/").pop()?.replace(/\.(ts|tsx|js|jsx)$/, "") ?? "";
      // Convert kebab/snake to PascalCase: "ai-router" → "AIRouter", "router" → "Router"
      const pascal = base.replace(/(^|[-_])([a-z])/g, (_, __, c: string) => c.toUpperCase());
      return pascal || "AIRouter";
    }
    return "AIRouter";
  })();

  // Stripe — detect if present and where
  const hasStripe = deps.has("stripe") || files.some((f) => /stripe/i.test(f));
  const stripeInFunctions = netlifyFunctions.some((f) => /stripe|billing|payment/i.test(f));

  // JWT / authentication in functions
  const hasJwt =
    deps.has("jsonwebtoken") ||
    deps.has("jose") ||
    deps.has("@supabase/supabase-js") ||
    netlifyFunctions.some((f) => /auth|jwt|verify|token/i.test(f));
  const jwtVerifyInBehaviors = snapshot.criticalFileSummaries.some((s) =>
    s.behaviors.some((b) => /jwt|verify.*token|token.*verif|supabase.*auth|auth.*token/i.test(b))
  );

  // Supabase RLS
  const hasSupabase =
    deps.has("@supabase/supabase-js") ||
    (snapshot.stack?.database ?? "").toLowerCase().includes("supabase");
  const rlsDetected = samples.some(
    (s) =>
      /migrations?\/.*\.sql$/i.test(s.path) &&
      /enable_row_level_security|ENABLE ROW LEVEL SECURITY|alter table.*enable rls/i.test(
        s.excerpt
      )
  );

  // Encrypted API credentials
  const credSummary = snapshot.criticalFileSummaries.find((s) =>
    /credential/i.test(s.role)
  );
  const hasEncryptedCreds =
    credSummary != null &&
    credSummary.behaviors.some((b) =>
      /encrypt|decrypt|cipher|crypto|aes|vault/i.test(b)
    );

  // Security headers (netlify.toml [[headers]] block)
  const netlifyTomlSample = samples.find((s) => /netlify\.toml$/.test(s.path));
  const hasSecurityHeaders = netlifyTomlSample
    ? /\[\[headers\]\]|X-Frame-Options|Content-Security-Policy|Strict-Transport|X-Content-Type/i.test(
        netlifyTomlSample.excerpt
      )
    : false;

  // Analytics
  const hasPosthog = deps.has("posthog-js") || deps.has("posthog-node");
  const otherAnalytics = (["@segment/analytics-next", "mixpanel-browser", "amplitude-js", "@amplitude/analytics-browser", "rudder-sdk-js"] as const)
    .filter((d) => deps.has(d as string));

  // Custom ESLint plugin / rules
  const hasCustomEslint =
    files.some((f) => /^eslint-plugin-/i.test(f) || /^eslint-rules?\//i.test(f));
  const eslintPluginName = (() => {
    const pluginEntry = files.find((f) => /^eslint-plugin-/i.test(f));
    if (pluginEntry) return pluginEntry.split("/")[0];
    return null;
  })();

  // Storybook
  const hasStorybook =
    files.some((f) => /^\.storybook\//i.test(f) || /\.stories\.(ts|tsx|js|jsx)$/.test(f));

  // Archive / out-of-scope
  const hasArchive = files.some((f) => /^archive\//i.test(f));

  // ── Document assembly ─────────────────────────────────────────────────────

  const scanRoots =
    snapshot.scanRoots.length > 0
      ? snapshot.scanRoots.map((dir) => `- \`${dir}\``).join("\n")
      : "- `.`";
  const commands = formatCommands(snapshot.commands);

  const sections: string[] = [];

  // ── Section 1: Language and runtime ──────────────────────────────────────
  const langItems: string[] = [];

  if (hasStrictMode) {
    langItems.push(`### 1.1 TypeScript strict mode — **CRITICAL if removed**

\`tsconfig.json\` has \`"strict": true\`. This setting must remain enabled.

- **Flag**: any PR that sets \`"strict": false\`, removes \`"strict"\`, or adds \`@ts-ignore\` / \`@ts-nocheck\` without a documented reason.`);
  } else if (snapshot.stack?.language?.toLowerCase().includes("typescript")) {
    langItems.push(`### 1.1 TypeScript — **HIGH**

The project uses TypeScript. Strict mode was not detected in \`tsconfig.json\` — consider enabling it.

- **Flag**: migration to plain JavaScript; removal of TypeScript compilation step.`);
  }

  if (reactVersion && parseInt(reactVersion, 10) >= 18) {
    langItems.push(`### 1.${langItems.length + 1} React ${reactVersion}+ — **CRITICAL if downgraded**

The project targets React ${reactVersion}. Concurrent features and server-component patterns depend on this version floor.

- **Flag**: any change to \`package.json\` that downgrades \`react\` or \`react-dom\` below ${reactVersion}.`);
  } else if (deps.has("react")) {
    langItems.push(`### 1.${langItems.length + 1} React version constraint — **HIGH**

The project uses React. Pin the minimum acceptable version in this document once confirmed.

- **Flag**: major version downgrades.`);
  }

  if (isVite) {
    langItems.push(`### 1.${langItems.length + 1} Vite build system — **HIGH if swapped**

Vite is the configured build tool. The development and production pipelines are tuned for it.

- **Flag**: replacement of \`vite.config.*\` with Webpack, Rollup, or another bundler without a documented migration decision.`);
  }

  if (nodeConstraint) {
    langItems.push(`### 1.${langItems.length + 1} Node ${nodeConstraint} runtime — **HIGH**

The runtime is pinned to Node ${nodeConstraint} (detected from ${nvmrcSample ? ".nvmrc" : "package.json engines"}).

- **Flag**: changes that require a Node version outside this constraint; deployment config that specifies a different runtime.`);
  } else if (hasNetlifyBackend) {
    langItems.push(`### 1.${langItems.length + 1} Node runtime for Netlify Functions — **HIGH**

Netlify Functions run on a pinned Node version. Add the version to \`.nvmrc\` or \`package.json engines\` and confirm it here.

- **Flag**: functions code that uses Node APIs unavailable in the target runtime.`);
  }

  if (langItems.length > 0) {
    sections.push(`## 1. Language and Runtime\n\n${langItems.join("\n\n")}`);
  }

  // ── Section 2: Backend architecture ──────────────────────────────────────
  const backendItems: string[] = [];
  let bi = 1;

  if (hasNetlifyBackend) {
    backendItems.push(`### 2.${bi++} Netlify Functions — only permitted backend — **CRITICAL**

All server-side logic must live in \`netlify/functions/\`. There is no Express server, no Next.js API routes, and no other runtime process.

- **Flag**: any new server-side logic added outside \`netlify/functions/\`; introduction of an Express or Fastify server; use of Next.js or Remix API routes.`);
  }

  if (hasAIRouter) {
    backendItems.push(`### 2.${bi++} AI provider calls through \`${aiRouterName}\` — **CRITICAL if bypassed**

All LLM completions must be routed through the \`${aiRouterName}\` abstraction, which handles provider selection, fallback, and cost enforcement.

- **Flag**: direct calls to \`openai\`, \`anthropic\`, or any other provider SDK from outside the router; hardcoded provider endpoints in UI code or non-router server code.`);
  }

  if (hasStripe) {
    if (stripeInFunctions) {
      backendItems.push(`### 2.${bi++} Stripe operations Netlify-Functions-only — **CRITICAL**

Stripe API calls (charges, subscriptions, webhooks) occur only inside \`netlify/functions/\`. The Stripe secret key must never be loaded in browser-executed code.

- **Flag**: \`import stripe\` or \`require('stripe')\` in any \`src/\`, \`app/\`, or \`components/\` file; \`STRIPE_SECRET_KEY\` referenced in client bundle.`);
    } else {
      backendItems.push(`### 2.${bi++} Stripe secret key must stay server-side — **CRITICAL**

Stripe is a dependency. Ensure the secret key is only ever loaded in server-side code.

- **Flag**: \`STRIPE_SECRET_KEY\` referenced from client-side files; Stripe API calls outside a backend boundary.`);
    }
  }

  if (hasJwt || jwtVerifyInBehaviors) {
    backendItems.push(`### 2.${bi++} JWT / session verification before authenticated requests — **CRITICAL**

Every Netlify Function that reads or writes user data must verify the caller's session token before processing the request.

- **Flag**: functions that read \`event.body\` or query the database without first validating the Authorization header; removal of auth-check utilities from shared function helpers.`);
  }

  if (backendItems.length > 0) {
    sections.push(`## 2. Backend Architecture\n\n${backendItems.join("\n\n")}`);
  }

  // ── Section 3: Database ───────────────────────────────────────────────────
  if (hasSupabase) {
    const dbItems: string[] = [];
    let di = 1;

    dbItems.push(`### 3.${di++} Supabase as primary database — **HIGH if replaced**

Supabase (PostgreSQL + Auth + Storage) is the sole database layer. Direct PostgreSQL connections from client code are not permitted.

- **Flag**: introduction of a second database (MySQL, MongoDB, PlanetScale); direct \`pg\` or \`mysql2\` connections from Netlify Functions without the Supabase client wrapper.`);

    if (rlsDetected) {
      dbItems.push(`### 3.${di++} Row-Level Security on all tables — **CRITICAL**

Migrations confirm RLS is enabled. Every table exposed through the Supabase client must have an RLS policy. Data must never be readable without a matching policy.

- **Flag**: new \`CREATE TABLE\` migration without a corresponding \`ALTER TABLE … ENABLE ROW LEVEL SECURITY\` and at least one \`CREATE POLICY\`; removal of existing policies without documented justification.`);
    } else {
      dbItems.push(`### 3.${di++} Row-Level Security — **CRITICAL**

Supabase is in use. Confirm that every table has RLS enabled and review policies before activating these expectations.

- **Flag**: tables accessible through the anon or authenticated role without an explicit \`CREATE POLICY\`.`);
    }

    sections.push(`## 3. Database\n\n${dbItems.join("\n\n")}`);
  }

  // ── Section 4: Security ───────────────────────────────────────────────────
  const secItems: string[] = [];
  let si = 1;

  if (hasEncryptedCreds) {
    secItems.push(`### 4.${si++} API credentials encrypted at rest — **CRITICAL**

Credential storage utilities encrypt secrets before persisting them (detected in \`${credSummary!.file}\`). This pattern must not be weakened.

- **Flag**: storing raw API keys in the database or in Supabase without encryption; removal of encrypt/decrypt wrappers from the credential utilities.`);
  } else if (hasNetlifyBackend) {
    secItems.push(`### 4.${si++} API credentials must not be stored in plain text — **CRITICAL**

No API keys or secrets should be stored in the database unencrypted. Confirm the credential storage strategy and document it here.

- **Flag**: plain-text secrets in any database column; environment variables leaked to the client bundle.`);
  }

  if (hasSecurityHeaders) {
    secItems.push(`### 4.${si++} Security headers must not be weakened — **CRITICAL**

\`netlify.toml\` defines security headers (\`X-Frame-Options\`, \`Content-Security-Policy\`, etc.). These must not be removed or loosened without a documented security review.

- **Flag**: removal of header blocks from \`netlify.toml\`; widening of \`Content-Security-Policy\` directives (e.g. adding \`unsafe-inline\` or \`unsafe-eval\`).`);
  } else {
    secItems.push(`### 4.${si++} Security headers — **HIGH**

Security headers were not detected in \`netlify.toml\`. Add \`X-Frame-Options\`, \`X-Content-Type-Options\`, and \`Content-Security-Policy\` headers.

- **Flag**: deployment without security headers on the root path.`);
  }

  secItems.push(`### 4.${si++} No hardcoded secrets — **CRITICAL**

No API keys, tokens, or credentials may appear as string literals in source code.

- **Flag**: strings matching patterns for API keys (e.g. \`sk-****\`, \`Bearer \`, base64-encoded tokens) in \`.ts\`, \`.tsx\`, \`.js\`, or \`.jsx\` files outside test fixtures.`);

  sections.push(`## 4. Security\n\n${secItems.join("\n\n")}`);

  // ── Section 5: Analytics ──────────────────────────────────────────────────
  if (hasPosthog || otherAnalytics.length > 0) {
    const analyticsItems: string[] = [];
    if (hasPosthog) {
      analyticsItems.push(`### 5.1 \`posthog-js\` is the only approved analytics provider — **HIGH**

PostHog is the analytics provider. Additional tracking SDKs must not be introduced without an explicit operator decision.

- **Flag**: addition of Segment, Mixpanel, Amplitude, or any other analytics SDK; direct calls to analytics endpoints not proxied through PostHog.`);
    } else {
      analyticsItems.push(`### 5.1 Analytics provider constraint — **HIGH**

Analytics SDKs are present (${otherAnalytics.join(", ")}). Confirm the approved provider list and add it here before activating.

- **Flag**: introduction of additional analytics SDKs without documented approval.`);
    }
    sections.push(`## 5. Analytics\n\n${analyticsItems.join("\n\n")}`);
  }

  // ── Section 6: Code quality ───────────────────────────────────────────────
  const qualityItems: string[] = [];
  let qi = 1;

  if (hasCustomEslint) {
    const pluginRef = eslintPluginName ? `\`${eslintPluginName}\`` : "the project's custom ESLint plugin";
    qualityItems.push(`### 6.${qi++} Custom ESLint rules must not be disabled — **CRITICAL if disabled**

${pluginRef} enforces project-specific patterns. Disabling rules inline undermines architectural constraints the rules exist to protect.

- **Flag**: \`// eslint-disable\` comments targeting rules from ${pluginRef}; removal of ${pluginRef} from \`.eslintrc\` or \`eslint.config.*\`; \`eslint-disable-next-line\` without a documented justification comment.`);
  }

  if (hasStorybook) {
    qualityItems.push(`### 6.${qi++} Storybook coverage for new UI components — **STANDARD**

The project has Storybook configured. New shared UI components should ship with a story.

- **Flag**: new files under \`components/\` or \`ui/\` without a corresponding \`.stories.tsx\` file (advisory, not a hard block).`);
  }

  if (qualityItems.length > 0) {
    sections.push(`## 6. Code Quality\n\n${qualityItems.join("\n\n")}`);
  }

  // ── Section 7: Out-of-scope paths ─────────────────────────────────────────
  const oosItems: string[] = [];
  if (hasArchive) {
    oosItems.push(
      "- `archive/` — historical snapshots; excluded from all audit scopes unless explicitly included."
    );
  }
  if (snapshot.testFiles.length > 0) {
    oosItems.push(
      "- Test files (`*.test.*`, `*.spec.*`, `__tests__/`) — penny does not audit test logic unless the audit scope is `testing`."
    );
  }
  if (hasStorybook) {
    oosItems.push(
      "- Storybook stories (`*.stories.*`) — excluded from security and architecture audits."
    );
  }
  if (oosItems.length > 0) {
    sections.push(`## 7. Out-of-Scope Paths\n\n${oosItems.join("\n")}`);
  }

  // ── Section 8: Audit mechanics ────────────────────────────────────────────
  sections.push(`## 8. Audit Mechanics

### 8.1 Scope
Default scan roots: ${snapshot.scanRoots.length > 0 ? snapshot.scanRoots.map((r) => `\`${r}\``).join(", ") : "`./`"}

Prefer \`file\`, \`directory\`, \`selection\`, or \`diff\` scopes when provided. \`project\` scope uses the roots above.

### 8.2 Validation commands

${commands}

### 8.3 Evidence standard
Every finding must cite file paths and, when possible, line anchors. Missing evidence lowers confidence.

### 8.4 Activation gate
These expectations are a **draft** until explicitly activated. Only active expectations drive production audit runs.`);

  // ── Final document ────────────────────────────────────────────────────────
  return `# ${snapshot.projectName} — Expectations Document

> Generated from repository inspection on ${new Date().toISOString().slice(0, 10)}
> **Review required before activation.** Confirm each constraint reflects the operator's intent.

---

${sections.join("\n\n---\n\n")}
`;
}

function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 6) return;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full, depth + 1);
      } else if (st.isFile()) {
        out.push(full.replace(root + "/", ""));
      }
    }
  };
  walk(root, 0);
  return out.sort();
}

function detectScanRoots(files: string[]): string[] {
  const subDirs = new Set<string>();
  const topDirs = new Set<string>();
  for (const file of files) {
    const parts = file.split("/");
    if (!/^(src|app|apps|packages|server|api|services|worker|dashboard)$/.test(parts[0])) continue;
    if (parts.length >= 3) {
      // File is inside a subdirectory — use the 2-level directory path as scan root
      subDirs.add(`${parts[0]}/${parts[1]}/`);
    } else {
      // File is directly inside the top-level source dir — record the dir itself
      topDirs.add(`${parts[0]}/`);
    }
  }
  // Prefer granular subdirectory roots; fall back to top-level dirs if no subdirs exist
  const roots = subDirs.size > 0 ? subDirs : topDirs;
  if (roots.size === 0) roots.add("./");
  return [...roots].sort();
}

function detectConfigFiles(files: string[]): string[] {
  return files.filter((file) =>
    /(^|\/)(package\.json|tsconfig.*\.json|pyproject\.toml|requirements\.txt|vercel\.json|netlify\.toml|docker-compose.*|Dockerfile|tailwind\.config.*|next\.config.*|vite\.config.*|supabase\/|migrations\/)/i.test(file)
  ).slice(0, 20);
}

function describeTopLevel(root: string): Array<{ path: string; note: string }> {
  const entries = readdirSync(root).filter((name) => !name.startsWith(".")).slice(0, 20);
  return entries.map((name) => ({
    path: name,
    note: inferTopLevelPurpose(name),
  }));
}

function inferTopLevelPurpose(name: string): string {
  if (name === "src" || name === "app") return "primary application code";
  if (name === "apps") return "multi-app workspace";
  if (name === "packages") return "shared packages";
  if (name === "tests" || name === "__tests__") return "tests";
  if (name === "docs") return "documentation";
  if (name === "supabase" || name === "db") return "database and migrations";
  if (name === "scripts") return "scripts and tooling";
  if (name === "netlify") return "serverless functions and edge functions";
  if (name === "archive") return "archived / historical code (not active)";
  if (name === "audits") return "audit artifacts, reports, and agent prompts";
  if (/^eslint-plugin-/i.test(name)) return "custom ESLint plugin";
  if (/^eslint-rules?$/i.test(name)) return "custom ESLint rules";
  if (name === "index.html") return "Vite SPA entry point";
  if (/\.(lock|toml|json|yaml|yml|cjs|mjs|js|ts)$/.test(name)) return "project config file";
  if (/\.(md|mdx|txt)$/.test(name)) return "documentation";
  if (/^(LICENSE|LICENCE|AUTHORS|CONTRIBUTORS|NOTICE)/i.test(name)) return "open source license";
  // Spec docs with no extension: "Codra Language Charter", "Image Policy Specification v1", etc.
  if (/^[A-Z][A-Za-z0-9 ]+(Charter|Specification|Manifest|Policy|Contract)/i.test(name)) return "documentation";
  return "repository content";
}

function readJsonIfExists(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Monorepo fallback: find package.json exactly one level deep with the most combined deps. */
function findMonorepoPackageJson(root: string, files: string[]): Record<string, unknown> | null {
  const candidates = files.filter(
    (f) => /^[^/]+\/package\.json$/.test(f) && !f.startsWith("node_modules/")
  );
  let best: Record<string, unknown> | null = null;
  let bestScore = 0;
  for (const f of candidates) {
    const p = readJsonIfExists(join(root, f));
    if (!p) continue;
    const score =
      Object.keys((p.dependencies as object) ?? {}).length +
      Object.keys((p.devDependencies as object) ?? {}).length;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

function readTextIfExists(filePath: string): string {
  if (!existsSync(filePath)) return "";
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function findReadme(root: string): string | null {
  for (const candidate of ["README.md", "readme.md", "README", "Readme.md"]) {
    const full = join(root, candidate);
    if (existsSync(full)) return full;
  }
  return null;
}

function extractReadmeQuote(text: string): string | undefined {
  const line = text
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value && !value.startsWith("#"));
  return line || undefined;
}

// Files that define actual runtime behaviour — read in full so signal detection
// isn't cut off mid-function.
function isKeyFile(file: string): boolean {
  return (
    // Netlify functions — root-level or one monorepo level deep (e.g. dashboard/netlify/functions/)
    /(?:^|[^/]+\/)netlify\/functions\//i.test(file) ||
    /^supabase\/migrations\//i.test(file) ||
    /^supabase\/functions\//i.test(file) ||
    /\/(src|app)\/(main|index|App)\.(ts|tsx|js|jsx)$/i.test(file) ||
    /^(src|app)\/(main|index|App)\.(ts|tsx|js|jsx)$/i.test(file) ||
    // App Router route handlers — root or monorepo prefix (dashboard/app/.../route.ts)
    /(?:^|[^/]+\/)(src\/)?app\/.*\/(index|route|server)\.(ts|js)$/i.test(file) ||
    // AI subsystem — lib/ai/, lib/models/, or providers/ in repair_engine/worker
    /(?:[^/]+\/)?lib\/(ai|models)\//i.test(file) ||
    /(?:[^/]+\/)?providers\/(router|gateway|registry)\./i.test(file) ||
    /netlify\/functions\/utils\/(credential|retrieval|stripe)/i.test(file) ||
    // Domain logic
    /(?:[^/]+\/)?domain\/(pricing|cost-policy|model-selector|types|task-queue)\.(ts|tsx)$/i.test(file) ||
    // State stores
    /(?:[^/]+\/)?(store|stores|state)\//i.test(file) ||
    /\/(use\w*Store|use\w*State)\.(ts|tsx)$/i.test(file)
  );
}

function sampleFiles(files: string[], root: string): Array<{ path: string; excerpt: string }> {
  const textFiles = files.filter((file) => TEXT_EXTENSIONS.has(extname(file).toLowerCase()));

  // Tier 0 — always read in full: serverless functions, DB migrations, entry points
  // Tier 1 — primary source trees (read up to MAX_FILE_PREVIEW each)
  // Tier 2 — other .ts/.js/.py files
  // Tier 3 — config, docs, everything else
  const priority = (file: string): number => {
    if (isKeyFile(file)) return 0;
    // Tier 1: primary source trees at root OR one level deep (monorepo: dashboard/app/, worker/src/)
    if (/(?:^|[^/]+\/)(src|app|lib|server|api|pages|components|features|hooks|domain|services|modules)\//i.test(file)) return 1;
    if (/\.(ts|tsx|js|jsx|py)$/.test(file)) return 2;
    return 3;
  };

  const sorted = [...textFiles].sort((a, b) => priority(a) - priority(b) || a.localeCompare(b));
  const picked = sorted.slice(0, MAX_SAMPLE_FILES);

  return picked.map((file) => {
    const text = readTextIfExists(join(root, file));
    const limit = isKeyFile(file) ? MAX_KEY_FILE_SIZE : MAX_FILE_PREVIEW;
    return {
      path: file,
      excerpt: text.slice(0, limit) || "(empty file)",
    };
  });
}

function detectLanguages(files: string[]): string[] {
  const langs = new Set<string>();
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (ext === ".ts" || ext === ".tsx") langs.add("TypeScript");
    if (ext === ".js" || ext === ".jsx") langs.add("JavaScript");
    if (ext === ".py") langs.add("Python");
    if (ext === ".rb") langs.add("Ruby");
    if (ext === ".go") langs.add("Go");
    if (ext === ".rs") langs.add("Rust");
    if (ext === ".sql") langs.add("SQL");
  }
  return [...langs];
}

function guessPrimaryLanguage(files: string[]): string {
  const counts = new Map<string, number>();
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (winner === ".py") return "python";
  if (winner === ".ts" || winner === ".tsx") return "typescript";
  if (winner === ".js" || winner === ".jsx") return "javascript";
  return "unknown";
}

function detectFrameworks(
  pkg: Record<string, unknown> | null,
  pyproject: string,
  files: string[]
): string[] {
  const deps = dependencyNames(pkg);
  const frameworks = new Set<string>();
  if (deps.has("next")) frameworks.add("Next.js");
  if (deps.has("react")) frameworks.add("React");
  if (deps.has("express")) frameworks.add("Express");
  if (deps.has("@nestjs/core")) frameworks.add("NestJS");
  if (deps.has("fastify")) frameworks.add("Fastify");
  if (pyproject.includes("fastapi")) frameworks.add("FastAPI");
  if (pyproject.includes("django")) frameworks.add("Django");
  if (pyproject.includes("flask")) frameworks.add("Flask");
  if (files.some((file) => file.startsWith("supabase/functions/"))) frameworks.add("Supabase");
  return [...frameworks];
}

function groupDependencies(
  pkg: Record<string, unknown> | null,
  requirements: string
): Record<string, string[]> {
  const deps = packageDependencyMap(pkg);
  const all = [
    ...Object.entries(deps.dependencies),
    ...Object.entries(deps.devDependencies),
  ].map(([name, version]) => `${name}@${version}`);
  const out: Record<string, string[]> = {
    "Core framework dependencies": all.filter((value) => /(next|react|vue|svelte|express|nestjs|fastify)/i.test(value)),
    "UI / styling libraries": all.filter((value) => /(tailwind|radix|chakra|mui|styled|framer)/i.test(value)),
    "API / data layer": all.filter((value) => /(pg|prisma|drizzle|supabase|trpc|graphql|axios)/i.test(value)),
    // AI packages — most projects use providers via API key (no npm package), so this
    // may legitimately be empty; the External Service Integrations section covers that case
    "AI / ML integrations": all.filter((value) => /(openai|anthropic|langchain|huggingface|replicate|deepseek|mistral|cohere|groq|together|fireworks|ai-sdk)/i.test(value)),
    // Auth — include supabase because @supabase/supabase-js is the auth library for Supabase projects
    Authentication: all.filter((value) => /(auth|clerk|lucia|next-auth|passport|supabase)/i.test(value)),
    Testing: all.filter((value) => /(jest|vitest|playwright|cypress|pytest|testing-library)/i.test(value)),
    "Build tooling": all.filter((value) => /(vite|webpack|turbo|eslint|typescript|tsup|rollup)/i.test(value)),
    Other: all.filter((value) =>
      !/(next|react|vue|svelte|express|nestjs|fastify|tailwind|radix|chakra|mui|styled|framer|pg|prisma|drizzle|supabase|trpc|graphql|axios|openai|anthropic|langchain|huggingface|replicate|deepseek|mistral|cohere|groq|together|fireworks|ai-sdk|auth|clerk|lucia|next-auth|passport|jest|vitest|playwright|cypress|pytest|testing-library|vite|webpack|turbo|eslint|typescript|tsup|rollup)/i.test(value)
    ),
  };
  if (requirements.trim()) {
    const python = requirements
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    out["Python requirements"] = python;
  }
  return out;
}

function packageDependencyMap(pkg: Record<string, unknown> | null): {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  return {
    dependencies:
      pkg && typeof pkg.dependencies === "object" && pkg.dependencies
        ? (pkg.dependencies as Record<string, string>)
        : {},
    devDependencies:
      pkg && typeof pkg.devDependencies === "object" && pkg.devDependencies
        ? (pkg.devDependencies as Record<string, string>)
        : {},
  };
}

function dependencyNames(pkg: Record<string, unknown> | null): Set<string> {
  const deps = packageDependencyMap(pkg);
  return new Set([
    ...Object.keys(deps.dependencies),
    ...Object.keys(deps.devDependencies),
  ]);
}

// Prefixes that reliably identify environment variable names in source code
// (as opposed to random ALL_CAPS constants like HTML element IDs, SQL keywords, etc.)
const ENV_VAR_PREFIXES = /^(NEXT_PUBLIC_|VITE_|PUBLIC_|SUPABASE_|OPENAI_|ANTHROPIC_|DEEPSEEK_|GEMINI_|GOOGLE_|MISTRAL_|COHERE_|GROQ_|AIML|DATABASE_|REDIS_|AUTH_|API_|SECRET_|STRIPE_|CLOUDINARY_|POSTHOG_|LINEAR_|GITHUB_|NETLIFY_|VERCEL_|AWS_|S3_|SENDGRID_|RESEND_|TWILIO_|SENTRY_|BRAVE_|TAVILY_|HUGGING)/;

function extractEnvVars(files: string[], root: string): string[] {
  const vars = new Set<string>();
  // Scan all text files — env vars can appear anywhere (functions, hooks, scripts, docs)
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) continue;
    const text = readTextIfExists(join(root, file));
    // Pattern 1: process.env.VAR_NAME or os.environ["VAR_NAME"] / getenv("VAR_NAME")
    for (const match of text.matchAll(/\b(?:process\.env|os\.environ(?:\.get)?|getenv|Deno\.env\.get)\s*(?:\.\s*|\[\s*['"`]|get\s*\(\s*['"`])([A-Z][A-Z0-9_]+)/g)) {
      if (match[1]) vars.add(match[1]);
    }
    // Pattern 2: bare ALL_CAPS names that match known env var prefixes
    for (const match of text.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) {
      if (ENV_VAR_PREFIXES.test(match[1])) vars.add(match[1]);
    }
  }
  return [...vars].sort().slice(0, 120);
}

function detectDeploymentSignals(files: string[], root: string): string[] {
  const out: string[] = [];
  if (files.includes("netlify.toml")) out.push("Netlify config detected");
  if (files.includes("vercel.json")) out.push("Vercel config detected");
  if (files.some((file) => /Dockerfile|docker-compose/i.test(file))) out.push("Docker config detected");
  if (files.some((file) => file.startsWith(".github/workflows/"))) out.push("GitHub Actions detected");
  if (files.some((file) => /render\.yaml|fly\.toml/i.test(file))) out.push("Additional deploy config detected");
  const envExample = ["README.md", "README"].map((name) => join(root, name)).find((file) => existsSync(file));
  if (envExample && readTextIfExists(envExample).match(/https?:\/\//)) out.push("README references external URLs");
  return out;
}

// Domains that are always service dashboards / provider consoles, never a live app URL
const SERVICE_DOMAINS = [
  "app.supabase.com", "supabase.com", "dashboard.stripe.com", "stripe.com",
  "platform.openai.com", "console.anthropic.com", "aimlapi.com",
  "aistudio.google.com", "platform.deepseek.com", "console.mistral.ai",
  "dashboard.cohere.com", "cohere.com", "openai.com", "anthropic.com",
  "github.com", "npmjs.com", "docs.github.com", "developer.mozilla.org",
  "tailwindcss.com", "reactjs.org", "nextjs.org", "vitejs.dev",
  "cloudinary.com", "posthog.com", "linear.app",
  // AI provider consoles / key pages that slipped through previously
  "huggingface.co", "deepai.org", "api.search.brave.com",
  "app.tavily.com", "tavily.com", "mistral.ai", "replicate.com",
  "together.ai", "groq.com", "fireworks.ai",
];

// URL path prefixes that indicate setup/docs pages, not a running app
const SERVICE_PATH_PREFIXES = [
  "/api-keys", "/apikeys", "/settings/tokens", "/dashboard",
  "/app/keys", "/settings/keys", "/app/api-keys",
];

function isServiceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (SERVICE_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return true;
    if (SERVICE_PATH_PREFIXES.some((p) => parsed.pathname.startsWith(p))) return true;
    return false;
  } catch {
    return true; // malformed URLs are not live app URLs
  }
}

function isPlaceholderUrl(url: string): boolean {
  // Reject template strings that were never filled in
  return /your-|example\.|placeholder|<[^>]+>/i.test(url);
}

function extractUrls(files: string[], root: string): string[] {
  const urls = new Set<string>();
  for (const file of files.slice(0, 100)) {
    const text = readTextIfExists(join(root, file));
    for (const match of text.matchAll(/https?:\/\/[^\s'")<>]+/g)) {
      const url = match[0].replace(/[.,;]+$/, ""); // strip trailing punctuation
      if (!isServiceUrl(url) && !isPlaceholderUrl(url)) urls.add(url);
    }
  }
  // Also strip localhost — useful in dev but not a "live URL"
  return [...urls].filter((u) => !/^https?:\/\/localhost\b/.test(u));
}

function readGitInfo(root: string): {
  defaultBranch?: string;
  firstCommitDate?: string;
  latestCommitDate?: string;
  commitCount?: number;
} {
  try {
    const defaultBranch = execFileSync("git", ["-C", root, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: "pipe",
    }).trim();
    const latestCommitDate = execFileSync("git", ["-C", root, "log", "-1", "--format=%cI"], {
      encoding: "utf8",
      stdio: "pipe",
    }).trim();
    const firstCommitDate = execFileSync("git", ["-C", root, "log", "--reverse", "--format=%cI"], {
      encoding: "utf8",
      stdio: "pipe",
    })
      .split(/\r?\n/)
      .find(Boolean)
      ?.trim();
    const commitCount = Number(
      execFileSync("git", ["-C", root, "rev-list", "--count", "HEAD"], {
        encoding: "utf8",
        stdio: "pipe",
      }).trim()
    );
    return { defaultBranch, firstCommitDate, latestCommitDate, commitCount };
  } catch {
    return {};
  }
}

function detectBuildTool(pkg: Record<string, unknown> | null, files: string[]): string {
  const deps = dependencyNames(pkg);
  if (deps.has("vite")) return "vite";
  if (deps.has("next")) return "next";
  if (deps.has("turbo")) return "turborepo";
  if (files.some((file) => file === "Makefile")) return "make";
  return "unknown";
}

function detectHosting(files: string[]): string {
  if (files.includes("netlify.toml")) return "netlify";
  if (files.includes("vercel.json")) return "vercel";
  if (files.some((file) => /Dockerfile|docker-compose/i.test(file))) return "docker";
  return "unknown";
}

function detectDatabase(
  pkg: Record<string, unknown> | null,
  pyproject: string,
  files: string[]
): string {
  const deps = dependencyNames(pkg);
  if (deps.has("@supabase/supabase-js") || files.some((file) => file.startsWith("supabase/"))) return "supabase";
  if (deps.has("pg") || deps.has("postgres")) return "postgresql";
  if (deps.has("sqlite3") || pyproject.includes("sqlite")) return "sqlite";
  if (deps.has("prisma")) return "prisma";
  if (deps.has("drizzle-orm")) return "drizzle";
  return "unknown";
}

function detectCss(pkg: Record<string, unknown> | null, files: string[]): string {
  const deps = dependencyNames(pkg);
  if (deps.has("tailwindcss") || files.some((file) => /tailwind\.config/i.test(file))) return "tailwind";
  if (files.some((file) => extname(file).toLowerCase() === ".css")) return "css";
  return "unknown";
}

function classifyRepoStatus(
  files: string[],
  testFiles: string[],
  deploymentSignals: string[]
): string {
  if (files.length < 10) return "concept";
  if (deploymentSignals.length === 0 && testFiles.length === 0) return "prototype";
  if (deploymentSignals.length === 0) return "alpha";
  if (testFiles.length > 0 && deploymentSignals.length > 0) return "beta";
  return "alpha";
}

function buildApiLayerSection(snapshot: RepoSnapshot): string {
  const lines: string[] = [];

  // Detect API functions/routes from file paths
  const apiFunctions = snapshot.fileSamples.filter((s) =>
    /^(netlify\/functions|api|app\/api|pages\/api|server\/api|src\/api)/i.test(s.path)
  );
  // Match files named exactly route.ts / route.js (Next.js App Router convention),
  // not components whose name contains "Route" (e.g. ProtectedRoute.tsx)
  const routeFiles = snapshot.fileSamples.filter((s) =>
    /[/\\]route\.(ts|js)$|[/\\]endpoint\.(ts|js)$/i.test(s.path)
  );
  const allApiFiles = [...apiFunctions, ...routeFiles];

  if (allApiFiles.length > 0) {
    lines.push(`**API endpoints detected (${allApiFiles.length}):**`);
    for (const f of allApiFiles.slice(0, 25)) {
      // Try to infer HTTP method and purpose from excerpt
      const methods = new Set<string>();
      if (/GET|req\.method.*GET/i.test(f.excerpt)) methods.add("GET");
      if (/POST|req\.method.*POST/i.test(f.excerpt)) methods.add("POST");
      if (/PATCH|PUT/i.test(f.excerpt)) methods.add("PATCH");
      if (/DELETE/i.test(f.excerpt)) methods.add("DELETE");
      const methodStr = methods.size > 0 ? `[${[...methods].join("/")}]` : "";
      lines.push(`- \`${f.path}\` ${methodStr}`);
    }
    if (allApiFiles.length > 25) {
      lines.push(`- ... + ${allApiFiles.length - 25} more endpoints`);
    }
  }

  // Check for API config patterns
  const configApiFiles = snapshot.configFiles.filter((f) => /api|route|server/i.test(f));
  if (configApiFiles.length > 0 && allApiFiles.length === 0) {
    lines.push(`**API config files:** ${configApiFiles.map((f) => `\`${f}\``).join(", ")}`);
  }

  if (lines.length === 0) return "[NOT FOUND IN CODEBASE]";
  return lines.join("\n");
}

function buildScaleSection(snapshot: RepoSnapshot): string {
  const lines: string[] = [];

  lines.push(`| Signal | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Total files scanned | ${snapshot.fileCount} |`);
  lines.push(`| Source files sampled | ${snapshot.fileSamples.length} |`);
  lines.push(`| Test files | ${snapshot.testFiles.length} |`);
  lines.push(`| Config files | ${snapshot.configFiles.length} |`);
  lines.push(`| Commits | ${snapshot.commitCount ?? "unknown"} |`);

  if (snapshot.firstCommitDate && snapshot.latestCommitDate) {
    const first = new Date(snapshot.firstCommitDate);
    const latest = new Date(snapshot.latestCommitDate);
    const weeks = Math.round((latest.getTime() - first.getTime()) / (7 * 24 * 60 * 60 * 1000));
    lines.push(`| Repository age | ~${weeks} weeks |`);
    if (snapshot.commitCount && weeks > 0) {
      lines.push(`| Commit velocity | ~${Math.round(snapshot.commitCount / Math.max(weeks, 1))}/week |`);
    }
  }

  // Performance patterns detected
  const perfSignals = new Set<string>();
  for (const sample of snapshot.fileSamples) {
    const e = sample.excerpt;
    if (/React\.lazy|lazy\(|Suspense/i.test(e)) perfSignals.add("Code splitting (React.lazy)");
    if (/useMemo|useCallback|memo\(/i.test(e)) perfSignals.add("Memoization");
    if (/staleTime|cacheTime|react-query/i.test(e)) perfSignals.add("Query caching");
    if (/p-limit|concurrency|throttle/i.test(e)) perfSignals.add("Concurrency control");
    if (/aggregate|materialized|daily_/i.test(e)) perfSignals.add("Pre-computed aggregates");
    if (/sha.?256|hash|dedup/i.test(e)) perfSignals.add("Content deduplication");
  }
  if (perfSignals.size > 0) {
    lines.push("");
    lines.push(`**Performance patterns:** ${[...perfSignals].join(", ")}`);
  }

  return lines.join("\n");
}

function buildCodeQualitySection(snapshot: RepoSnapshot): string {
  const lines: string[] = [];

  // Commands
  lines.push(`**Validation commands:**`);
  lines.push(formatCommands(snapshot.commands));
  lines.push("");

  // Test coverage
  if (snapshot.testFiles.length > 0) {
    lines.push(`**Test files (${snapshot.testFiles.length}):** ${snapshot.testFiles.slice(0, 10).map((f) => `\`${f}\``).join(", ")}${snapshot.testFiles.length > 10 ? ` + ${snapshot.testFiles.length - 10} more` : ""}`);
  } else {
    lines.push("**Testing:** No test files detected ⚠️");
  }

  // Linting / type checking
  const deps = Object.values(snapshot.dependencyGroups).flat();
  const qualityTools = new Set<string>();
  if (deps.some((d) => /eslint/i.test(d))) qualityTools.add("ESLint");
  if (deps.some((d) => /prettier/i.test(d))) qualityTools.add("Prettier");
  if (deps.some((d) => /stylelint/i.test(d))) qualityTools.add("Stylelint");
  if (deps.some((d) => /typescript/i.test(d))) qualityTools.add("TypeScript");
  if (deps.some((d) => /storybook/i.test(d))) qualityTools.add("Storybook");
  if (deps.some((d) => /chromatic/i.test(d))) qualityTools.add("Chromatic");
  if (qualityTools.size > 0) {
    lines.push(`**Quality tooling:** ${[...qualityTools].join(", ")}`);
  }

  // CI/CD
  const ciFiles = snapshot.configFiles.filter((f) =>
    /workflow|ci\.yml|ci\.yaml|\.github\/workflows/i.test(f)
  );
  if (ciFiles.length > 0) {
    lines.push(`**CI/CD:** ${ciFiles.map((f) => `\`${f}\``).join(", ")}`);
  }

  // Code patterns
  const patterns = new Set<string>();
  for (const sample of snapshot.fileSamples) {
    const e = sample.excerpt;
    if (/ErrorBoundary|error.boundary/i.test(e)) patterns.add("Error boundaries");
    if (/try\s*\{[\s\S]*catch/i.test(e)) patterns.add("Structured error handling");
    if (/console\.error|console\.warn/i.test(e)) patterns.add("Console logging");
    if (/zod|z\.object|z\.string/i.test(e)) patterns.add("Zod validation");
    if (/ajv|jsonschema/i.test(e)) patterns.add("JSON Schema validation");
  }
  if (patterns.size > 0) {
    lines.push(`**Code patterns:** ${[...patterns].join(", ")}`);
  }

  return lines.join("\n\n");
}

function buildGapsSection(snapshot: RepoSnapshot): string {
  const gaps: Array<{ gap: string; severity: string; notes: string }> = [];

  // Check for missing test coverage
  if (snapshot.testFiles.length === 0) {
    gaps.push({ gap: "No test suite detected", severity: "High", notes: "No test files found in the repository" });
  } else if (snapshot.testFiles.length < 5 && snapshot.fileCount > 100) {
    gaps.push({ gap: "Low test coverage", severity: "Medium", notes: `${snapshot.testFiles.length} test files for ${snapshot.fileCount} total files` });
  }

  // Check for missing deployment
  if (snapshot.deploymentSignals.length === 0) {
    gaps.push({ gap: "No deployment configuration", severity: "High", notes: "No Netlify, Vercel, Docker, or CI/CD config detected" });
  }

  // Check for error monitoring
  const deps = Object.values(snapshot.dependencyGroups).flat();
  if (!deps.some((d) => /sentry|bugsnag|datadog|newrelic/i.test(d))) {
    gaps.push({ gap: "No error monitoring service", severity: "Medium", notes: "No Sentry, Bugsnag, or similar dependency found" });
  }

  // Check for env documentation — check all file paths, not just configFiles
  if (snapshot.envVars.length > 5 && !snapshot.allFilePaths.some((f) => /^\.env\.example$|\.env\.template/i.test(f))) {
    gaps.push({ gap: "No .env.example file", severity: "Low", notes: `${snapshot.envVars.length} env vars used but no template file for onboarding` });
  }

  // Security signals
  for (const sample of snapshot.fileSamples) {
    if (/Access-Control-Allow-Origin.*\*/i.test(sample.excerpt)) {
      gaps.push({ gap: "Wildcard CORS policy", severity: "High", notes: `Found in \`${sample.path}\` — should be origin-specific` });
      break;
    }
  }

  // Missing README
  if (!snapshot.readmeQuote) {
    gaps.push({ gap: "Missing or empty README", severity: "Low", notes: "No description found in README" });
  }

  if (gaps.length === 0) {
    return "No critical gaps detected from static analysis. A runtime audit is recommended to verify.";
  }

  const table = gaps.map((g) => `| ${g.gap} | ${g.severity} | ${g.notes} |`).join("\n");
  return `| Gap | Severity | Notes |
|---|---|---|
${table}

**Recommended next steps:**
1. Review and tighten the generated expectations document.
2. Confirm scan roots and commands before activating audits.
3. Run a scoped full audit after activation.
4. Address high-severity gaps before production deployment.
5. Capture operator decisions so penny can calibrate future audits.`;
}

function buildExecutiveSummary(snapshot: RepoSnapshot): string {
  const name = snapshot.projectName;
  const status = snapshot.profileSummary.status ?? "working";
  const framework = snapshot.frameworks[0] ?? snapshot.languages[0] ?? "a custom stack";

  const age = (() => {
    if (!snapshot.firstCommitDate || !snapshot.latestCommitDate) return "";
    const weeks = Math.round(
      (new Date(snapshot.latestCommitDate).getTime() - new Date(snapshot.firstCommitDate).getTime()) /
        (7 * 24 * 60 * 60 * 1000)
    );
    return weeks > 0 ? ` over ~${weeks} weeks` : "";
  })();
  const velocity = (() => {
    if (!snapshot.commitCount || !snapshot.firstCommitDate || !snapshot.latestCommitDate) return "";
    const weeks = Math.max(1, Math.round(
      (new Date(snapshot.latestCommitDate).getTime() - new Date(snapshot.firstCommitDate).getTime()) /
        (7 * 24 * 60 * 60 * 1000)
    ));
    const rate = Math.round(snapshot.commitCount / weeks);
    return rate > 0 ? ` (~${rate} commits/week)` : "";
  })();
  const commitInfo = snapshot.commitCount
    ? ` with ${snapshot.commitCount} commits${age}${velocity}`
    : "";

  // Derive product identity from actual detected signals
  const allPaths = snapshot.allFilePaths;
  const hasAiRouter = allPaths.some((f) => /\/(ai|llm)\/(router|provider|registry)/i.test(f)) ||
    snapshot.fileSamples.some((s) => /provider.*router|router.*provider|multi.?provider/i.test(s.excerpt));
  const hasWorkflow = allPaths.some((f) => /\/(flow|workflow|pipeline|canvas|node)/i.test(f));
  const hasBilling = allPaths.some((f) => /billing|checkout|subscription|stripe/i.test(f));
  const hasAssets = allPaths.some((f) => /asset|upload|cloudinary|image.generate/i.test(f));
  const hasOauth = snapshot.fileSamples.some((s) => /oauth|github.auth|auth.callback/i.test(s.path));
  const hasRag = snapshot.fileSamples.some((s) => /retrieval|rag|vector|embedding/i.test(s.excerpt));
  const aiProviders = detectAiProviderNames(snapshot);
  const netlifyFnCount = allPaths.filter((f) => f.startsWith("netlify/functions/") && f.endsWith(".ts")).length;

  // Paragraph 1 — what is this product
  const productDesc = (() => {
    const parts: string[] = [];
    if (hasAiRouter) parts.push(`multi-provider AI routing${aiProviders.length > 0 ? ` (${aiProviders.slice(0, 4).join(", ")})` : ""}`);
    if (hasWorkflow) parts.push("visual workflow composition");
    if (hasRag) parts.push("RAG / retrieval augmentation");
    if (hasAssets) parts.push("AI image generation and asset management");
    if (hasBilling) parts.push("subscription billing");
    if (hasOauth) parts.push("GitHub OAuth integration");
    if (parts.length === 0) parts.push("full-stack application");
    return parts.join(", ");
  })();

  const para1 = `**${name}** is a **${status}** ${framework} application${commitInfo}. It is built around ${productDesc}, backed by Supabase (PostgreSQL + Auth + RLS) and deployed as a Netlify SPA with ${netlifyFnCount > 0 ? `${netlifyFnCount} serverless functions` : "serverless functions"}.`;

  // Paragraph 2 — technical maturity
  const ciDefined = snapshot.configFiles.some((f) => /\.github\/workflows/i.test(f));
  const testStr = snapshot.testFiles.length > 0
    ? `${snapshot.testFiles.length} test files are present`
    : "No automated test suite was detected";
  const qualityStr = [
    snapshot.commands.typecheck ? "TypeScript strict mode" : "",
    snapshot.commands.lint ? "ESLint" : "",
    ciDefined ? "CI/CD via GitHub Actions" : "",
  ].filter(Boolean).join(", ");

  const para2 = `${testStr}. Quality tooling includes ${qualityStr || "standard linting"}. The serverless layer handles auth callbacks, AI completions, billing webhooks, asset management, and credential storage — all functions are TypeScript with Supabase JWT verification.`;

  // Paragraph 3 — audit readiness
  const gaps = [];
  const deps = Object.values(snapshot.dependencyGroups).flat();
  if (!deps.some((d) => /sentry|bugsnag|datadog/i.test(d))) gaps.push("no error monitoring");
  if (!snapshot.allFilePaths.some((f) => /^\.env\.example$|\.env\.template/i.test(f))) gaps.push("no .env.example");
  const hasCors = snapshot.fileSamples.some((s) => /Access-Control-Allow-Origin.*\*/i.test(s.excerpt));
  if (hasCors) gaps.push("wildcard CORS policy in serverless functions");

  const para3 = gaps.length > 0
    ? `Key gaps before production hardening: ${gaps.join("; ")}. Profile generated from static analysis — runtime behaviour, RLS policy correctness, and external service configuration require a scoped audit to verify.`
    : `No critical gaps were detected from static analysis. A scoped audit is recommended to verify RLS policies, auth edge cases, and runtime behaviour before production launch.`;

  return `${para1}\n\n${para2}\n\n${para3}`;
}

function detectAiProviderNames(snapshot: RepoSnapshot): string[] {
  const names: string[] = [];
  const allText = snapshot.fileSamples.map((s) => s.excerpt).join(" ");
  const envText = snapshot.envVars.join(" ");
  const combined = allText + " " + envText;
  if (/openai|gpt-/i.test(combined)) names.push("OpenAI");
  if (/anthropic|claude/i.test(combined)) names.push("Anthropic");
  if (/deepseek/i.test(combined)) names.push("DeepSeek");
  if (/gemini|google.gen/i.test(combined)) names.push("Google Gemini");
  if (/mistral/i.test(combined)) names.push("Mistral");
  if (/cohere/i.test(combined)) names.push("Cohere");
  if (/groq/i.test(combined)) names.push("Groq");
  if (/aimlapi/i.test(combined)) names.push("AimlAPI");
  if (/huggingface/i.test(combined)) names.push("HuggingFace");
  return names;
}

function buildFeatureInventory(snapshot: RepoSnapshot): string {
  // Use all file paths for categorization — fileSamples only covers 40 files
  // out of potentially hundreds, which makes large repos look nearly empty.
  const files = snapshot.allFilePaths;
  // Group files into feature areas by path pattern
  const areas: Record<string, { files: string[]; signals: Set<string> }> = {};
  const categorize = (file: string): string => {
    // --- Exclusive top-level directories — checked first ---
    if (/^archive\//i.test(file)) return "Archive";
    if (/^(\.github|\.cursor)\//i.test(file)) return "Agent / CI Rules";
    if (/^\.storybook\//i.test(file)) return "Build tooling";
    // Whole-subtree catches for well-known monorepo sub-packages
    if (/^repair_engine\//i.test(file)) return "AI / ML Integration";
    if (/^worker\//i.test(file)) return "AI / ML Integration";
    if (/^atlas\//i.test(file)) return "Specification Engine";
    if (/^comparisons\//i.test(file)) return "Documentation";
    if (/^expectations\//i.test(file)) return "Specification Engine";
    if (/^the_penny_lane_project\//i.test(file)) return "Documentation";
    // Custom ESLint plugins and rule packages — build tooling
    if (/^eslint-plugin-/i.test(file) || /^eslint-rules?\//i.test(file)) return "Build tooling";
    // All supabase/ files (config, seeds, edge functions, non-migration SQL)
    if (/^supabase\//i.test(file)) return "Database / Migrations";

    // --- Root-level dotfiles and lock files ---
    if (/^\.(env|gitignore|gitattributes|eslintrc|editorconfig|nvmrc|npmrc|prettierrc|stylelintrc)/i.test(file) ||
        /\.(env\.example|env\.local|env\.production)$/i.test(file) ||
        /^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|deno\.lock|bun\.lockb)$/.test(file)) return "Configuration";

    // --- Root-level plain-text docs (AGENTS.md, README.md, LICENSE, etc.) ---
    if (/^[A-Z][A-Z0-9 _-]*\.(md|txt)$/i.test(file)) return "Documentation";
    if (/^(LICENSE|LICENCE|AUTHORS|CONTRIBUTORS|NOTICE)(\.txt)?$/i.test(file)) return "Configuration";
    // Files with no extension that look like spec/charter docs (e.g. "Codra Language Charter")
    if (/^[A-Z][A-Za-z0-9 ]+(Charter|Specification|Manifest|Policy|Contract).*$/.test(file)) return "Documentation";

    // --- Domain-specific (ordered most exclusive → broadest) ---
    if (/\/(auth|login|signup|register|password|session)\b/i.test(file)) return "Authentication";
    if (/\/(billing|checkout|subscription|payment|stripe|webhook)/i.test(file)) return "Billing & Payments";
    if (/supabase\/migrations\/|\/migrations\/.*\.sql$/i.test(file)) return "Database / Migrations";
    if (/\/(test|spec|__tests__)\//i.test(file) || /\.(test|spec)\.(ts|tsx|js|jsx)$/i.test(file)) return "Testing";
    // audits/ anywhere in path — top-level audits/ AND src/audits/, etc. (test files already caught above)
    if (/(?:^|\/)audits?\//i.test(file)) return "Specification Engine";
    if (/\/(onboarding|wizard|tour|welcome)/i.test(file)) return "Onboarding";
    // AI before broad lib — catches src/lib/ai/, providers/, netlify/functions/ai-*, etc.
    if (/\/(ai|llm|models?|providers?|completion|agent|prompt)\//i.test(file)) return "AI / ML Integration";
    if (/\/(flow|canvas|workflow)\//i.test(file)) return "Workflow Engine";
    if (/\/(asset|upload|cloudinary)\//i.test(file)) return "Asset Management";
    if (/\/(specification|expectation|audit[-_]template|audit[-_]output)/i.test(file)) return "Specification Engine";
    if (/^src\/domain\//i.test(file)) return "Domain Logic";
    // Context/provider files — before UI so AssistantContext.tsx is caught here
    if (/\/(context|provider)\.(tsx?|jsx?)$/i.test(file)) return "React Context / Providers";
    // State stores — before UI
    if (/\/(store|stores|slice|atom)\.(ts|tsx)$|\/stores?\//i.test(file)) return "State Management";
    // Hooks — /hooks/ directory OR /useXxx camelCase (no i flag on second to avoid matching user-)
    if (/\/hooks?\//i.test(file) || /\/use[A-Z]/.test(file)) return "React Hooks";
    // UI Components — plural-aware so src/components/, src/pages/, src/views/ all match
    if (/\/(components?|ui|widgets?|modals?|panels?|buttons?|forms?|layouts?|pages?|views?)\//i.test(file)) return "UI Components";
    // CSS/stylesheet files — checked before src/app/ catch so globals.css goes to Design System
    if (/\.(css|scss|sass|less|styl)$/.test(file)) return "Design System";
    if (/\/(style|css|theme|token|design)\//i.test(file)) return "Design System";
    // Storybook stories — build/documentation tooling
    if (/\/stories?\//i.test(file) || /\.stories\.(ts|tsx|js|jsx)$/.test(file)) return "Build tooling";
    // Broad catches for feature slices, next-gen tree, and app/ directory
    if (/^src\/(features|new|app)\//i.test(file)) return "UI Components";
    // Files directly in src/ (main.tsx, App.tsx, vite-env.d.ts, etc.)
    if (/^src\/[^/]+\.(ts|tsx|js|jsx)$/.test(file)) return "UI Components";
    if (/\/(dashboard|admin|metric|analytics)\//i.test(file)) return "Admin / Analytics";
    // API endpoints — exclude only real test files (*.test.ts, __tests__/), not *-test.ts endpoints
    if (/\/(api|functions?|endpoint|route)\b/i.test(file) && !/(^|\/)__tests__\/|\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file)) return "API Endpoints";
    // Broad netlify/ catch — plugins, edge functions not caught by auth/billing patterns
    if (/^netlify\//i.test(file)) return "API Endpoints";
    if (/\/(config|setting|env)\//i.test(file)) return "Configuration";
    // Documentation — no leading-slash requirement so root-level files match
    if (/(doc|readme|guide|changelog)/i.test(file)) return "Documentation";
    if (/\/(script|tool|util|helper)\//i.test(file)) return "Utilities & Scripts";
    if (/^scripts\//i.test(file)) return "Utilities & Scripts";
    // src/ subdirectories not caught by specific patterns above (pipeline, utils, types, etc.)
    if (/^src\/(?:pipeline|utils?|constants?|types?|contexts?|services?|adapters?)\//i.test(file)) return "Utilities & Scripts";
    // src/lib catch-all — after all more-specific patterns
    if (/^src\/lib\//i.test(file)) return "Utilities & Scripts";
    // Root-level files with no subdirectory (package.json, vite.config.ts, index.html, etc.)
    if (!file.includes("/")) {
      if (/\.(py|sh|bash|zsh)$/.test(file) || file === "Makefile") return "Utilities & Scripts";
      if (/\.(md|mdx|txt)$/.test(file)) return "Documentation";
      if (/\.(html|htm)$/.test(file)) return "Build tooling";
      // config-like files before jsx check — postcss.config.js, netlify.toml, package.json, etc.
      if (/\.(toml|yml|yaml|json|cjs|mjs|js|ts)$/.test(file)) return "Configuration";
      if (/\.(jsx|tsx)$/.test(file)) return "UI Components";
    }
    return "Other";
  };

  for (const file of files) {
    const area = categorize(file);
    if (!areas[area]) areas[area] = { files: [], signals: new Set() };
    areas[area].files.push(file);
  }

  // Also scan samples for deeper signals
  for (const sample of snapshot.fileSamples) {
    const area = categorize(sample.path);
    if (!areas[area]) continue;
    const e = sample.excerpt.toLowerCase();
    if (e.includes("export default") || e.includes("export function")) areas[area].signals.add("exports");
    if (e.includes("fetch(") || e.includes("axios")) areas[area].signals.add("HTTP calls");
    if (e.includes("usestate") || e.includes("useeffect")) areas[area].signals.add("React state");
    if (e.includes("create table") || e.includes("alter table")) areas[area].signals.add("DDL");
    if (e.includes("rls") || e.includes("row level")) areas[area].signals.add("RLS");
    if (e.includes("stripe")) areas[area].signals.add("Stripe integration");
    if (e.includes("jwt") || e.includes("bearer") || e.includes("getuser")) areas[area].signals.add("JWT auth");
  }

  const sorted = Object.entries(areas)
    .filter(([, v]) => v.files.length > 0)
    .sort((a, b) => b[1].files.length - a[1].files.length);

  if (sorted.length === 0) return "- [NOT FOUND IN CODEBASE]";

  const lines = sorted.map(([area, data]) => {
    const fileList = data.files.slice(0, 5).map((f) => `\`${f}\``).join(", ");
    const extra = data.files.length > 5 ? ` + ${data.files.length - 5} more` : "";
    const signals = data.signals.size > 0 ? ` — signals: ${[...data.signals].join(", ")}` : "";
    return `| **${area}** | ${data.files.length} files | ${fileList}${extra}${signals} |`;
  });

  return `| Feature Area | Files | Key Paths |
|---|---|---|
${lines.join("\n")}`;
}

function detectIntegrationsFromDependencies(
  groups: Record<string, string[]>,
  samples?: Array<{ path: string; excerpt: string }>
): string[] {
  const integrations = new Map<string, string>();
  const depList = Object.values(groups).flat();

  // Dependency-based detection
  const depSignals: Array<[RegExp, string, string]> = [
    [/stripe/i, "Stripe", "Subscription billing, checkout, webhooks"],
    [/supabase/i, "Supabase", "PostgreSQL DB, Auth, Storage"],
    [/openai/i, "OpenAI", "AI completions"],
    [/anthropic/i, "Anthropic", "AI completions (Claude)"],
    [/sentry/i, "Sentry", "Error monitoring"],
    [/cloudinary/i, "Cloudinary", "Image/asset CDN"],
    [/posthog/i, "PostHog", "Product analytics"],
    [/octokit/i, "GitHub (Octokit)", "GitHub API integration"],
    [/resend|sendgrid|nodemailer/i, "Email Service", "Transactional email"],
    [/redis|ioredis|bullmq/i, "Redis", "Caching / job queue"],
    [/twilio/i, "Twilio", "SMS / communications"],
    [/aws-sdk|@aws/i, "AWS", "Cloud infrastructure"],
    [/firebase/i, "Firebase", "Backend-as-a-service"],
    [/deepseek/i, "DeepSeek", "AI completions"],
    [/huggingface/i, "HuggingFace", "AI/ML models"],
    [/mistral/i, "Mistral", "AI completions"],
    [/cohere/i, "Cohere", "AI completions"],
  ];

  for (const dep of depList) {
    for (const [pattern, name, purpose] of depSignals) {
      if (pattern.test(dep)) integrations.set(name, purpose);
    }
  }

  // Code-based detection from samples
  if (samples) {
    for (const sample of samples) {
      const e = sample.excerpt;
      if (/DEEPSEEK_API_KEY|deepseek\.com/i.test(e) && !integrations.has("DeepSeek"))
        integrations.set("DeepSeek", "AI completions (inferred from code)");
      if (/GEMINI_API_KEY|generativelanguage\.googleapis/i.test(e) && !integrations.has("Google Gemini"))
        integrations.set("Google Gemini", "AI completions (inferred from code)");
      if (/TAVILY_API_KEY/i.test(e) && !integrations.has("Tavily"))
        integrations.set("Tavily", "Web search / RAG (inferred from code)");
      if (/BRAVE_SEARCH/i.test(e) && !integrations.has("Brave Search"))
        integrations.set("Brave Search", "Web search (inferred from code)");
      if (/AIMLAPI/i.test(e) && !integrations.has("AimlAPI"))
        integrations.set("AimlAPI", "AI aggregator (inferred from code)");
    }
  }

  return [...integrations.entries()].map(([name, purpose]) => `- **${name}** — ${purpose}`);
}

function detectAiSignals(
  groups: Record<string, string[]>,
  samples: Array<{ path: string; excerpt: string }>
): string {
  const deps = Object.values(groups).flat().filter((dep) =>
    /(openai|anthropic|langchain|huggingface|replicate|deepseek|mistral|cohere|aimlapi)/i.test(dep)
  );
  const lines: string[] = [];

  if (deps.length > 0) {
    lines.push(`**AI dependencies:** ${deps.join(", ")}`);
  }

  // Scan samples for provider implementations, routers, prompt patterns
  const providerFiles = samples.filter((s) =>
    /(provider|router|model|ai|llm|agent|completion|prompt)/i.test(s.path)
  );
  if (providerFiles.length > 0) {
    lines.push(`**AI-related source files:** ${providerFiles.map((s) => `\`${s.path}\``).join(", ")}`);
  }

  // Detect specific patterns
  const patterns: Array<[RegExp, string]> = [
    [/class\s+\w*(Router|Provider|Agent)/i, "Provider/Router architecture"],
    [/streaming|server-sent|SSE|ReadableStream/i, "Streaming completions"],
    [/embedding|vector|semantic.search/i, "Embeddings / vector search"],
    [/prompt.*template|system.*prompt/i, "Prompt templating"],
    [/fallback.*provider|retry.*provider/i, "Multi-provider fallback"],
    [/token.*count|cost.*estimat|usage.*track/i, "Token/cost tracking"],
    [/agent.*catalog|agent.*preset/i, "Agent presets/catalog"],
    [/benchmark|evaluat/i, "Model benchmarking"],
    [/retrieval|rag|search.*context/i, "RAG / retrieval augmentation"],
  ];

  const detectedPatterns = new Set<string>();
  for (const sample of samples) {
    for (const [pattern, label] of patterns) {
      if (pattern.test(sample.excerpt)) detectedPatterns.add(label);
    }
  }
  if (detectedPatterns.size > 0) {
    lines.push(`**Detected patterns:** ${[...detectedPatterns].join(", ")}`);
  }

  if (lines.length === 0) {
    if (samples.some((s) => /prompt|completion|gpt|claude/i.test(s.excerpt))) {
      return "AI-related strings detected in code but no structured AI subsystem found.";
    }
    return "[NOT FOUND IN CODEBASE]";
  }
  return lines.join("\n\n");
}

function detectAuthSignals(
  groups: Record<string, string[]>,
  samples: Array<{ path: string; excerpt: string }>
): string {
  const deps = [...new Set(Object.values(groups).flat().filter((dep) =>
    /(auth|clerk|lucia|next-auth|passport|supabase)/i.test(dep)
  ))];
  const lines: string[] = [];
  if (deps.length > 0) {
    lines.push(`**Auth libraries:** ${deps.join(", ")}`);
  }

  const authFiles = samples.filter((s) =>
    /(auth|login|signup|register|session|callback|password)/i.test(s.path)
  );
  if (authFiles.length > 0) {
    lines.push(`**Auth-related files:** ${authFiles.map((s) => `\`${s.path}\``).join(", ")}`);
  }

  const methods = new Set<string>();
  for (const sample of samples) {
    const e = sample.excerpt;
    if (/supabase\.auth|getUser|getSession/i.test(e)) methods.add("Supabase Auth (JWT)");
    if (/signInWith(Password|OAuth|Otp)/i.test(e)) methods.add("Email/password + OAuth");
    if (/oauth.*callback|github.*auth/i.test(e)) methods.add("OAuth callback flow");
    if (/ProtectedRoute|GuestRoute|RequireAuth/i.test(e)) methods.add("Route guards");
    if (/RLS|row.level.security/i.test(e)) methods.add("Row-Level Security");
    if (/Bearer|authorization.*header/i.test(e)) methods.add("Bearer token verification");
    if (/password.*reset|forgot.*password/i.test(e)) methods.add("Password reset flow");
  }
  if (methods.size > 0) {
    lines.push(`**Auth methods:** ${[...methods].join(", ")}`);
  }

  if (lines.length === 0) {
    if (samples.some((s) => /login|session|token|auth/i.test(s.excerpt))) {
      return "Auth-related code paths detected in sampled files.";
    }
    return "[NOT FOUND IN CODEBASE]";
  }
  return lines.join("\n\n");
}

function detectDesignSignals(
  samples: Array<{ path: string; excerpt: string }>,
  configFiles: string[],
  dependencyGroups?: Record<string, string[]>
): string {
  const lines: string[] = [];
  const deps = dependencyGroups ? Object.values(dependencyGroups).flat() : [];

  // CSS framework
  if (configFiles.some((f) => /tailwind/i.test(f)) || deps.some((d) => /tailwindcss/i.test(d))) {
    lines.push("**CSS framework:** Tailwind CSS");
  }
  if (deps.some((d) => /framer-motion/i.test(d))) lines.push("**Animation:** Framer Motion");
  if (deps.some((d) => /radix-ui/i.test(d))) lines.push("**Primitives:** Radix UI");
  if (deps.some((d) => /lucide|heroicons|phosphor/i.test(d))) lines.push("**Icons:** Icon library detected");

  // Component patterns
  const uiFiles = samples.filter((s) =>
    /(component|modal|button|panel|layout|toast|form|card|badge|meter)/i.test(s.path)
  );
  if (uiFiles.length > 0) {
    lines.push(`**UI component files (${uiFiles.length}):** ${uiFiles.slice(0, 8).map((s) => `\`${s.path}\``).join(", ")}${uiFiles.length > 8 ? " + more" : ""}`);
  }

  // Design tokens / theme
  const tokenFiles = samples.filter((s) =>
    /(token|theme|design-system|palette|color)/i.test(s.path)
  );
  if (tokenFiles.length > 0) {
    lines.push(`**Design token / theme files:** ${tokenFiles.map((s) => `\`${s.path}\``).join(", ")}`);
  }

  // Storybook
  if (deps.some((d) => /storybook/i.test(d)) || configFiles.some((f) => /storybook/i.test(f))) {
    lines.push("**Component documentation:** Storybook");
  }

  // Dark mode
  if (samples.some((s) => /darkMode|dark.*theme|theme.*dark|class.*dark/i.test(s.excerpt))) {
    lines.push("**Dark mode:** Supported");
  }

  if (lines.length === 0) {
    if (samples.some((s) => /className|style|css/i.test(s.excerpt))) {
      return "UI styling detected in source files but no structured design system found.";
    }
    return "[NOT FOUND IN CODEBASE]";
  }
  return lines.join("\n\n");
}

function detectBillingSignals(
  groups: Record<string, string[]>,
  samples: Array<{ path: string; excerpt: string }>
): string {
  const deps = Object.values(groups).flat().filter((dep) => /(stripe|paypal|billing|paddle)/i.test(dep));
  const lines: string[] = [];

  if (deps.length > 0) {
    lines.push(`**Payment libraries:** ${deps.join(", ")}`);
  }

  const billingFiles = samples.filter((s) =>
    /(billing|checkout|subscription|payment|stripe|pricing|webhook|invoice)/i.test(s.path)
  );
  if (billingFiles.length > 0) {
    lines.push(`**Billing-related files:** ${billingFiles.map((s) => `\`${s.path}\``).join(", ")}`);
  }

  const signals = new Set<string>();
  for (const sample of samples) {
    const e = sample.excerpt;
    if (/checkout.*session|createCheckout/i.test(e)) signals.add("Checkout flow");
    if (/webhook.*event|constructEvent/i.test(e)) signals.add("Webhook handling");
    if (/customer.*portal/i.test(e)) signals.add("Customer portal");
    if (/subscription.*status|cancel.*subscription/i.test(e)) signals.add("Subscription lifecycle");
    if (/idempoten|webhook_events/i.test(e)) signals.add("Idempotent webhook processing");
    if (/tier|plan.*limit|feature.*gate/i.test(e)) signals.add("Tier-based feature gating");
    if (/free|pro|team|enterprise/i.test(e) && /plan|tier|pricing/i.test(e)) signals.add("Multi-tier pricing");
  }
  if (signals.size > 0) {
    lines.push(`**Billing patterns:** ${[...signals].join(", ")}`);
  }

  if (lines.length === 0) {
    if (samples.some((s) => /pricing|subscription|plan/i.test(s.excerpt))) {
      return "Pricing or plan strings detected in sampled files.";
    }
    return "[NOT FOUND IN CODEBASE]";
  }
  return lines.join("\n\n");
}

function formatCommands(commands: RepoSnapshot["commands"]): string {
  const lines = [
    commands.test ? `- Test: \`${commands.test}\`` : "- Test: [NOT FOUND IN CODEBASE]",
    commands.lint ? `- Lint: \`${commands.lint}\`` : "- Lint: [NOT FOUND IN CODEBASE]",
    commands.build ? `- Build: \`${commands.build}\`` : "- Build: [NOT FOUND IN CODEBASE]",
    commands.typecheck ? `- Typecheck: \`${commands.typecheck}\`` : "- Typecheck: [NOT FOUND IN CODEBASE]",
  ];
  return lines.join("\n");
}

