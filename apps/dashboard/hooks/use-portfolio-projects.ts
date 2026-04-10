"use client";

import { useState, useCallback } from "react";
import type { Project } from "@/lib/types";
import { apiFetch } from "@/lib/api-fetch";
import { DASHBOARD_MISCONFIGURED_MESSAGE } from "@/lib/dashboard-messages";

export function usePortfolioProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [hostMisconfigured, setHostMisconfigured] = useState<string | null>(null);
  const [loginHint, setLoginHint] = useState<string | null>(null);

  const fetchProjectByName = useCallback(async (name: string) => {
    setProjectsError(null);
    setHostMisconfigured(null);
    try {
      const res = await apiFetch(`/api/projects/${encodeURIComponent(name)}`);
      if (res.status === 503) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (body.error === "misconfigured") {
          setHostMisconfigured(
            typeof body.message === "string" ? body.message : DASHBOARD_MISCONFIGURED_MESSAGE
          );
          setProjects([]);
          setNeedsAuth(false);
          return;
        }
        setProjectsError(`Could not load project (${res.status}). Try again.`);
        setProjects([]);
        setNeedsAuth(false);
        return;
      }
      if (res.status === 401) {
        setLoginHint(
          "If you were already signed in, your Supabase session may have expired. Sign in again."
        );
        setNeedsAuth(true);
        setProjects([]);
        return;
      }
      setNeedsAuth(false);
      setLoginHint(null);
      if (res.status === 404) {
        setProjects([]);
        return;
      }
      if (!res.ok) {
        setProjectsError(`Could not load project (${res.status}). Try again.`);
        setProjects([]);
        return;
      }
      const project = (await res.json()) as Project;
      setProjects(project?.name ? [project] : []);
    } catch (e) {
      console.error("Failed to fetch project", e);
      setProjectsError(
        e instanceof Error ? e.message : "Network error loading project."
      );
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    setProjectsError(null);
    setHostMisconfigured(null);
    try {
      const res = await apiFetch("/api/projects");
      if (res.status === 503) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (body.error === "misconfigured") {
          setHostMisconfigured(
            typeof body.message === "string" ? body.message : DASHBOARD_MISCONFIGURED_MESSAGE
          );
          setProjects([]);
          setNeedsAuth(false);
          return;
        }
        setProjectsError(`Could not load projects (${res.status}). Try again.`);
        setProjects([]);
        setNeedsAuth(false);
        return;
      }
      if (res.status === 401) {
        setLoginHint(
          "If you were already signed in, your Supabase session may have expired. Sign in again."
        );
        setNeedsAuth(true);
        setProjects([]);
        return;
      }
      setNeedsAuth(false);
      setLoginHint(null);
      if (!res.ok) {
        setProjectsError(`Could not load projects (${res.status}). Try again.`);
        setProjects([]);
        return;
      }
      const data = await res.json();
      setProjects(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to fetch projects", e);
      setProjectsError(
        e instanceof Error ? e.message : "Network error loading projects."
      );
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    projects,
    setProjects,
    loading,
    setLoading,
    needsAuth,
    projectsError,
    hostMisconfigured,
    setHostMisconfigured,
    loginHint,
    setLoginHint,
    fetchProjects,
    fetchProjectByName,
  };
}
