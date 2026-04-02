/**
 * Constraint Template Library
 * Reusable constraint patterns for all projects
 * Use these as starting points when defining project-specific constraints
 */

import { ConstraintDefinition } from "../constraint-types";

export const ConstraintTemplates = {
  // ============================================
  // SECURITY TEMPLATES
  // ============================================
  authentication: {
    jwtRequired: {
      id: "template-auth-jwt",
      name: "JWT Authentication Required",
      category: "security",
      severity: "critical" as const,
      difficulty: "moderate" as const,
      description: "All protected API routes must use JWT authentication",
      pattern: "JwtAuthGuard or equivalent auth middleware",
      checks: ["route-scanning", "middleware-verification"],
      sla: "100% of protected routes"
    },

    apiKeyValidation: {
      id: "template-auth-apikey",
      name: "API Key Validation",
      category: "security",
      severity: "critical" as const,
      difficulty: "moderate" as const,
      description: "All API endpoints must validate incoming keys",
      pattern: "ApiKeyValidator on every route",
      checks: ["route-scanning"],
      sla: "100% of routes"
    },

    sessionExpiry: {
      id: "template-auth-session",
      name: "Session Expiry Enforcement",
      category: "security",
      severity: "high" as const,
      difficulty: "complex" as const,
      description: "Sessions must expire after max duration",
      pattern: "MAX_SESSION_DURATION configured",
      checks: ["config-verification"],
      sla: "<24 hour sessions"
    }
  },

  authorization: {
    rbacEnforced: {
      id: "template-authz-rbac",
      name: "Role-Based Access Control",
      category: "security",
      severity: "critical" as const,
      difficulty: "complex" as const,
      description: "All sensitive operations require role verification",
      pattern: "RoleGuard or permission check on admin endpoints",
      checks: ["route-scanning", "middleware-verification"],
      sla: "100% of admin routes"
    },

    rlsPolicies: {
      id: "template-authz-rls",
      name: "Row-Level Security Policies",
      category: "security",
      severity: "critical" as const,
      difficulty: "easy" as const,
      description: "Sensitive database tables must have RLS policies",
      pattern: "RLS enabled on users, payments, sensitive tables",
      checks: ["database-schema-scan"],
      sla: "100% of sensitive tables"
    },

    dataOwnershipValidation: {
      id: "template-authz-ownership",
      name: "Data Ownership Validation",
      category: "security",
      severity: "high" as const,
      difficulty: "complex" as const,
      description: "Users can only access their own data",
      pattern: "user_id filtering in queries",
      checks: ["code-scan", "manual-review"],
      sla: "100% of user queries"
    }
  },

  dataEncryption: {
    tlsRequired: {
      id: "template-encryption-tls",
      name: "TLS for All External Communication",
      category: "security",
      severity: "critical" as const,
      difficulty: "easy" as const,
      description: "All external APIs and databases must use TLS",
      pattern: "https://, connection strings with ssl=true",
      checks: ["config-verification"],
      sla: "100% of external connections"
    },

    sensitiveFieldEncryption: {
      id: "template-encryption-fields",
      name: "Sensitive Field Encryption",
      category: "security",
      severity: "high" as const,
      difficulty: "complex" as const,
      description: "PII must be encrypted at rest",
      pattern: "Encryption service on ssn, phone, email",
      checks: ["code-scan", "manual-review"],
      sla: "100% of PII fields"
    }
  },

  // ============================================
  // DATA INTEGRITY TEMPLATES
  // ============================================
  migrations: {
    allApplied: {
      id: "template-db-migrations",
      name: "All Migrations Applied",
      category: "data-integrity",
      severity: "critical" as const,
      difficulty: "easy" as const,
      description: "All pending database migrations must be applied",
      pattern: "No pending migrations in version control",
      checks: ["migration-scanner"],
      sla: "0 pending migrations"
    },

    reversible: {
      id: "template-db-reversible",
      name: "Reversible Migrations",
      category: "data-integrity",
      severity: "high" as const,
      difficulty: "moderate" as const,
      description: "All migrations must have down scripts",
      pattern: "down() function on every migration",
      checks: ["migration-file-scan"],
      sla: "100% of migrations"
    }
  },

  schemaSync: {
    typesDefined: {
      id: "template-schema-types",
      name: "TypeScript Types Match Database Schema",
      category: "data-integrity",
      severity: "high" as const,
      difficulty: "moderate" as const,
      description: "All database tables must have TypeScript types",
      pattern: "types/supabase.ts or equivalent generated",
      checks: ["type-file-scan"],
      sla: "100% of tables typed"
    },

    prismaSync: {
      id: "template-schema-prisma",
      name: "Prisma Schema In Sync",
      category: "data-integrity",
      severity: "high" as const,
      difficulty: "easy" as const,
      description: "Prisma schema must match database",
      pattern: "prisma generate runs successfully",
      checks: ["prisma-validation"],
      sla: "Schema always in sync"
    }
  },

  referentialIntegrity: {
    foreignKeysEnforced: {
      id: "template-integrity-fk",
      name: "Foreign Keys Enforced",
      category: "data-integrity",
      severity: "high" as const,
      difficulty: "easy" as const,
      description: "All foreign key relationships must be enforced",
      pattern: "NOT NULL on FK columns, cascade/restrict rules",
      checks: ["schema-scan"],
      sla: "100% of relationships"
    },

    uniqueConstraints: {
      id: "template-integrity-unique",
      name: "Unique Constraints Defined",
      category: "data-integrity",
      severity: "medium" as const,
      difficulty: "easy" as const,
      description: "Unique fields must have constraints",
      pattern: "UNIQUE on email, username, etc",
      checks: ["schema-scan"],
      sla: "100% of unique fields"
    }
  },

  // ============================================
  // PERFORMANCE TEMPLATES
  // ============================================
  queryOptimization: {
    noN1Queries: {
      id: "template-perf-n1",
      name: "No N+1 Query Patterns",
      category: "performance",
      severity: "high" as const,
      difficulty: "complex" as const,
      description: "Queries must use batch loading or eager loading",
      pattern: "JOIN or batch queries, not loops with queries",
      checks: ["code-scan", "manual-review"],
      sla: "0 N+1 patterns in hot paths"
    },

    indexedQueries: {
      id: "template-perf-indexes",
      name: "Query Columns Indexed",
      category: "performance",
      severity: "high" as const,
      difficulty: "moderate" as const,
      description: "Common query columns must have indexes",
      pattern: "INDEX on user_id, created_at, status fields",
      checks: ["schema-scan"],
      sla: "100% of WHERE clauses"
    },

    queryTimeouts: {
      id: "template-perf-timeout",
      name: "Query Timeouts Configured",
      category: "performance",
      severity: "medium" as const,
      difficulty: "easy" as const,
      description: "Queries must have configurable timeouts",
      pattern: "timeout: 5000 on database calls",
      checks: ["config-verification"],
      sla: "All queries have timeouts"
    }
  },

  cacheStrategy: {
    redisEnabled: {
      id: "template-cache-redis",
      name: "Redis Cache Configured",
      category: "performance",
      severity: "high" as const,
      difficulty: "easy" as const,
      description: "High-traffic endpoints must use Redis",
      pattern: "Redis client initialized and used",
      checks: ["dependency-check"],
      sla: "Redis in package.json"
    },

    cacheInvalidation: {
      id: "template-cache-invalidation",
      name: "Cache Invalidation Strategy",
      category: "performance",
      severity: "high" as const,
      difficulty: "complex" as const,
      description: "Cache invalidation must be explicit and testable",
      pattern: "invalidateCache() functions with clear scope",
      checks: ["code-scan", "manual-review"],
      sla: "Tested invalidation for all cached data"
    },

    reactQueryDedup: {
      id: "template-cache-reactquery",
      name: "React Query Deduplication",
      category: "performance",
      severity: "medium" as const,
      difficulty: "moderate" as const,
      description: "Frontend queries must use React Query for dedup",
      pattern: "useQuery with staleTime and deduplication",
      checks: ["code-scan"],
      sla: "Duplicate queries eliminated"
    }
  },

  apiLatency: {
    p99Target: {
      id: "template-perf-latency",
      name: "API Latency SLA (P99 < 500ms)",
      category: "performance",
      severity: "high" as const,
      difficulty: "complex" as const,
      description: "99th percentile response time must be under threshold",
      pattern: "Monitored via APM tool",
      checks: ["monitoring-verification"],
      sla: "P99 < 500ms for most endpoints"
    }
  },

  // ============================================
  // CODE QUALITY TEMPLATES
  // ============================================
  typeScript: {
    strictMode: {
      id: "template-ts-strict",
      name: "TypeScript Strict Mode",
      category: "code-quality",
      severity: "high" as const,
      difficulty: "easy" as const,
      description: "TypeScript strict mode must be enabled",
      pattern: "strict: true in tsconfig.json",
      checks: ["config-verification"],
      sla: "100% of projects"
    },

    errorLimit: {
      id: "template-ts-errors",
      name: "TypeScript Error Limit",
      category: "code-quality",
      severity: "critical" as const,
      difficulty: "moderate" as const,
      description: "TS errors must be below threshold",
      pattern: "@ts-ignore count < [THRESHOLD]",
      checks: ["code-scan"],
      sla: "Threshold varies by project"
    },

    noAnyType: {
      id: "template-ts-noany",
      name: "No Implicit Any",
      category: "code-quality",
      severity: "medium" as const,
      difficulty: "moderate" as const,
      description: "Implicit any types are banned",
      pattern: "noImplicitAny: true, noUncheckedIndexedAccess: true",
      checks: ["config-verification"],
      sla: "0 implicit any usage"
    }
  },

  testCoverage: {
    minimumCoverage: {
      id: "template-test-coverage",
      name: "Test Coverage Minimum",
      category: "code-quality",
      severity: "high" as const,
      difficulty: "complex" as const,
      description: "Critical paths must have test coverage",
      pattern: "coverage: { branches: 80, lines: 80, functions: 80 }",
      checks: ["coverage-report"],
      sla: ">80% for critical paths"
    },

    criticalPathTesting: {
      id: "template-test-critical",
      name: "Critical Paths Have Tests",
      category: "code-quality",
      severity: "high" as const,
      difficulty: "complex" as const,
      description: "Revenue, auth, payment paths must be tested",
      pattern: "Test files exist and pass",
      checks: ["manual-review"],
      sla: "100% of critical paths"
    }
  },

  linting: {
    eslintConfigured: {
      id: "template-lint-eslint",
      name: "ESLint Configured",
      category: "code-quality",
      severity: "medium" as const,
      difficulty: "easy" as const,
      description: "ESLint must be configured and enforced",
      pattern: ".eslintrc.json with rules defined",
      checks: ["config-verification"],
      sla: "Config file exists"
    },

    noViolations: {
      id: "template-lint-noviolations",
      name: "No ESLint Violations",
      category: "code-quality",
      severity: "medium" as const,
      difficulty: "easy" as const,
      description: "ESLint must pass in CI",
      pattern: "npm run lint exits with 0",
      checks: ["ci-verification"],
      sla: "0 violations"
    }
  },

  // ============================================
  // DEPLOYMENT & OPERATIONS TEMPLATES
  // ============================================
  cicdGates: {
    testsRequired: {
      id: "template-cicd-tests",
      name: "Tests Must Pass",
      category: "operations",
      severity: "high" as const,
      difficulty: "easy" as const,
      description: "PRs cannot merge without passing tests",
      pattern: "GitHub branch protection rule: require status checks",
      checks: ["github-config-verification"],
      sla: "100% of PRs"
    },

    reviewRequired: {
      id: "template-cicd-review",
      name: "Code Review Required",
      category: "operations",
      severity: "high" as const,
      difficulty: "easy" as const,
      description: "PRs must have at least one approval",
      pattern: "GitHub branch protection rule: require reviews",
      checks: ["github-config-verification"],
      sla: "100% of PRs to main"
    },

    buildSuccess: {
      id: "template-cicd-build",
      name: "Build Must Succeed",
      category: "operations",
      severity: "high" as const,
      difficulty: "easy" as const,
      description: "Code must compile/build successfully",
      pattern: "npm run build exits with 0",
      checks: ["ci-verification"],
      sla: "100% of commits"
    }
  },

  deploymentGates: {
    productionBlocker: {
      id: "template-deploy-blocker",
      name: "Production Deployment Gate",
      category: "operations",
      severity: "critical" as const,
      difficulty: "moderate" as const,
      description: "Cannot deploy to production if constraints fail",
      pattern: "GitHub Actions job blocks deployment",
      checks: ["ci-verification"],
      sla: "100% enforcement"
    },

    healthCheck: {
      id: "template-deploy-health",
      name: "Health Check After Deploy",
      category: "operations",
      severity: "high" as const,
      difficulty: "moderate" as const,
      description: "Deployment must include post-deploy health checks",
      pattern: "Wait for health endpoint to respond 200",
      checks: ["ci-verification"],
      sla: "All deployments"
    }
  },

  monitoring: {
    alertsConfigured: {
      id: "template-monitor-alerts",
      name: "Monitoring Alerts Configured",
      category: "operations",
      severity: "high" as const,
      difficulty: "moderate" as const,
      description: "Critical metrics must have alerts",
      pattern: "Datadog/CloudWatch/Prometheus alerts configured",
      checks: ["monitoring-verification"],
      sla: "P0 alerts on: 500s, latency, database errors"
    },

    loggingConfigured: {
      id: "template-monitor-logging",
      name: "Centralized Logging",
      category: "operations",
      severity: "high" as const,
      difficulty: "easy" as const,
      description: "Logs must be collected and searchable",
      pattern: "CloudWatch Logs or equivalent configured",
      checks: ["config-verification"],
      sla: "All environments logging"
    }
  },

  // ============================================
  // BUSINESS LOGIC TEMPLATES
  // ============================================
  businessLogic: {
    revenueSplit: {
      id: "template-business-split",
      name: "Revenue Split Enforcement",
      category: "business-logic",
      severity: "critical" as const,
      difficulty: "complex" as const,
      description: "Revenue split must be within defined range",
      pattern: "Percentage validation in monetization service",
      checks: ["code-scan", "manual-review"],
      sla: "100% enforcement, no exceptions"
    },

    paymentValidation: {
      id: "template-business-payment",
      name: "Payment Validation Required",
      category: "business-logic",
      severity: "critical" as const,
      difficulty: "complex" as const,
      description: "Payments must be validated before processing",
      pattern: "Validation service called before charge",
      checks: ["code-scan", "manual-review"],
      sla: "0 unvalidated payments"
    },

    featureGating: {
      id: "template-business-gating",
      name: "Feature Gating for Unreleased Features",
      category: "business-logic",
      severity: "high" as const,
      difficulty: "complex" as const,
      description: "Incomplete features must be behind feature flags",
      pattern: "Feature flag check on feature access",
      checks: ["code-scan", "manual-review"],
      sla: "No incomplete features in production"
    }
  }
};

/**
 * Helper to apply a template to a specific project
 * Use this when creating project-specific constraints from templates
 */
export function applyTemplate(
  template: ConstraintDefinition,
  projectId: string,
  overrides?: Partial<ConstraintDefinition>
): ConstraintDefinition {
  return {
    ...template,
    id: template.id.replace("template", projectId),
    ...overrides
  };
}

/**
 * Get all templates by category
 */
export function getTemplatesByCategory(category: string) {
  const all = Object.values(ConstraintTemplates).flatMap((section) =>
    Object.values(section as Record<string, ConstraintDefinition>)
  );
  return all.filter((t) => t.category === category);
}

/**
 * Get all templates by severity
 */
export function getTemplatesBySeverity(severity: string) {
  const all = Object.values(ConstraintTemplates).flatMap((section) =>
    Object.values(section as Record<string, ConstraintDefinition>)
  );
  return all.filter((t) => t.severity === severity);
}
