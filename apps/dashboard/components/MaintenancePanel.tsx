"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import type { MaintenanceBacklogItem, MaintenanceTask } from "@/lib/types";

interface MaintenancePanelProps {
  projectName: string;
}

export function MaintenancePanel({ projectName }: MaintenancePanelProps) {
  const [active, setActive] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [backlog, setBacklog] = useState<MaintenanceBacklogItem[]>([]);
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/maintenance`);
    const data = (await res.json().catch(() => ({}))) as {
      maintenance_loop_active?: boolean;
      backlog?: MaintenanceBacklogItem[];
      tasks?: MaintenanceTask[];
      reason?: string;
    };
    setActive(Boolean(data.maintenance_loop_active));
    setBacklog(Array.isArray(data.backlog) ? data.backlog : []);
    setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    setReason(typeof data.reason === "string" ? data.reason : null);
  }, [projectName]);

  useEffect(() => {
    void load();
  }, [load]);

  const createTask = async (item: MaintenanceBacklogItem) => {
    setCreating(item.id);
    setError(null);
    try {
      const res = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/maintenance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backlog_id: item.id }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `Failed with status ${res.status}`);
      }
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(null);
    }
  };

  return (
    <div
      style={{
        marginBottom: "1.5rem",
        paddingBottom: "1rem",
        borderBottom: "0.5px solid var(--ink-border-faint)",
      }}
    >
      <div
        style={{
          fontSize: "9px",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-text-4)",
          marginBottom: "0.5rem",
        }}
      >
        Maintenance backlog
      </div>
      <div
        style={{
          fontSize: "10px",
          fontFamily: "var(--font-mono)",
          color: active ? "var(--ink-text-4)" : "var(--ink-amber)",
          lineHeight: 1.45,
          marginBottom: "0.75rem",
        }}
      >
        {active
          ? `${backlog.length} backlog item${backlog.length === 1 ? "" : "s"} · ${tasks.length} task plan${tasks.length === 1 ? "" : "s"}`
          : `Maintenance loop inactive${reason ? `: ${reason}` : ""}`}
      </div>
      {error && (
        <div
          style={{
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-red)",
            marginBottom: "0.75rem",
            padding: "0.5rem",
            background: "rgba(255, 0, 0, 0.05)",
            borderRadius: "3px",
          }}
        >
          Error: {error}
        </div>
      )}
      {backlog.slice(0, 5).map((item) => (
        <div
          key={item.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.75rem",
            alignItems: "flex-start",
            padding: "0.5rem 0",
            borderTop: "0.5px solid var(--ink-border-faint)",
          }}
        >
          <div>
            <div style={{ fontSize: "12px", color: "var(--ink-text)", marginBottom: "0.2rem" }}>
              {item.title}
            </div>
            <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)" }}>
              {item.priority} · {item.severity} · {item.next_action} · {item.canonical_status}
            </div>
          </div>
          {active && item.next_action === "plan_task" && (
            <button
              type="button"
              onClick={() => void createTask(item)}
              disabled={creating === item.id}
              style={{ fontSize: "10px", fontFamily: "var(--font-mono)", padding: "3px 8px" }}
            >
              {creating === item.id ? "…" : "plan task"}
            </button>
          )}
        </div>
      ))}
      {tasks.length > 0 && (
        <div style={{ marginTop: "0.75rem", fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)" }}>
          Latest task: {tasks[0].title} · {tasks[0].status}
        </div>
      )}
    </div>
  );
}
