import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository-instance";
import type { MaintenanceBacklogItem, MaintenanceTask } from "@/lib/types";
import {
  createMaintenanceTask,
  listMaintenanceBacklogForProject,
  listMaintenanceTasksForProject,
  updateMaintenanceBacklogStatus,
  updateMaintenanceTaskStatus,
} from "@/lib/maintenance-store";
import { normalizeMaintenanceBacklog } from "@/lib/maintenance-backlog";
import { hasSupabaseProjectsStore } from "@/lib/store-supabase";
import { apiErrorMessage } from "@/lib/api-error";

type Params = { params: Promise<{ name: string }> };

function planFromBacklog(item: MaintenanceBacklogItem): Omit<MaintenanceTask, "id" | "created_at" | "updated_at"> {
  return {
    project_name: item.project_name,
    backlog_id: item.id,
    title: item.title,
    intended_outcome: item.summary || `Resolve backlog item: ${item.title}`,
    status: item.risk_class === "low" ? "ready" : "draft",
    target_domains: [],
    target_files: [],
    risk_class: item.risk_class,
    verification_profile: item.next_action === "verify" ? "targeted" : "manual",
    verification_commands: [],
    rollback_notes: undefined,
    notes: `Generated from backlog item ${item.id}`,
    provenance: {
      backlog_id: item.id,
      finding_id: item.finding_ids[0],
      manifest_revision: item.provenance?.manifest_revision,
      source_type: item.source_type,
    },
  };
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { name } = await params;
    const projectName = decodeURIComponent(name);
    const repo = getRepository();
    const project = await repo.getByName(projectName);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!hasSupabaseProjectsStore()) {
      return NextResponse.json({
        maintenance_loop_active: false,
        backlog: normalizeMaintenanceBacklog(project.name, project.findings, project.maintenanceBacklog ?? []),
        tasks: project.maintenanceTasks ?? [],
        reason: "DATABASE_URL + maintenance migrations required",
      });
    }

    const [backlog, tasks] = await Promise.all([
      listMaintenanceBacklogForProject(project.name),
      listMaintenanceTasksForProject(project.name),
    ]);

    return NextResponse.json({
      maintenance_loop_active: true,
      backlog,
      tasks,
    });
  } catch (error) {
    console.error("GET /api/projects/[name]/maintenance", error);
    return NextResponse.json({
      maintenance_loop_active: false,
      backlog: [],
      tasks: [],
      reason: apiErrorMessage(error),
    });
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { name } = await params;
    const projectName = decodeURIComponent(name);
    if (!hasSupabaseProjectsStore()) {
      return NextResponse.json(
        { error: "DATABASE_URL + maintenance migrations required" },
        { status: 503 }
      );
    }
    const body = (await request.json().catch(() => ({}))) as {
      backlog_id?: string;
      title?: string;
      intended_outcome?: string;
      action?: "create" | "promote";
      task_id?: string;
    };

    // Promote draft task to ready
    if (body.action === "promote" && body.task_id) {
      const tasks = await listMaintenanceTasksForProject(projectName);
      const task = tasks.find((t) => t.id === body.task_id);
      if (!task) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }
      if (task.status !== "draft") {
        return NextResponse.json(
          { error: `Task already ${task.status}; can only promote draft tasks` },
          { status: 400 }
        );
      }
      const updated = await updateMaintenanceTaskStatus(body.task_id, "ready");
      return NextResponse.json({ task: updated, status: "promoted" }, { status: 200 });
    }

    if (!body.backlog_id || typeof body.backlog_id !== "string") {
      return NextResponse.json({ error: "backlog_id is required" }, { status: 400 });
    }
    const backlog = await listMaintenanceBacklogForProject(projectName);
    const item = backlog.find((candidate) => candidate.id === body.backlog_id);
    if (!item) {
      return NextResponse.json({ error: "Backlog item not found" }, { status: 404 });
    }
    const task = await createMaintenanceTask({
      ...planFromBacklog(item),
      title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : item.title,
      intended_outcome:
        typeof body.intended_outcome === "string" && body.intended_outcome.trim()
          ? body.intended_outcome.trim()
          : item.summary || `Resolve backlog item: ${item.title}`,
    });
    await updateMaintenanceBacklogStatus(item.id, "planned", "review");
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects/[name]/maintenance", error);
    return NextResponse.json({ error: apiErrorMessage(error) }, { status: 500 });
  }
}
