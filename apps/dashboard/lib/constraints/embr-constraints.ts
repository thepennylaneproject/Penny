/**
 * Embr project constraints
 * 17 constraints from manual expectations document
 * Organized by difficulty: 7 easy, 4 moderate, 6 complex
 */

import type { ConstraintCheck } from "../constraint-types";

/**
 * EASY CHECKS (7): Dependency and config verification
 * Can be fully automated via package.json, tsconfig.json inspection
 */
const EASY_CHECKS: ConstraintCheck[] = [
  {
    id: "embr-001",
    name: "Turborepo monorepo structure",
    category: "architecture",
    severity: "warning",
    description:
      "Turborepo monorepo with three apps (api, web, mobile) must be maintained",
    why_required:
      "Monorepo structure enables code sharing and unified deployment",
    how_to_verify:
      "Check apps/api, apps/web, apps/mobile exist; verify turbo.json and workspaces",
    check_type: "easy",
    implementation: {
      bash_command:
        'ls -d apps/api apps/web apps/mobile && cat turbo.json | jq . && cat package.json | jq .workspaces',
      code_path: ".",
      expected_value: "All three apps exist, turbo.json valid, workspaces defined",
    },
  },
  {
    id: "embr-002",
    name: "TypeScript strict mode in API",
    category: "architecture",
    severity: "critical",
    description: "TypeScript strict mode MUST be enabled in API tsconfig",
    why_required:
      "Strict mode catches type errors early; required for production stability",
    how_to_verify: 'Check apps/api/tsconfig.json for "strict": true',
    check_type: "easy",
    implementation: {
      bash_command:
        "cat apps/api/tsconfig.json | jq '.compilerOptions.strict'",
      code_path: "apps/api/tsconfig.json",
      expected_value: "true",
    },
  },
  {
    id: "embr-003",
    name: "Prisma 5 + PostgreSQL 16 locked in",
    category: "infrastructure",
    severity: "critical",
    description: "No other ORM or database client allowed",
    why_required:
      "Consistency across team; prevents incompatible migrations",
    how_to_verify:
      'Check @prisma/client version in apps/api/package.json, verify no other ORMs',
    check_type: "easy",
    implementation: {
      bash_command:
        'cat apps/api/package.json | jq ".dependencies.prisma, .dependencies.\\"@prisma/client\\"" && grep -r "sequelize\\|typeorm\\|mongodb" apps/api/package.json || echo "No forbidden ORMs"',
      code_path: "apps/api/package.json",
      expected_value: '@prisma/client: "^5.x", no TypeORM/Sequelize',
    },
  },
  {
    id: "embr-004",
    name: "Redis 7 version pinning",
    category: "infrastructure",
    severity: "warning",
    description: "Do not downgrade Redis from version 7",
    why_required: "Version 7 features are required for performance",
    how_to_verify: "Check redis dependency version >= 7.0.0",
    check_type: "easy",
    implementation: {
      bash_command:
        'cat apps/api/package.json | jq ".dependencies.redis" && grep -r "redis:7" docker/ Dockerfile || echo "Check Redis config"',
      code_path: "apps/api/package.json",
      expected_value: 'redis dependency >= "7.0.0"',
    },
  },
  {
    id: "embr-005",
    name: "Socket.io real-time library",
    category: "infrastructure",
    severity: "warning",
    description: "Socket.io is the required WebSocket library",
    why_required:
      "Unified real-time solution; prevents WebSocket library conflicts",
    how_to_verify:
      'Check socket.io in dependencies, verify no competing libraries (ws, websocket-js)',
    check_type: "easy",
    implementation: {
      bash_command:
        'cat apps/api/package.json | jq ".dependencies.\\"socket.io\\"" && grep -r "\\bws\\b\\|websocket\\|sockjs" apps/api/package.json | grep -v node_modules || echo "No competing libraries"',
      code_path: "apps/api/package.json",
      expected_value:
        'socket.io in dependencies, no ws/websocket alternatives',
    },
  },
  {
    id: "embr-006",
    name: "ts-jest configuration for tests",
    category: "architecture",
    severity: "critical",
    description: "ts-jest must be installed and Jest configured for TypeScript",
    why_required: "TypeScript test support; required for type-safe tests",
    how_to_verify:
      'Check ts-jest in devDependencies, verify jest.config references ts-jest',
    check_type: "easy",
    implementation: {
      bash_command:
        'cat apps/api/package.json | jq ".devDependencies.\\"ts-jest\\"" && cat apps/api/jest.config.ts | grep -i "ts-jest" || echo "Check jest config"',
      code_path: "apps/api/jest.config.ts",
      expected_value:
        'ts-jest in devDependencies, preset: "ts-jest" in jest config',
    },
  },
  {
    id: "embr-007",
    name: "AWS SES email only",
    category: "infrastructure",
    severity: "warning",
    description: "Only AWS SES for transactional/notification email",
    why_required:
      "Single email provider; prevents vendor lock-in and manages costs",
    how_to_verify:
      'Check SES SDK present, verify no SendGrid/Mailgun/Postmark',
    check_type: "easy",
    implementation: {
      bash_command:
        'cat apps/api/package.json | jq ".dependencies.\\"@aws-sdk/client-ses\\"" && grep -r "sendgrid\\|mailgun\\|postmark" apps/api/package.json | grep -v node_modules || echo "No competing email providers"',
      code_path: "apps/api/package.json",
      expected_value: "SES SDK present, no competing email providers",
    },
  },
];

