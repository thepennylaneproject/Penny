/**
 * Constraints API
 * Manage project constraints from dashboard
 */

import { NextRequest, NextResponse } from "next/server";
import { ConstraintManager } from "@/lib/constraint-manager";

const manager = new ConstraintManager();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project");
    const action = searchParams.get("action");

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID required" },
        { status: 400 }
      );
    }

    switch (action) {
      case "list":
        const constraints = await manager.getProjectConstraints(projectId);
        return NextResponse.json({ constraints });

      case "stats":
        const stats = await manager.getConstraintStats(projectId);
        return NextResponse.json({ stats });

      case "templates":
        const templates = manager.getAvailableTemplates();
        return NextResponse.json({ templates });

      case "export":
        const csv = await manager.exportAsCSV(projectId);
        return new NextResponse(csv, {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="${projectId}-constraints.csv"`
          }
        });

      default:
        return NextResponse.json(
          { error: "Unknown action" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Constraints API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, action, data } = body;

    if (!projectId || !action) {
      return NextResponse.json(
        { error: "Project ID and action required" },
        { status: 400 }
      );
    }

    switch (action) {
      case "save":
        // Save a single constraint
        const constraint = data.constraint;
        const validation = manager.validateConstraint(constraint);

        if (!validation.valid) {
          return NextResponse.json(
            { error: "Invalid constraint", details: validation.errors },
            { status: 400 }
          );
        }

        await manager.saveConstraint(projectId, constraint, data.modifiedBy);
        return NextResponse.json({ success: true, constraint });

      case "delete":
        // Delete a constraint
        const constraintId = data.constraintId;
        await manager.deleteConstraint(projectId, constraintId);
        return NextResponse.json({ success: true });

      case "applyTemplate":
        // Apply a template
        const { templatePath, overrides } = data;
        const newConstraint = manager.applyTemplate(projectId, templatePath, overrides);
        return NextResponse.json({ constraint: newConstraint });

      case "bulkUpsert":
        // Bulk update constraints (from extraction)
        const constraints = data.constraints;
        await manager.bulkUpsertConstraints(projectId, constraints, data.modifiedBy);
        return NextResponse.json({ success: true, count: constraints.length });

      case "import":
        // Import from CSV
        const csvContent = data.csv;
        const imported = await manager.importFromCSV(projectId, csvContent);
        return NextResponse.json({ success: true, count: imported.length });

      default:
        return NextResponse.json(
          { error: "Unknown action" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Constraints API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
