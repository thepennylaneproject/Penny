/**
 * Complex constraint checks (6 total)
 * Business logic, flow tracing, policy enforcement
 * Mix of automated and manual review
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
// embr-012: Creator Revenue Split 85-90%
// ============================================================================

async function checkRevenueConstraint(
  constraint: ConstraintCheck,
  projectPath: string
): Promise<CheckResult> {
  const monetizationPath = path.join(
    projectPath,
    "apps/api/src/core/monetization"
  );

  if (!fs.existsSync(monetizationPath)) {
    return createFailingResult(constraint.id, {
      violation_type: "not_found",
      severity: "critical",
      current_state: "Monetization service not found",
      expected_state:
        "apps/api/src/core/monetization must exist",
      remediation:
        "Create monetization service with revenue split logic",
      project: "unknown",
    });
  }

  // Search for revenue split patterns
  const splitSearchCmd = `find ${monetizationPath} -name "*.ts" ! -path "*/node_modules/*" -type f -exec grep -n "0\\.85\\|0\\.90\\|0\\.9\\|creatorShare\\|platformShare\\|revenue.*split" {} + | head -20`;
  const splitResult = runCommand(splitSearchCmd, projectPath);

  if (splitResult.stdout.trim().length === 0) {
    return createFailingResult(constraint.id, {
      violation_type: "not_found",
      severity: "critical",
      current_state:
        "No revenue split calculation found in monetization service",
      expected_state:
        "Revenue split logic must exist with 85-90% creator share",
      remediation:
        "Implement revenue split calculation: const creatorShare = amount * 0.85 (minimum)",
      project: "unknown",
      location: {
        file: "apps/api/src/core/monetization",
        context: "Add revenue split calculation",
      },
    });
  }

  // Check for invalid percentages (< 85%)
  const invalidSplitCmd = `find ${monetizationPath} -name "*.ts" ! -path "*/node_modules/*" -type f -exec grep -n "0\\.[0-7][0-9]\\|0\\.8[0-4]" {} + | grep -v "0\\.85\\|0\\.86\\|0\\.87\\|0\\.88\\|0\\.89\\|0\\.90"`;
  const invalidResult = runCommand(invalidSplitCmd, projectPath);

  if (invalidResult.stdout.trim().length > 0) {
    return createFailingResult(constraint.id, {
      violation_type: "incorrect_value",
      severity: "critical",
      current_state:
        "Found revenue split < 85% or > 90%",
      expected_state: "Revenue split must be 85-90%",
      remediation:
        "Update split calculation to enforce 0.85 <= split <= 0.90",
      project: "unknown",
      details: {
        violations: invalidResult.stdout.split("\n").slice(0, 5),
      },
    });
  }

  // Verify stripe webhook handling
  const webhookPath = path.join(
    monetizationPath,
    "webhooks/stripe-webhook.controller.ts"
  );
  if (!fs.existsSync(webhookPath)) {
    return createFailingResult(constraint.id, {
      violation_type: "not_found",
      severity: "critical",
      current_state: "Stripe webhook handler not found",
      expected_state:
        "Stripe webhook must handle revenue split",
      remediation:
        "Create stripe-webhook.controller.ts with payout calculation",
      project: "unknown",
    });
  }

  return createPassingResult(constraint.id);
}

registerCheck("embr-012", checkRevenueConstraint);

// ============================================================================
// embr-013: Wallet Verification BEFORE Payouts
// ============================================================================

async function checkWalletVerification(
  constraint: ConstraintCheck,
  projectPath: string
): Promise<CheckResult> {
  const monetizationPath = path.join(
    projectPath,
    "apps/api/src/core/monetization"
  );

  if (!fs.existsSync(monetizationPath)) {
    return createFailingResult(constraint.id, {
      violation_type: "not_found",
      severity: "critical",
      current_state: "Monetization service not found",
      expected_state:
        "Monetization service must implement payout flow",
      remediation: "Create monetization service",
      project: "unknown",
    });
  }

  // Find payout service
  const payoutPath = path.join(
    monetizationPath,
    "services/payout.service.ts"
  );
  if (!fs.existsSync(payoutPath)) {
    return createFailingResult(constraint.id, {
      violation_type: "not_found",
      severity: "critical",
      current_state: "payout.service.ts not found",
      expected_state:
        "Must have dedicated payout service with verify() call",
      remediation:
        "Create apps/api/src/core/monetization/services/payout.service.ts",
      project: "unknown",
    });
  }

  const payoutContent = readFile(payoutPath);

  // Check for verify function call
  const hasVerifyCall =
    payoutContent.includes("verify") ||
    payoutContent.includes("verifyIntegrity") ||
    payoutContent.includes("verify-integrity");

  if (!hasVerifyCall) {
    return createFailingResult(constraint.id, {
      violation_type: "missing",
      severity: "critical",
      current_state: "Payout service does not call verify()",
      expected_state:
        "Payout flow MUST call wallet verification first",
      remediation:
        "Add: await this.walletService.verifyIntegrity(walletId) at start of payout method",
      project: "unknown",
      location: {
        file: "apps/api/src/core/monetization/services/payout.service.ts",
        context: "Add verification step before processing payout",
      },
    });
  }

  // Check ordering (verify should come before payout)
  const verifyIndex = payoutContent.indexOf("verifyIntegrity");
  const payoutIndex = payoutContent.indexOf("sendPayout");

  if (
    verifyIndex !== -1 &&
    payoutIndex !== -1 &&
    verifyIndex > payoutIndex
  ) {
    return createFailingResult(constraint.id, {
      violation_type: "ordering_violation",
      severity: "critical",
      current_state:
        "Payout is executed BEFORE wallet verification",
      expected_state:
        "Wallet verification MUST happen FIRST",
      remediation:
        "Move verifyIntegrity() call before sendPayout() in payout method",
      project: "unknown",
    });
  }

  return createPassingResult(constraint.id);
}

registerCheck("embr-013", checkWalletVerification);

// ============================================================================
// embr-014: S3 Presigned URLs for Uploads
// ============================================================================

async function checkS3Presigned(
  constraint: ConstraintCheck,
  projectPath: string
): Promise<CheckResult> {
  const uploadPath = path.join(projectPath, "apps/api/src/core/upload");

  if (!fs.existsSync(uploadPath)) {
    return createFailingResult(constraint.id, {
      violation_type: "not_found",
      severity: "critical",
      current_state: "Upload service not found",
      expected_state: "Upload service must use S3 presigned URLs",
      remediation:
        "Create apps/api/src/core/upload with S3 presigned URL logic",
      project: "unknown",
    });
  }

  // Search for presigned URL usage
  const presignedCmd = `find ${uploadPath} -name "*.ts" ! -path "*/node_modules/*" -type f -exec grep -l "getSignedUrl\\|presigned\\|presignUrl" {} \\;`;
  const presignedResult = runCommand(presignedCmd, projectPath);

  if (presignedResult.stdout.trim().length === 0) {
    return createFailingResult(constraint.id, {
      violation_type: "missing",
      severity: "critical",
      current_state:
        "No presigned URL generation found",
      expected_state:
        "Upload flow must generate S3 presigned URLs for clients",
      remediation:
        "Implement: const url = await s3Client.getSignedUrl('putObject', params)",
      project: "unknown",
    });
  }

  // Check for direct file handling (BAD)
  const directFileCmd = `find ${uploadPath} -name "*.ts" ! -path "*/node_modules/*" -type f -exec grep -l "fs\\.writeFile\\|stream\\.pipe\\|receive.*file" {} \\;`;
  const directResult = runCommand(directFileCmd, projectPath);

  if (directResult.stdout.trim().length > 0) {
    return createFailingResult(constraint.id, {
      violation_type: "policy_violation",
      severity: "critical",
      current_state:
        "Found direct file handling (fs.writeFile or stream.pipe)",
      expected_state:
        "Server must not receive file uploads directly; use S3 presigned URLs",
      remediation:
        "Remove direct file handling; client uploads directly to S3 using presigned URL",
      project: "unknown",
    });
  }

  return createPassingResult(constraint.id);
}

registerCheck("embr-014", checkS3Presigned);

// ============================================================================
// embr-015: Moderation Pipeline for Flagged Content
// ============================================================================

async function checkModerationPipeline(
  constraint: ConstraintCheck,
  projectPath: string
): Promise<CheckResult> {
  const corePath = path.join(projectPath, "apps/api/src/core");

  if (!fs.existsSync(corePath)) {
    return createFailingResult(constraint.id, {
      violation_type: "not_found",
      severity: "critical",
      current_state: "Core services not found",
      expected_state: "Must have moderation pipeline",
      remediation:
        "Create moderation service in apps/api/src/core/moderation",
      project: "unknown",
    });
  }

  // Find report/flag endpoints
  const flagCmd = `find ${corePath} -name "*.controller.ts" ! -path "*/node_modules/*" -type f -exec grep -l "flag\\|report\\|Report" {} \\;`;
  const flagResult = runCommand(flagCmd, projectPath);

  if (flagResult.stdout.trim().length === 0) {
    return createFailingResult(constraint.id, {
      violation_type: "not_found",
      severity: "critical",
      current_state: "No flag/report endpoints found",
      expected_state:
        "Must have endpoints for content flagging",
      remediation:
        "Create report/flag endpoints in content controller",
      project: "unknown",
    });
  }

  // Find moderation service
  const moderationCmd = `find ${corePath} -name "*.ts" ! -path "*/node_modules/*" -type f -exec grep -l "ModerationAction\\|moderation.*trigger\\|invoke.*moderation" {} \\;`;
  const moderationResult = runCommand(moderationCmd, projectPath);

  if (moderationResult.stdout.trim().length === 0) {
    return createFailingResult(constraint.id, {
      violation_type: "missing",
      severity: "critical",
      current_state:
        "Moderation pipeline not invoked from flag endpoints",
      expected_state:
        "Every flag MUST trigger moderation action",
      remediation:
        "Call moderation service from flag handler: await this.moderationService.triggerAction()",
      project: "unknown",
    });
  }

  // Check for bypass paths
  const bypassCmd = `find ${corePath} -name "*.ts" ! -path "*/node_modules/*" -type f -exec grep -n "DELETE.*Report\\|skip.*moderation\\|bypass.*moderation" {} + | grep -v "//"`;
  const bypassResult = runCommand(bypassCmd, projectPath);

  if (bypassResult.stdout.trim().length > 0) {
    return createFailingResult(constraint.id, {
      violation_type: "policy_violation",
      severity: "critical",
      current_state:
        "Found bypass paths that skip moderation",
      expected_state:
        "No bypass paths for moderation allowed",
      remediation:
        "Remove code that allows deletion or bypassing moderation",
      project: "unknown",
    });
  }

  return createPassingResult(constraint.id);
}

registerCheck("embr-015", checkModerationPipeline);

// ============================================================================
// embr-016: 666+ TypeScript Errors Production Blocker
// ============================================================================

async function checkTypescriptErrors(
  constraint: ConstraintCheck,
  projectPath: string
): Promise<CheckResult> {
  const apiSrcPath = path.join(projectPath, "apps/api/src");

  if (!fs.existsSync(apiSrcPath)) {
    return createFailingResult(constraint.id, {
      violation_type: "not_found",
      severity: "critical",
      current_state: "apps/api/src not found",
      expected_state: "TypeScript errors must be tracked",
      remediation: "Create API source directory",
      project: "unknown",
    });
  }

  // Count @ts-ignore directives
  const countCmd = `find ${apiSrcPath} -name "*.ts" ! -path "*/node_modules/*" -type f -exec grep -c "@ts-ignore\\|@ts-nocheck" {} + | awk '{s+=$1} END {print s}'`;
  const countResult = runCommand(countCmd, projectPath);
  const errorCount = parseInt(countResult.stdout.trim() || "0");

  if (errorCount === 0) {
    return createPassingResult(constraint.id);
  }

  // Check if count is within acceptable range (666+)
  if (errorCount > 666) {
    return createFailingResult(constraint.id, {
      violation_type: "incorrect_value",
      severity: "critical",
      current_state: `@ts-ignore count: ${errorCount}`,
      expected_state: "Cannot exceed 666 TypeScript error suppressions",
      remediation:
        "Fix TypeScript errors to reduce @ts-ignore count below 666. This is a production blocker.",
      project: "unknown",
      details: {
        current_count: errorCount,
        limit: 666,
        excess: errorCount - 666,
      },
    });
  }

  // Warn if over 600
  if (errorCount > 600) {
    return createFailingResult(constraint.id, {
      violation_type: "policy_violation",
      severity: "critical",
      current_state: `@ts-ignore count: ${errorCount} (very close to limit)`,
      expected_state: "Actively reduce TypeScript errors",
      remediation:
        "Priority: Resolve TypeScript errors to get below 600. Set as production blocker once CI gate is configured.",
      project: "unknown",
      details: {
        current_count: errorCount,
        limit: 666,
        recommended_action: "critical",
      },
    });
  }

  return createPassingResult(constraint.id);
}

registerCheck("embr-016", checkTypescriptErrors);

// ============================================================================
// embr-017: Music Phase-2 Not Exposed in Production
// ============================================================================

async function checkMusicPhase2(
  constraint: ConstraintCheck,
  projectPath: string
): Promise<CheckResult> {
  const webSrcPath = path.join(projectPath, "apps/web/src");

  if (!fs.existsSync(webSrcPath)) {
    return createFailingResult(constraint.id, {
      violation_type: "not_found",
      severity: "critical",
      current_state: "apps/web/src not found",
      expected_state: "Web application must exist",
      remediation: "Create apps/web/src directory",
      project: "unknown",
    });
  }

  // Search for Music phase 2 components
  const musicCmd = `find ${webSrcPath} -name "*.tsx" -o -name "*.ts" ! -path "*/node_modules/*" -type f -exec grep -l "Music.*phase.*2\\|Music.*v2\\|MUSIC_PHASE2" {} \\;`;
  const musicResult = runCommand(musicCmd, projectPath);

  if (musicResult.stdout.trim().length === 0) {
    return createPassingResult(constraint.id);
  }

  // Check for feature flag
  const flagCmd = `grep -r "NEXT_PUBLIC_MUSIC\\|MUSIC_PHASE2\\|musicPhase2" ${projectPath}/.env* 2>/dev/null || echo ""`;
  const flagResult = runCommand(flagCmd, projectPath);

  if (flagResult.stdout.trim().length === 0) {
    return createFailingResult(constraint.id, {
      violation_type: "missing",
      severity: "critical",
      current_state:
        "Music phase-2 components exist but no feature flag",
      expected_state:
        "Feature flag required: NEXT_PUBLIC_MUSIC_PHASE2_ENABLED=false",
      remediation:
        "Add to .env.production: NEXT_PUBLIC_MUSIC_PHASE2_ENABLED=false",
      project: "unknown",
    });
  }

  // Check that flag is false in production
  const prodEnvPath = path.join(projectPath, ".env.production");
  const prodEnv = readFile(prodEnvPath);
  if (
    prodEnv.includes("NEXT_PUBLIC_MUSIC_PHASE2_ENABLED=true")
  ) {
    return createFailingResult(constraint.id, {
      violation_type: "policy_violation",
      severity: "critical",
      current_state:
        "NEXT_PUBLIC_MUSIC_PHASE2_ENABLED=true in production",
      expected_state:
        "Feature must be gated: NEXT_PUBLIC_MUSIC_PHASE2_ENABLED=false",
      remediation:
        "Update .env.production: NEXT_PUBLIC_MUSIC_PHASE2_ENABLED=false",
      project: "unknown",
    });
  }

  return createPassingResult(constraint.id);
}

registerCheck("embr-017", checkMusicPhase2);

// ============================================================================
// Export checkers
// ============================================================================

export const COMPLEX_CHECKERS = {
  "embr-012": checkRevenueConstraint,
  "embr-013": checkWalletVerification,
  "embr-014": checkS3Presigned,
  "embr-015": checkModerationPipeline,
  "embr-016": checkTypescriptErrors,
  "embr-017": checkMusicPhase2,
};

export async function runComplexChecks(
  projectPath: string
): Promise<CheckResult[]> {
  return Promise.all([
    checkRevenueConstraint(
      { id: "embr-012" } as ConstraintCheck,
      projectPath
    ),
    checkWalletVerification(
      { id: "embr-013" } as ConstraintCheck,
      projectPath
    ),
    checkS3Presigned(
      { id: "embr-014" } as ConstraintCheck,
      projectPath
    ),
    checkModerationPipeline(
      { id: "embr-015" } as ConstraintCheck,
      projectPath
    ),
    checkTypescriptErrors(
      { id: "embr-016" } as ConstraintCheck,
      projectPath
    ),
    checkMusicPhase2(
      { id: "embr-017" } as ConstraintCheck,
      projectPath
    ),
  ]);
}