/**
 * MODERATE CHECKS (4): Code scanning for patterns
 * Can be automated with grep/regex but need to analyze output
 */
const MODERATE_CHECKS: ConstraintCheck[] = [
  {
    id: "embr-008",
    name: "All API routes prefixed with /v1",
    category: "architecture",
    severity: "critical",
    description: "Every API endpoint must be prefixed with /v1",
    why_required: "API versioning consistency; enables future version compatibility",
    how_to_verify: "Scan for all route decorators; count /v1 prefix usage",
    check_type: "moderate",
    implementation: {
      bash_command:
        'grep -r "@Post\\|@Get\\|@Put\\|@Delete\\|@Patch" apps/api/src | grep -v ".spec.ts" | wc -l',
      code_path: "apps/api/src",
      notes: "Compare to count of routes WITH /v1 prefix",
    },
  },
  {
    id: "embr-009",
    name: "JwtAuthGuard on all protected routes",
    category: "security",
    severity: "critical",
    description: "JwtAuthGuard must be on every protected route",
    why_required: "Authentication consistency; prevents unauthorized access",
    how_to_verify:
      "Scan for protected routes; verify JwtAuthGuard applied to all",
    check_type: "moderate",
    implementation: {
      bash_command:
        'grep -r "@UseGuards.*JwtAuthGuard\\|JwtAuthGuard" apps/api/src',
      code_path: "apps/api/src",
      notes: "Count decorated routes vs routes with guard",
    },
  },
  {
    id: "embr-010",
    name: "ThrottlerGuard rate limiting active",
    category: "security",
    severity: "critical",
    description: "ThrottlerGuard must be applied for DOS protection",
    why_required: "DOS attack mitigation; protects API availability",
    how_to_verify: "Scan for ThrottlerGuard configuration and application",
    check_type: "moderate",
    implementation: {
      bash_command:
        'grep -r "ThrottlerModule\\|@UseGuards.*Throttler" apps/api/src',
      code_path: "apps/api/src",
      notes: "Check if globally enabled or per-route",
    },
  },
  {
    id: "embr-011",
    name: "Mux for video processing (not local)",
    category: "infrastructure",
    severity: "critical",
    description: "All video processing through Mux; no server-side processing",
    why_required:
      "Prevent server overload; ensures consistent video quality",
    how_to_verify:
      "Check Mux SDK in dependencies; verify no FFmpeg or local encoding",
    check_type: "moderate",
    implementation: {
      bash_command:
        'cat apps/api/package.json | jq ".dependencies.\\"@mux/mux-node\\"" && grep -r "ffmpeg\\|avconv\\|encodeVideo" apps/api/src | grep -v node_modules || echo "No local video processing"',
      code_path: "apps/api/package.json",
      expected_value: "Mux SDK present, no local video tools",
    },
  },
];

/**
 * COMPLEX CHECKS (6): Business logic and strategic decisions
 * Require manual review or advanced flow tracing
 */
