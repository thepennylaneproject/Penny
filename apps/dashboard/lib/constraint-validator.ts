/**
 * Constraint validation engine
 * Orchestrates running all constraint checks and collecting results
 */

import { execSync } from "child_process";
import fs from "fs";
import type {
  CheckResult,
  ConstraintAuditResult,
  ConstraintCheck,
  ConstraintViolation,
} from "./constraint-types";
import {
  EMBR_CONSTRAINTS,
  getConstraintsByDifficulty,
} from "./constraints/embr-constraints";

/**
 * Run a single constraint check
 */
export interface CheckRunner {
  (constraint: ConstraintCheck, projectPath: string): Promise<CheckResult>;
}

/**
 * Registry of check implementations by constraint ID
 */
const checkRegistry = new Map<string, CheckRunner>();

export function registerCheck(
  constraintId: string,
  runner: CheckRunner
): void {
  checkRegistry.set(constraintId, runner);
}

export function getCheckRunner(
  constraintId: string
): CheckRunner | undefined {
  return checkRegistry.get(constraintId);
}

/**
 * Execute a bash command safely
 */
export function runCommand(
  command: string,
  cwd: string
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(command, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (error: unknown) {
    const e = error as { status?: number; stderr?: Buffer; stdout?: Buffer };
    return {
      stdout: e.stdout?.toString() || "",
      stderr: e.stderr?.toString() || "",
      exitCode: e.status || 1,
    };
  }
}

/**
 * Read and parse JSON file safely
 */
export function readJSON<T>(
  filePath: string,
  fallback: T
): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

/**
 * Check if file exists
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Read file content
 */
export function readFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Run a single constraint check
 */
export async function runConstraintCheck(
  constraint: ConstraintCheck,
  projectPath: string
): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    const runner = getCheckRunner(constraint.id);

    if (!runner) {
      // No registered runner - return unimplemented
      return {
        constraint_id: constraint.id,
        passed: false,
        violations: [
          {
            constraint_id: constraint.id,
            violation_type: "not_found",
            severity: "warning",
            current_state: "Check not implemented",
            expected_state: "Check implementation exists",
            remediation:
              "Register a check runner for this constraint ID",
            project: "unknown",
          },
        ],
        execution_time_ms: Date.now() - startTime,
      };
    }

    const result = await runner(constraint, projectPath);
    result.execution_time_ms = Date.now() - startTime;
    return result;
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : String(error);
    return {
      constraint_id: constraint.id,
      passed: false,
      violations: [
        {
          constraint_id: constraint.id,
          violation_type: "not_found",
          severity: constraint.severity,
          current_state: `Error: ${errorMsg}`,
          expected_state: "Check executes without error",
          remediation: "Review check implementation and error logs",
          project: "unknown",
        },
      ],
      execution_time_ms: Date.now() - startTime,
    };
  }
}

/**
 * Run multiple constraint checks
 */
export async function runConstraintAudit(
  constraints: ConstraintCheck[],
  projectPath: string,
  projectName: string = "unknown"
): Promise<ConstraintAuditResult> {
  const runId = `audit-${Date.now()}`;
  const timestamp = new Date().toISOString();

  const results = await Promise.all(
    constraints.map((c) => runConstraintCheck(c, projectPath))
  );

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const allViolations = results.flatMap((r) => r.violations);

  const criticalViolations = allViolations.filter(
    (v) => v.severity === "critical"
  );
  const warningViolations = allViolations.filter(
    (v) => v.severity === "warning"
  );

  const coverage = Math.round((passed / constraints.length) * 100);

  const summary =
    failed === 0
      ? `✅ All ${constraints.length} constraints passing`
      : `⚠️ ${passed}/${constraints.length} constraints passing (${coverage}%)`;

  return {
    project: projectName,
    run_id: runId,
    timestamp,
    total_constraints: constraints.length,
    passed,
    failed,
    warnings: warningViolations.length,
    violations: allViolations,
    coverage_percentage: coverage,
    summary,
    metadata: {
      critical_violations: criticalViolations.length,
      duration_ms: 0, // Will be calculated by caller
    },
  };
}

/**
 * Helper: Create a passing check result
 */
export function createPassingResult(
  constraintId: string
): CheckResult {
  return {
    constraint_id: constraintId,
    passed: true,
    violations: [],
  };
}

/**
 * Helper: Create a failing check result
 */
export function createFailingResult(
  constraintId: string,
  violation: Omit<ConstraintViolation, "constraint_id">
): CheckResult {
  return {
    constraint_id: constraintId,
    passed: false,
    violations: [
      {
        ...violation,
        constraint_id: constraintId,
      },
    ],
  };
}

/**
 * Helper: Create multiple violations
 */
export function createFailingResultMultiple(
  constraintId: string,
  violations: Omit<ConstraintViolation, "constraint_id">[]
): CheckResult {
  return {
    constraint_id: constraintId,
    passed: violations.length === 0,
    violations: violations.map((v) => ({
      ...v,
      constraint_id: constraintId,
    })),
  };
}

/**
 * Portfolio orchestration entry: run EMBR constraints for a project path by difficulty.
 */
export class ConstraintValidator {
  async runConstraintAudit(
    projectPath: string,
    difficulty: "easy" | "moderate" | "complex" | "all",
    projectId: string
  ): Promise<ConstraintAuditResult> {
    let constraints: ConstraintCheck[] = EMBR_CONSTRAINTS;
    if (difficulty !== "all") {
      constraints = getConstraintsByDifficulty(difficulty);
    }
    return runConstraintAudit(constraints, projectPath, projectId);
  }
}
