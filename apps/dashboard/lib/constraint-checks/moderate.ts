/**
 * Moderate constraint checks (4 total)
 * Code scanning for architectural patterns
 * Automated with regex/pattern matching
 */

import path from "path";
import fs from "fs";
import type { ConstraintCheck, CheckResult } from "../constraint-types";
import {
  readFile,
  runCommand,
  createPassingResult,
  createFailingResult,
  createFailingResultMultiple,
  registerCheck,
} from "../constraint-validator";

// ============================================================================
// embr-008: All API Routes Prefixed with /v1
// ============================================================================

async function checkApiRoutePrefixes(
  constraint: ConstraintCheck,
  projectPath: string
): Promise<CheckResult> {
  const apiSrcPath = path.join(projectPath, "apps/api/src");

  if (!fs.existsSync(apiSrcPath)) {
    return createFailingResult(constraint.id, {
      violation_type: "not_found",
      severity: "critical",
      current_state: "apps/api/src does not exist",
      expected_state: "NestJS API application must exist",
      remediation: "Create apps/api/src directory",
      project: "unknown",
    });
  }

  // Find main.ts to check global prefix
  const mainPath = path.join(apiSrcPath, "main.ts");
  const mainContent = readFile(mainPath);

  // Check for setGlobalPrefix
  const globalPrefixMatch = mainContent.match(
    /setGlobalPrefix\s*\(\s*['"`]v1['"`]\s*\)/
  );

  if (!globalPrefixMatch) {
    return createFailingResult(constraint.id, {
      violation_type: "missing",
      severity: "critical",
      current_state:
        "setGlobalPrefix not configured in main.ts",
      expected_state:
        "main.ts must call: app.setGlobalPrefix('v1')",
      remediation:
        "Add app.setGlobalPrefix('v1') in main.ts before starting server",
      project: "unknown",
      location: {
        file: "apps/api/src/main.ts",
        line: 1,
        context: "Add: app.setGlobalPrefix('v1');",
      },
    });
  }

  // Find all route decorators
  const violations = [];

  // Scan for routes without /v1 (if not using global prefix correctly)
  // Check for any hardcoded routes that override the global prefix
  const hardcodedRoutes = mainContent.match(
    /app\.use\s*\(\s*['"`]\/(?!v1)/g
  );
  if (hardcodedRoutes && hardcodedRoutes.length > 0) {
    violations.push({
      violation_type: "incorrect_value" as const,
      severity: "critical" as const,
      current_state: `Found ${hardcodedRoutes.length} route(s) without /v1 prefix`,
      expected_state: "All routes must use /v1 prefix or rely on global prefix",
      remediation:
        "Remove hardcoded routes that bypass global /v1 prefix",
      project: "unknown",
      location: {
        file: "apps/api/src/main.ts",
        context: "Check app.use() calls",
      },
    });
  }

  // Count decorated controllers to validate prefix is applied
  const controllerDecorators = mainContent.match(
    /@Controller\s*\(\s*['"`]/g
  );
  if (controllerDecorators && controllerDecorators.length > 0) {
    // If using global prefix, controllers shouldn't redefine it
    const controllerPaths = mainContent.match(
      /@Controller\s*\(\s*['"`](?!v1)[^'"`]*['"`]\s*\)/g
    );
    if (controllerPaths && controllerPaths.length > 0) {
      violations.push({
        violation_type: "incorrect_value" as const,
        severity: "critical" as const,
        current_state: `Found ${controllerPaths.length} controller(s) with conflicting paths`,
        expected_state:
          "Controllers should not redefine /v1 prefix if global prefix is set",
        remediation:
          "Remove path from @Controller() or align with /v1 global prefix",
        project: "unknown",
      });
    }
  }

  return violations.length === 0
    ? createPassingResult(constraint.id)
    : createFailingResultMultiple(constraint.id, violations);
}

registerCheck("embr-008", checkApiRoutePrefixes);

// ============================================================================
// embr-009: JwtAuthGuard on All Protected Routes
// ============================================================================

async function checkJwtAuthGuard(
  constraint: ConstraintCheck,
  projectPath: string
): Promise<CheckResult> {
  const apiSrcPath = path.join(projectPath, "apps/api/src");

  if (!fs.existsSync(apiSrcPath)) {
    return createFailingResult(constraint.id, {
      violation_type: "not_found",
      severity: "critical",
      current_state: "apps/api/src does not exist",
      expected_state: "NestJS API application must exist",
      remediation: "Create apps/api/src directory",
      project: "unknown",
    });
  }

  // Scan for guard usage
  const cmd = `find ${apiSrcPath} -name "*.ts" ! -path "*/node_modules/*" ! -path "*/.spec.ts" -type f -exec grep -l "JwtAuthGuard\\|@UseGuards" {} \\;`;

  const result = runCommand(cmd, projectPath);
  const filesWithGuards = result.stdout
    .split("\n")
    .filter((line) => line.trim());

  if (filesWithGuards.length === 0) {
    return createFailingResult(constraint.id, {
      violation_type: "not_found",
      severity: "critical",
      current_state: "No JwtAuthGuard usage found in codebase",
      expected_state:
        "JwtAuthGuard must be applied to protected routes",
      remediation:
        "Add @UseGuards(JwtAuthGuard) to protected route handlers",
      project: "unknown",
    });
  }

  // Count protected routes (those with @UseGuards or marked @Public)
  const protectedCountCmd = `find ${apiSrcPath} -name "*.controller.ts" ! -path "*/node_modules/*" -type f -exec grep -l "@UseGuards\\|@Public" {} \\; | wc -l`;
  const protectedResult = runCommand(protectedCountCmd, projectPath);
  const protectedControllers = parseInt(
    protectedResult.stdout.trim()
  );

  // Find potential unprotected routes
  const unprotectedCmd = `find ${apiSrcPath} -name "*.ts" ! -path "*/node_modules/*" ! -path "*/.spec.ts" -type f -exec grep -l "@Post\\|@Get\\|@Put\\|@Delete\\|@Patch" {} \\; | wc -l`;
  const allRoutesResult = runCommand(unprotectedCmd, projectPath);
  const totalRoutes = parseInt(allRoutesResult.stdout.trim());

  // Warning if fewer protected controllers than total
  if (protectedControllers < totalRoutes) {
    return createFailingResult(constraint.id, {
      violation_type: "missing",
      severity: "critical",
      current_state: `${protectedControllers}/${totalRoutes} controllers have guard/public decorators`,
      expected_state:
        "All controllers must have @UseGuards or @Public decorator",
      remediation:
        "Add @UseGuards(JwtAuthGuard) to protected controllers or @Public to public endpoints",
      project: "unknown",
      details: {
        protected_controllers: protectedControllers,
        total_controllers: totalRoutes,
      },
    });
  }

  return createPassingResult(constraint.id);
}

registerCheck("embr-009", checkJwtAuthGuard);

// ============================================================================
// embr-010: ThrottlerGuard Rate Limiting Active
// ============================================================================

async function checkThrottlerGuard(
  constraint: ConstraintCheck,
  projectPath: string
): Promise<CheckResult> {
  const apiSrcPath = path.join(projectPath, "apps/api/src");

  if (!fs.existsSync(apiSrcPath)) {
    return createFailingResult(constraint.id, {
      violation_type: "not_found",
      severity: "critical",
      current_state: "apps/api/src does not exist",
      expected_state: "NestJS API application must exist",
      remediation: "Create apps/api/src directory",
      project: "unknown",
    });
  }

  // Check if ThrottlerModule is imported
  const throttlerModuleCmd = `find ${apiSrcPath} -name "*.module.ts" ! -path "*/node_modules/*" -type f -exec grep -l "ThrottlerModule" {} \\;`;
  const throttlerResult = runCommand(throttlerModuleCmd, projectPath);
  const hasThrottlerModule = throttlerResult.stdout.trim().length > 0;

  if (!hasThrottlerModule) {
    return createFailingResult(constraint.id, {
      violation_type: "missing",
      severity: "critical",
      current_state: "ThrottlerModule not imported in any module",
      expected_state:
        "ThrottlerModule must be configured in app.module.ts",
      remediation:
        "Import and configure ThrottlerModule in root module. Example: ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])",
      project: "unknown",
    });
  }

  // Check if ThrottlerGuard is being used
  const throttlerGuardCmd = `find ${apiSrcPath} -name "*.ts" ! -path "*/node_modules/*" ! -path "*/.spec.ts" -type f -exec grep -l "@UseGuards.*Throttler\\|ThrottlerGuard" {} \\;`;
  const guardResult = runCommand(throttlerGuardCmd, projectPath);
  const hasThrottlerGuard = guardResult.stdout.trim().length > 0;

  if (!hasThrottlerGuard) {
    return createFailingResult(constraint.id, {
      violation_type: "missing",
      severity: "critical",
      current_state: "ThrottlerGuard not applied to any routes",
      expected_state:
        "ThrottlerGuard must be applied globally or to API routes",
      remediation:
        "Apply ThrottlerGuard globally in main.ts or add @UseGuards(ThrottlerGuard) to API controllers",
      project: "unknown",
    });
  }

  return createPassingResult(constraint.id);
}

registerCheck("embr-010", checkThrottlerGuard);

// ============================================================================
// embr-011: Mux for Video Processing (Not Local)
// ============================================================================

async function checkMuxVideo(
  constraint: ConstraintCheck,
  projectPath: string
): Promise<CheckResult> {
  const packagePath = path.join(projectPath, "apps/api/package.json");
  const apiSrcPath = path.join(projectPath, "apps/api/src");

  // Check package.json for Mux SDK
  const pkg = JSON.parse(
    readFile(packagePath) || "{}"
  ) as Record<string, unknown>;
  const hasMux =
    (pkg.dependencies as Record<string, string> | undefined)?.[
      "@mux/mux-node"
    ] || (pkg.devDependencies as Record<string, string> | undefined)?.[
      "@mux/mux-node"
    ];

  const violations = [];

  if (!hasMux) {
    violations.push({
      violation_type: "missing" as const,
      severity: "critical" as const,
      current_state: "Mux SDK (@mux/mux-node) not in dependencies",
      expected_state:
        "@mux/mux-node must be in dependencies for video processing",
      remediation:
        "Add Mux SDK: npm install @mux/mux-node",
      project: "unknown",
    });
  }

  // Check for local video processing tools
  const ffmpegCmd = `find ${apiSrcPath} -name "*.ts" ! -path "*/node_modules/*" -type f -exec grep -l "ffmpeg\\|avconv\\|fluent-ffmpeg" {} \\;`;
  const ffmpegResult = runCommand(ffmpegCmd, projectPath);
  if (ffmpegResult.stdout.trim().length > 0) {
    violations.push({
      violation_type: "policy_violation" as const,
      severity: "critical" as const,
      current_state:
        "Found local video processing tools (FFmpeg, avconv)",
      expected_state:
        "Video processing must be delegated to Mux API",
      remediation:
        "Remove FFmpeg/local processing; use Mux API for all video operations",
      project: "unknown",
    });
  }

  // Check for Mux usage if it's installed
  if (hasMux && violations.length === 0) {
    const muxUsageCmd = `find ${apiSrcPath} -name "*.ts" ! -path "*/node_modules/*" -type f -exec grep -l "new Mux\\|mux\\.video\\|createAsset" {} \\;`;
    const usageResult = runCommand(muxUsageCmd, projectPath);
    if (usageResult.stdout.trim().length === 0) {
      violations.push({
        violation_type: "missing" as const,
        severity: "critical" as const,
        current_state: "Mux SDK installed but not used",
        expected_state: "Mux API must be called for video operations",
        remediation:
          "Implement video upload flow using Mux API (mux.video.assets.create())",
        project: "unknown",
      });
    }
  }

  return violations.length === 0
    ? createPassingResult(constraint.id)
    : createFailingResultMultiple(constraint.id, violations);
}

registerCheck("embr-011", checkMuxVideo);

// ============================================================================
// Export checkers
// ============================================================================

export const MODERATE_CHECKERS = {
  "embr-008": checkApiRoutePrefixes,
  "embr-009": checkJwtAuthGuard,
  "embr-010": checkThrottlerGuard,
  "embr-011": checkMuxVideo,
};

export async function runModerateChecks(
  projectPath: string
): Promise<CheckResult[]> {
  return Promise.all([
    checkApiRoutePrefixes(
      { id: "embr-008" } as ConstraintCheck,
      projectPath
    ),
    checkJwtAuthGuard(
      { id: "embr-009" } as ConstraintCheck,
      projectPath
    ),
    checkThrottlerGuard(
      { id: "embr-010" } as ConstraintCheck,
      projectPath
    ),
    checkMuxVideo(
      { id: "embr-011" } as ConstraintCheck,
      projectPath
    ),
  ]);
}
