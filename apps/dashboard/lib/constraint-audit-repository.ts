/**
 * Constraint audit repository
 * Data access layer for saving/retrieving constraint audit results
 */

import { createClient } from "@supabase/supabase-js";
import type { ConstraintAuditResult, ConstraintViolation } from "./constraint-types";
import type { PortfolioAuditSummary } from "./portfolio-types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "Supabase not configured - constraint audit storage will be in-memory only"
  );
}

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

/**
 * Save a constraint audit result to database
 */
export async function saveConstraintAudit(
  result: ConstraintAuditResult
): Promise<{ id?: number; error?: string }> {
  if (!supabase) {
    console.warn(
      "Supabase not configured - audit result not saved to database"
    );
    return { error: "Supabase not configured" };
  }

  try {
    // Save main audit record
    const { data: auditData, error: auditError } = await supabase
      .from("penny_constraint_audits")
      .insert({
        run_id: result.run_id,
        project: result.project,
        timestamp: result.timestamp,
        total_constraints: result.total_constraints,
        passed: result.passed,
        failed: result.failed,
        warnings: result.warnings,
        coverage_percentage: result.coverage_percentage,
        summary: result.summary,
        easy_passed: result.metadata?.easy_passed,
        easy_failed: result.metadata?.easy_failed,
        moderate_passed: result.metadata?.moderate_passed,
        moderate_failed: result.metadata?.moderate_failed,
        complex_passed: result.metadata?.complex_passed,
        complex_failed: result.metadata?.complex_failed,
        duration_ms: result.metadata?.duration_ms,
        auditor: result.metadata?.auditor,
        violations: result.violations,
        metadata: result.metadata,
      })
      .select("id")
      .single();

    if (auditError) {
      return { error: auditError.message };
    }

    const auditId = auditData?.id;
    if (!auditId) {
      return { error: "Failed to get audit ID" };
    }

    // Save individual violations
    if (result.violations.length > 0) {
      const violationRecords = result.violations.map((v) => ({
        audit_id: auditId,
        constraint_id: v.constraint_id,
        violation_type: v.violation_type,
        severity: v.severity,
        current_state: v.current_state,
        expected_state: v.expected_state,
        remediation: v.remediation,
        file_path: v.location?.file,
        line_number: v.location?.line,
        context: v.location?.context,
        details: v.details,
      }));

      const { error: violationError } = await supabase
        .from("penny_constraint_violations")
        .insert(violationRecords);

      if (violationError) {
        console.error(
          "Failed to save violations:",
          violationError.message
        );
        // Don't fail - main audit was saved
      }
    }

    return { id: auditId };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    return { error: message };
  }
}

/**
 * Get latest constraint audit for a project
 */
export async function getLatestConstraintAudit(
  project: string
): Promise<ConstraintAuditResult | null> {
  if (!supabase) {
    console.warn("Supabase not configured - cannot retrieve audit");
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("penny_constraint_audits")
      .select(
        `
        id,
        run_id,
        project,
        timestamp,
        total_constraints,
        passed,
        failed,
        warnings,
        coverage_percentage,
        summary,
        violations,
        metadata
      `
      )
      .eq("project", project)
      .order("timestamp", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error("Failed to fetch audit:", error.message);
      return null;
    }

    if (!data) return null;

    return {
      project: data.project,
      run_id: data.run_id,
      timestamp: data.timestamp,
      total_constraints: data.total_constraints,
      passed: data.passed,
      failed: data.failed,
      warnings: data.warnings,
      coverage_percentage: data.coverage_percentage,
      summary: data.summary,
      violations: data.violations || [],
      metadata: data.metadata,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error("Error fetching latest audit:", message);
    return null;
  }
}

/**
 * Get audit history for a project (last N audits)
 */
export async function getConstraintAuditHistory(
  project: string,
  limit: number = 10
) {
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("constraint_audit_history")
      .select("*")
      .eq("project", project)
      .order("timestamp", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Failed to fetch history:", error.message);
      return [];
    }

    return data || [];
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error("Error fetching audit history:", message);
    return [];
  }
}

/**
 * Get violations for an audit
 */
export async function getAuditViolations(
  auditId: number
): Promise<ConstraintViolation[]> {
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("penny_constraint_violations")
      .select("*")
      .eq("audit_id", auditId)
      .order("severity", { ascending: false });

    if (error) {
      console.error("Failed to fetch violations:", error.message);
      return [];
    }

    return (
      data?.map((v) => ({
        constraint_id: v.constraint_id,
        violation_type: v.violation_type,
        severity: v.severity,
        current_state: v.current_state,
        expected_state: v.expected_state,
        remediation: v.remediation,
        project: "", // Not stored in violations table
        location: v.file_path
          ? {
              file: v.file_path,
              line: v.line_number,
              context: v.context,
            }
          : undefined,
        details: v.details,
      })) || []
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error("Error fetching violations:", message);
    return [];
  }
}

/**
 * Get violation summary by severity
 */
export async function getViolationsSummary(project: string) {
  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("constraint_violations_summary")
      .select("*")
      .eq("project", project)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned
      console.error("Failed to fetch summary:", error.message);
    }

    return data;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error("Error fetching summary:", message);
    return null;
  }
}

/**
 * Check if constraint audit exists
 */
export async function constraintAuditExists(
  runId: string
): Promise<boolean> {
  if (!supabase) {
    return false;
  }

  try {
    const { data, error } = await supabase
      .from("penny_constraint_audits")
      .select("id")
      .eq("run_id", runId)
      .limit(1);

    return !error && data && data.length > 0;
  } catch {
    return false;
  }
}

/**
 * Class wrapper for portfolio orchestrator (delegates to module functions).
 */
export class ConstraintAuditRepository {
  getLatestConstraintAudit = getLatestConstraintAudit;
  saveConstraintAudit = saveConstraintAudit;

  async getPortfolioAuditHistory(
    _limit: number
  ): Promise<{ summary: PortfolioAuditSummary }[]> {
    return [];
  }
}