const COMPLEX_CHECKS: ConstraintCheck[] = [
  {
    id: "embr-012",
    name: "Creator revenue split 85-90%",
    category: "business-logic",
    severity: "critical",
    description: "Revenue split to creators must be between 85% and 90%",
    why_required: "Creator contract obligation; changing breaks business model",
    how_to_verify:
      "Scan monetization service for split calculation; verify range",
    check_type: "complex",
    implementation: {
      code_path: "apps/api/src/core/monetization",
      bash_command:
        'grep -r "0.85\\|0.9\\|revenue.*split\\|creator.*share" apps/api/src/core/monetization',
      requires_manual_review: true,
      expected_value: "creator_share between 0.85 and 0.90",
      notes: "Must verify no hardcoded lower percentages like 0.75",
    },
  },
  {
    id: "embr-013",
    name: "Wallet verification before payouts",
    category: "business-logic",
    severity: "critical",
    description: "Payout flow MUST call verify-integrity BEFORE sending funds",
    why_required: "Financial integrity; skipping verification enables fraud",
    how_to_verify: "Trace payout flow; confirm verify() called first",
    check_type: "complex",
    implementation: {
      code_path:
        "apps/api/src/core/monetization/services/payout.service.ts",
      bash_command:
        'grep -r "verify-integrity\\|verifyIntegrity\\|processPayout\\|executePayout" apps/api/src/core/monetization',
      requires_manual_review: true,
      notes: "Execution ordering is critical",
    },
  },
  {
    id: "embr-014",
    name: "S3 presigned URLs for uploads",
    category: "security",
    severity: "critical",
    description:
      "All media uploads must use S3 presigned URLs; direct uploads prohibited",
    why_required: "Security best practice; prevents direct server file access",
    how_to_verify: "Scan upload flow; verify presigned URL usage",
    check_type: "complex",
    implementation: {
      code_path: "apps/api/src/core/upload",
      bash_command:
        'grep -r "getSignedUrl\\|presigned" apps/api/src/core/upload && grep -r "fs.writeFile\\|stream.pipe" apps/api/src/core/upload || echo "No direct file handling"',
      requires_manual_review: true,
      notes: "Check both client-side URL generation and server-side file handling",
    },
  },
  {
    id: "embr-015",
    name: "Moderation pipeline for flagged content",
    category: "operational-policy",
    severity: "critical",
    description: "Content flagging must ALWAYS trigger moderation pipeline",
    why_required: "Compliance; prevents unmoderated harmful content",
    how_to_verify:
      "Trace flag/report flow; verify moderation always triggered",
    check_type: "complex",
    implementation: {
      code_path: "apps/api/src/core",
      bash_command:
        'grep -r "flag\\|report" apps/api/src/core | grep -i controller && grep -r "ModerationAction\\|moderation" apps/api/src/core | grep -i trigger',
      requires_manual_review: true,
      notes: "Ensure no bypass paths exist",
    },
  },
  {
    id: "embr-016",
    name: "666+ TypeScript errors production blocker",
    category: "operational-policy",
    severity: "critical",
    description:
      "666+ suppressed TypeScript errors must be resolved before production",
    why_required:
      "Strategic decision; limits technical debt and prevents production issues",
    how_to_verify: "Count @ts-ignore directives; verify CI gate enforcement",
    check_type: "complex",
    implementation: {
      bash_command: 'grep -r "@ts-ignore\\|@ts-nocheck" apps/api/src | wc -l',
      code_path: "apps/api/src",
      expected_value: "Count <= 666 and cannot increase",
      notes: "Must be enforced in CI/CD",
    },
  },
  {
    id: "embr-017",
    name: "Music phase-2 feature gating",
    category: "product-strategy",
    severity: "critical",
    description: "Music phase-2 vertical must not be exposed in production UI",
    why_required: "Product roadmap; incomplete feature must be hidden",
    how_to_verify:
      "Scan for feature flag; verify not exposed in production build",
    check_type: "complex",
    implementation: {
      bash_command:
        'grep -r "MUSIC_PHASE2\\|MUSIC_V2\\|musicPhase2" apps/web/src && grep -r "MUSIC" .env.production | grep -i flag',
      code_path: "apps/web/src",
      requires_manual_review: true,
      notes: "Verify feature flag is FALSE in production environment",
    },
  },
];

export const EMBR_CONSTRAINTS: ConstraintCheck[] = [
  ...EASY_CHECKS,
  ...MODERATE_CHECKS,
  ...COMPLEX_CHECKS,
];

export const EASY_CONSTRAINT_IDS = EASY_CHECKS.map((c) => c.id);
export const MODERATE_CONSTRAINT_IDS = MODERATE_CHECKS.map((c) => c.id);
export const COMPLEX_CONSTRAINT_IDS = COMPLEX_CHECKS.map((c) => c.id);

export function getConstraintById(id: string): ConstraintCheck | undefined {
  return EMBR_CONSTRAINTS.find((c) => c.id === id);
}

export function getConstraintsByDifficulty(
  difficulty: "easy" | "moderate" | "complex"
): ConstraintCheck[] {
  return EMBR_CONSTRAINTS.filter((c) => c.check_type === difficulty);
}

export function getCriticalConstraints(): ConstraintCheck[] {
  return EMBR_CONSTRAINTS.filter((c) => c.severity === "critical");
}
