/**
 * Easy constraint checks (7 total)
 * Dependency and configuration verification
 * All can be fully automated
 */

import path from "path";
import type { ConstraintCheck, CheckResult } from "../constraint-types";
import {
  readJSON,
  runCommand,
  fileExists,
  readFile,
  createPassingResult,
  createFailingResult,
  createFailingResultMultiple,
  registerCheck,
} from "../constraint-validator";

// ============================================================================
// embr-001: Turborepo Monorepo Structure
// ============================================================================

async function checkTurborepoStructure(
  constraint: ConstraintCheck,
  projectPath: string
): Promise<CheckResult> {
  const violations = [];

  // Check required app directories
  const requiredApps = ["api", "web", "mobile"];
  for (const app of requiredApps) {
    const appPath = path.join(projectPath, "apps", app);
    if (!fileExists(appPath)) {
      violations.push({
        violation_type: "missing" as const,
        severity: "warning" as const,
        current_state: `apps/${app} does not exist`,
        expected_state: `apps/${app} directory must exist`,
        remediation: `Create apps/${app} directory in monorepo`,
        project: "unknown",
      });
    }
  }

  // Check turbo.json
  const turboPath = path.join(projectPath, "turbo.json");
  if (!fileExists(turboPath)) {
    violations.push({
      violation_type: "missing" as const,
      severity: "warning" as const,
      current_state: "turbo.json does not exist",
      expected_state: "turbo.json must exist in project root",
      remediation: "Create turbo.json with monorepo configuration",
      project: "unknown",
    });
  } else {
    // Validate turbo.json is valid JSON
    const turbo = readJSON<Record<string, unknown> | null>(turboPath, null);
    if (turbo === null) {
      violations.push({
        violation_type: "incorrect_value" as const,
        severity: "warning" as const,
        current_state: "turbo.json is invalid JSON",
        expected_state: "turbo.json must be valid JSON",
        remediation: "Fix JSON syntax in turbo.json",
        project: "unknown",
      });
    }
  }

  // Check workspaces in root package.json
  const packagePath = path.join(projectPath, "package.json");
  const pkg = readJSON<Record<string, unknown>>(packagePath, {});
  if (!pkg.workspaces) {
    violations.push({
      violation_type: "missing" as const,
      severity: "warning" as const,
      current_state: "package.json missing workspaces field",
      expected_state:
        'package.json must define "workspaces" for monorepo',
      remediation:
        'Add workspaces field to root package.json pointing to apps/ and packages/',
      project: "unknown",
    });
  }

  return violations.length === 0
    ? createPassingResult(constraint.id)
    : createFailingResultMultiple(constraint.id, violations);
}

registerCheck("embr-001", checkTurborepoStructure);

// ============================================================================
// embr-002: TypeScript Strict Mode
// ============================================================================

async function checkTypescriptStrict(
  constraint: ConstraintCheck,
  projectPath: string
): Promise<CheckResult> {
  const tsconfigPath = path.join(projectPath, "apps/api/tsconfig.json");

  const tsconfig = readJSON<{
    compilerOptions?: Record<string, unknown>;
  }>(tsconfigPath, {});

  const strict = tsconfig.compilerOptions?.strict;
  if (strict !== true) {
    return createFailingResult(constraint.id, {
      violation_type: "incorrect_value",
      severity: "critical",
      current_state: `"strict": ${strict === undefined ? "(missing)" : strict}`,
      expected_state: '"strict": true',
      remediation: 'Set "strict": true in apps/api/tsconfig.json',
      project: "unknown",
    });
  }

  return createPassingResult(constraint.id);
}

registerCheck("embr-002", checkTypescriptStrict);

// ============================================================================
// embr-003: Prisma 5 + PostgreSQL
// ============================================================================

async function checkPrismaVersion(
  constraint: ConstraintCheck,
  projectPath: string
): Promise<CheckResult> {
  const packagePath = path.join(projectPath, "apps/api/package.json");
  const pkg = readJSON<{
    dependencies?: Record<string, string>;
  }>(packagePath, {});

  const violations = [];

  // Check @prisma/client version
  const prismaVersion = pkg.dependencies?.["@prisma/client"];
  if (!prismaVersion) {
    violations.push({
      violation_type: "missing" as const,
      severity: "critical" as const,
      current_state: "@prisma/client not in dependencies",
      expected_state:
        '@prisma/client: "^5.x" in dependencies',
      remediation:
        "Add @prisma/client to dependencies: npm install @prisma/client@5",
      project: "unknown",
    });
  } else if (!prismaVersion.includes("5.")) {
    violations.push({
      violation_type: "incorrect_value" as const,
      severity: "critical" as const,
      current_state: `@prisma/client: "${prismaVersion}"`,
      expected_state: '@prisma/client: "^5.x"',
      remediation:
        "Update prisma to version 5: npm install @prisma/client@5",
      project: "unknown",
    });
  }

  return violations.length === 0
    ? createPassingResult(constraint.id)
    : createFailingResultMultiple(constraint.id, violations);
}

registerCheck("embr-003", checkPrismaVersion);

// ============================================================================
// embr-004: Redis 7
// ============================================================================

