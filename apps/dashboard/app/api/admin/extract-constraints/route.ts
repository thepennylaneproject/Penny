/**
 * Constraint Extraction API
 * AI-assisted extraction of constraints from project code and documentation
 */

import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import type { ConstraintDefinition } from "@/lib/constraint-types";
import { ConstraintManager } from "@/lib/constraint-manager";

const manager = new ConstraintManager();

interface ExtractionResult {
  projectId: string;
  suggestedConstraints: Array<{
    template: string;
    templatePath: string;
    confidence: number;
    reason: string;
    overrides?: Record<string, unknown>;
  }>;
  manualReviewRequired: Array<{
    type: string;
    finding: string;
    suggestedCategory: string;
    suggestedSeverity: string;
  }>;
  sourceAnalysis: {
    filesScanned: number;
    docsAnalyzed: number;
    patternsFound: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, action, data } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID required" },
        { status: 400 }
      );
    }

    switch (action) {
      case "scanProject":
        // Scan project for potential constraints
        const scanResults = await scanProjectForConstraints(projectId);
        return NextResponse.json({ results: scanResults });

      case "extractFromReadme":
        // Extract constraints from README.md
        const readmeResults = await extractFromReadme(projectId, data.readmePath);
        return NextResponse.json({ results: readmeResults });

      case "extractFromCode":
        // Scan codebase for patterns
        const codeResults = await scanCodeForPatterns(projectId, data.patterns);
        return NextResponse.json({ results: codeResults });

      case "suggestConstraints":
        // Generate constraint suggestions based on analysis
        const suggestions = await suggestConstraints(projectId, data.findings);
        return NextResponse.json({ suggestions });

      case "applyExtraction":
        // Apply suggested constraints to project
        const constraints = data.constraints;
        await manager.bulkUpsertConstraints(projectId, constraints, "extraction-tool");
        return NextResponse.json({
          success: true,
          count: constraints.length
        });

      default:
        return NextResponse.json(
          { error: "Unknown action" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Extraction API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Scan project for constraint opportunities
 */
async function scanProjectForConstraints(projectId: string): Promise<ExtractionResult> {
  const projectPath = path.join(process.cwd(), projectId);

  const suggestedConstraints: ExtractionResult["suggestedConstraints"] = [];
  const manualReviewRequired: ExtractionResult["manualReviewRequired"] = [];
  let filesScanned = 0;
  let docsAnalyzed = 0;
  let patternsFound = 0;

  // Scan package.json for dependencies (easy wins)
  const packageJsonPath = path.join(projectPath, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    filesScanned++;
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

    // Check for TypeScript
    if (packageJson.devDependencies?.typescript) {
      suggestedConstraints.push({
        template: "TypeScript strict mode",
        templatePath: "code-quality.strictMode",
        confidence: 0.95,
        reason: "TypeScript detected in dependencies"
      });
      patternsFound++;
    }

    // Check for testing framework
    if (packageJson.devDependencies?.jest || packageJson.devDependencies?.vitest) {
      suggestedConstraints.push({
        template: "Test coverage minimum",
        templatePath: "code-quality.minimumCoverage",
        confidence: 0.9,
        reason: "Jest/Vitest detected - suggest test coverage SLA"
      });
      patternsFound++;
    }

    // Check for auth libraries
    if (packageJson.dependencies?.jwt || packageJson.dependencies?.["jsonwebtoken"]) {
      suggestedConstraints.push({
        template: "JWT Authentication Required",
        templatePath: "security.jwtRequired",
        confidence: 0.85,
        reason: "JWT library detected"
      });
      patternsFound++;
    }

    // Check for database libraries
    if (packageJson.dependencies?.prisma || packageJson.dependencies?.["@prisma/client"]) {
      suggestedConstraints.push({
        template: "Prisma Schema In Sync",
        templatePath: "data-integrity.prismaSync",
        confidence: 0.9,
        reason: "Prisma detected"
      });
      patternsFound++;
    }

    // Check for Redis
    if (packageJson.dependencies?.redis || packageJson.dependencies?.ioredis) {
      suggestedConstraints.push({
        template: "Redis Cache Configured",
        templatePath: "performance.redisEnabled",
        confidence: 0.9,
        reason: "Redis client detected"
      });
      patternsFound++;
    }
  }

  // Scan README for documentation clues
  const readmePath = path.join(projectPath, "README.md");
  if (fs.existsSync(readmePath)) {
    docsAnalyzed++;
    const readme = fs.readFileSync(readmePath, "utf-8");

    if (readme.toLowerCase().includes("authentication")) {
      manualReviewRequired.push({
        type: "documentation",
        finding: "README mentions authentication",
        suggestedCategory: "security",
        suggestedSeverity: "critical"
      });
    }

    if (readme.toLowerCase().includes("payment") || readme.toLowerCase().includes("payment")) {
      manualReviewRequired.push({
        type: "documentation",
        finding: "README mentions payments",
        suggestedCategory: "business-logic",
        suggestedSeverity: "critical"
      });
    }

    if (readme.toLowerCase().includes("database") || readme.toLowerCase().includes("migration")) {
      manualReviewRequired.push({
        type: "documentation",
        finding: "README mentions database/migrations",
        suggestedCategory: "data-integrity",
        suggestedSeverity: "high"
      });
    }
  }

  // Scan tsconfig.json
  const tsconfigPath = path.join(projectPath, "tsconfig.json");
  if (fs.existsSync(tsconfigPath)) {
    filesScanned++;
    try {
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"));
      if (tsconfig.compilerOptions?.strict !== true) {
        manualReviewRequired.push({
          type: "config",
          finding: "TypeScript strict mode not enabled",
          suggestedCategory: "code-quality",
          suggestedSeverity: "high"
        });
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  return {
    projectId,
    suggestedConstraints,
    manualReviewRequired,
    sourceAnalysis: {
      filesScanned,
      docsAnalyzed,
      patternsFound
    }
  };
}

/**
 * Extract constraints from README documentation
 */
async function extractFromReadme(
  projectId: string,
  readmePath: string
): Promise<Partial<ExtractionResult>> {
  try {
    const readme = fs.readFileSync(readmePath, "utf-8");
    const manualReviewRequired: ExtractionResult["manualReviewRequired"] = [];

    // Look for constraint keywords in README
    const keywords = {
      "authentication|auth": "security",
      "authorization|permission": "security",
      "database|migration": "data-integrity",
      "test|coverage": "code-quality",
      "performance|optimization": "performance",
      "payment|revenue|billing": "business-logic",
      "deployment|production": "operations",
      "monitoring|alert": "operations"
    };

    Object.entries(keywords).forEach(([pattern, category]) => {
      const regex = new RegExp(pattern, "gi");
      if (regex.test(readme)) {
        manualReviewRequired.push({
          type: "readme-keyword",
          finding: `README mentions "${pattern.split("|")[0]}"`,
          suggestedCategory: category,
          suggestedSeverity: "high"
        });
      }
    });

    return { manualReviewRequired };
  } catch (error) {
    console.error("Failed to extract from README:", error);
    return {};
  }
}

/**
 * Scan code for patterns
 */
async function scanCodeForPatterns(
  projectId: string,
  patterns: string[]
): Promise<Partial<ExtractionResult>> {
  const findings: ExtractionResult["manualReviewRequired"] = [];

  // This would scan actual code files
  // For now, return placeholder

  return { manualReviewRequired: findings };
}

/**
 * Generate constraint suggestions
 */
async function suggestConstraints(
  projectId: string,
  findings: Array<{
    type: string;
    finding: string;
    category: string;
    severity: string;
  }>
): Promise<ConstraintDefinition[]> {
  return findings.map(finding => ({
    id: `${projectId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: finding.finding,
    category: finding.category,
    severity: finding.severity,
    difficulty: "moderate",
    description: `Auto-suggested from project analysis: ${finding.finding}`,
    pattern: "",
    checks: ["manual-review"],
    sla: "Project-specific"
  }));
}
