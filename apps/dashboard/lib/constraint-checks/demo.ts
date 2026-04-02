/**
 * Demo script: Run constraint audit and show results
 *
 * Usage: npx ts-node dashboard/lib/constraint-checks/demo.ts [project-path]
 * Example: npx ts-node dashboard/lib/constraint-checks/demo.ts ../embr
 */

import path from "path";
import { EMBR_CONSTRAINTS, getConstraintsByDifficulty } from "../constraints/embr-constraints";
import { runConstraintAudit } from "../constraint-validator";
import { runEasyChecks } from "./easy";

async function main() {
  const projectPath = process.argv[2] || process.cwd();
  const difficulty = process.argv[3] || "easy"; // easy, moderate, complex, all
  const projectName = path.basename(projectPath) || "unknown";

  console.log("\n" + "=".repeat(80));
  console.log("🔍 penny CONSTRAINT AUDIT");
  console.log("=".repeat(80));
  console.log(`Project: ${projectName}`);
  console.log(`Path: ${projectPath}`);
  console.log(`Difficulty: ${difficulty.toUpperCase()}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("=".repeat(80) + "\n");

  // Get constraints based on difficulty
  let constraints = EMBR_CONSTRAINTS;
  if (difficulty !== "all") {
    constraints = getConstraintsByDifficulty(
      difficulty as "easy" | "moderate" | "complex"
    );
  }
  console.log(`📋 Running ${constraints.length} constraint checks...\n`);

  // Run audit
  const result = await runConstraintAudit(
    constraints,
    projectPath,
    projectName
  );

  // Display summary
  console.log("\n" + "━".repeat(80));
  console.log("📊 AUDIT SUMMARY");
  console.log("━".repeat(80));
  console.log(`Total Constraints: ${result.total_constraints}`);
  console.log(`✅ Passed: ${result.passed}`);
  console.log(`❌ Failed: ${result.failed}`);
  console.log(`⚠️  Warnings: ${result.warnings}`);
  console.log(`📈 Coverage: ${result.coverage_percentage}%`);
  console.log("━".repeat(80) + "\n");

  // Display results by constraint
  console.log("📝 CONSTRAINT RESULTS\n");

  for (const constraint of constraints) {
    const checkResults = result.violations.filter(
      (v) => v.constraint_id === constraint.id
    );
    const passed = checkResults.length === 0;

    const icon = passed ? "✅" : "❌";
    const severity =
      constraint.severity === "critical" ? "🔴" : "🟡";

    console.log(
      `${icon} ${severity} [${constraint.check_type.toUpperCase()}] ${constraint.id}`
    );
    console.log(`   Name: ${constraint.name}`);
    console.log(`   Category: ${constraint.category}`);

    if (!passed) {
      console.log(`   Status: FAILED`);
      for (const violation of checkResults) {
        console.log(`     ⚠️  ${violation.violation_type}`);
        console.log(
          `       Current: ${violation.current_state}`
        );
        console.log(
          `       Expected: ${violation.expected_state}`
        );
        console.log(
          `       Fix: ${violation.remediation}`
        );
      }
    } else {
      console.log(`   Status: PASSED ✓`);
    }
    console.log();
  }

  // Summary by category
  console.log("\n" + "━".repeat(80));
  console.log("📂 BY CATEGORY");
  console.log("━".repeat(80));

  const byCategory = new Map<string, { passed: number; total: number }>();

  for (const constraint of constraints) {
    if (!byCategory.has(constraint.category)) {
      byCategory.set(constraint.category, { passed: 0, total: 0 });
    }
    const stats = byCategory.get(constraint.category)!;
    stats.total++;

    const hasFailed = result.violations.some(
      (v) => v.constraint_id === constraint.id
    );
    if (!hasFailed) {
      stats.passed++;
    }
  }

  for (const [category, stats] of byCategory) {
    const percent = Math.round((stats.passed / stats.total) * 100);
    const bar =
      "█".repeat(percent / 5) +
      "░".repeat(20 - percent / 5);
    console.log(`${category.padEnd(20)} ${bar} ${percent}%`);
  }

  // Summary by difficulty (if running all)
  if (difficulty === "all") {
    console.log("\n" + "━".repeat(80));
    console.log("⚙️  BY DIFFICULTY");
    console.log("━".repeat(80));

    const byDiff = new Map<string, { passed: number; total: number }>();
    for (const constraint of constraints) {
      if (!byDiff.has(constraint.check_type)) {
        byDiff.set(constraint.check_type, { passed: 0, total: 0 });
      }
      const stats = byDiff.get(constraint.check_type)!;
      stats.total++;

      const hasFailed = result.violations.some(
        (v) => v.constraint_id === constraint.id
      );
      if (!hasFailed) {
        stats.passed++;
      }
    }

    for (const difficulty of ["easy", "moderate", "complex"]) {
      const stats = byDiff.get(difficulty);
      if (stats) {
        const percent = Math.round((stats.passed / stats.total) * 100);
        const bar =
          "█".repeat(percent / 5) +
          "░".repeat(20 - percent / 5);
        console.log(
          `${difficulty.padEnd(10)} ${bar} ${stats.passed}/${stats.total} (${percent}%)`
        );
      }
    }
  }

  // Next steps
  console.log("\n" + "━".repeat(80));
  console.log("🎯 NEXT STEPS");
  console.log("━".repeat(80));

  if (result.failed === 0) {
    if (difficulty === "easy") {
      console.log("✅ All easy constraints passing!");
      console.log(
        "Run moderate checks: npx ts-node dashboard/lib/constraint-checks/demo.ts . moderate"
      );
    } else if (difficulty === "moderate") {
      console.log("✅ All moderate constraints passing!");
      console.log(
        "Run complex checks: npx ts-node dashboard/lib/constraint-checks/demo.ts . complex"
      );
    } else if (difficulty === "complex" || difficulty === "all") {
      console.log("✅ All constraints passing!");
      console.log("📊 Ready for dashboard integration & CI/CD setup");
    }
  } else {
    console.log(`❌ ${result.failed} constraint(s) need attention`);
    const failedIds = result.violations.map((v) =>
      v.constraint_id.split("-")[1]
    );
    console.log(
      `Fix constraints: ${[...new Set(failedIds)].join(", ")}`
    );
    console.log(
      "\n💡 Tip: Review remediation steps above for each violation"
    );
  }

  console.log(
    "\nFor details, see: CONSTRAINT_AUDIT_README.md or ALIGNMENT_IMPLEMENTATION_ROADMAP.md\n"
  );

  // Exit with appropriate code
  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