async function checkRedisVersion(
  constraint: ConstraintCheck,
  projectPath: string
): Promise<CheckResult> {
  const packagePath = path.join(projectPath, "apps/api/package.json");
  const pkg = readJSON<{
    dependencies?: Record<string, string>;
  }>(packagePath, {});

  const redisVersion = pkg.dependencies?.redis;
  if (!redisVersion) {
    return createFailingResult(constraint.id, {
      violation_type: "missing",
      severity: "warning",
      current_state: "redis not in dependencies",
      expected_state: 'redis: ">=7.0.0" in dependencies',
      remediation: "Add redis to dependencies: npm install redis@7",
      project: "unknown",
    });
  }

  // Check version is 7+
  if (!redisVersion.includes("7.") && !redisVersion.startsWith(">=7")) {
    return createFailingResult(constraint.id, {
      violation_type: "incorrect_value",
      severity: "warning",
      current_state: `redis: "${redisVersion}"`,
      expected_state: 'redis: ">=7.0.0"',
      remediation: "Update redis to version 7: npm install redis@7",
      project: "unknown",
    });
  }

  return createPassingResult(constraint.id);
}

registerCheck("embr-004", checkRedisVersion);

// ============================================================================
// embr-005: Socket.io
// ============================================================================

async function checkSocketio(
  constraint: ConstraintCheck,
  projectPath: string
): Promise<CheckResult> {
  const packagePath = path.join(projectPath, "apps/api/package.json");
  const pkg = readJSON<{
    dependencies?: Record<string, string>;
  }>(packagePath, {});

  const socketioVersion = pkg.dependencies?.["socket.io"];
  if (!socketioVersion) {
    return createFailingResult(constraint.id, {
      violation_type: "missing",
      severity: "warning",
      current_state: "socket.io not in dependencies",
      expected_state: 'socket.io in dependencies',
      remediation:
        "Add socket.io to dependencies: npm install socket.io",
      project: "unknown",
    });
  }

  return createPassingResult(constraint.id);
}

registerCheck("embr-005", checkSocketio);

// ============================================================================
// embr-006: ts-jest Configuration
// ============================================================================

async function checkTsJest(
  constraint: ConstraintCheck,
  projectPath: string
): Promise<CheckResult> {
  const packagePath = path.join(projectPath, "apps/api/package.json");
  const pkg = readJSON<{
    devDependencies?: Record<string, string>;
  }>(packagePath, {});

  const violations = [];

  // Check ts-jest in devDependencies
  const tsJestVersion = pkg.devDependencies?.["ts-jest"];
  if (!tsJestVersion) {
    violations.push({
      violation_type: "missing" as const,
      severity: "critical" as const,
      current_state: "ts-jest not in devDependencies",
      expected_state: 'ts-jest in devDependencies',
      remediation:
        "Add ts-jest: npm install --save-dev ts-jest",
      project: "unknown",
    });
  }

  // Check jest config exists
  const jestConfigPath = path.join(
    projectPath,
    "apps/api/jest.config.ts"
  );
  if (!fileExists(jestConfigPath)) {
    violations.push({
      violation_type: "missing" as const,
      severity: "critical" as const,
      current_state: "jest.config.ts does not exist",
      expected_state: "jest.config.ts must exist in apps/api",
      remediation:
        "Create apps/api/jest.config.ts with ts-jest preset",
      project: "unknown",
    });
  } else {
    const jestConfig = readFile(jestConfigPath);
    if (!jestConfig.includes("ts-jest")) {
      violations.push({
        violation_type: "incorrect_value" as const,
        severity: "critical" as const,
        current_state:
          "jest.config.ts does not reference ts-jest",
        expected_state:
          'jest.config.ts must have preset: "ts-jest"',
        remediation:
          "Update jest.config.ts: preset: 'ts-jest'",
        project: "unknown",
      });
    }
  }

  return violations.length === 0
    ? createPassingResult(constraint.id)
    : createFailingResultMultiple(constraint.id, violations);
}

registerCheck("embr-006", checkTsJest);

// ============================================================================
// embr-007: AWS SES Email
// ============================================================================

async function checkAwsSes(
  constraint: ConstraintCheck,
  projectPath: string
): Promise<CheckResult> {
  const packagePath = path.join(projectPath, "apps/api/package.json");
  const pkg = readJSON<{
    dependencies?: Record<string, string>;
  }>(packagePath, {});

  const sesVersion = pkg.dependencies?.["@aws-sdk/client-ses"];
  if (!sesVersion) {
    return createFailingResult(constraint.id, {
      violation_type: "missing",
      severity: "warning",
      current_state: "SES SDK not in dependencies",
      expected_state:
        '@aws-sdk/client-ses in dependencies',
      remediation:
        "Add SES SDK: npm install @aws-sdk/client-ses",
      project: "unknown",
    });
  }

  return createPassingResult(constraint.id);
}

registerCheck("embr-007", checkAwsSes);

// ============================================================================
// Export checkers
// ============================================================================

export const EASY_CHECKERS = {
  "embr-001": checkTurborepoStructure,
  "embr-002": checkTypescriptStrict,
  "embr-003": checkPrismaVersion,
  "embr-004": checkRedisVersion,
  "embr-005": checkSocketio,
  "embr-006": checkTsJest,
  "embr-007": checkAwsSes,
};

export async function runEasyChecks(
  projectPath: string
): Promise<CheckResult[]> {
  return Promise.all([
    checkTurborepoStructure(
      { id: "embr-001" } as ConstraintCheck,
      projectPath
    ),
    checkTypescriptStrict(
      { id: "embr-002" } as ConstraintCheck,
      projectPath
    ),
    checkPrismaVersion(
      { id: "embr-003" } as ConstraintCheck,
      projectPath
    ),
    checkRedisVersion(
      { id: "embr-004" } as ConstraintCheck,
      projectPath
    ),
    checkSocketio({ id: "embr-005" } as ConstraintCheck, projectPath),
    checkTsJest({ id: "embr-006" } as ConstraintCheck, projectPath),
    checkAwsSes({ id: "embr-007" } as ConstraintCheck, projectPath),
  ]);
}
