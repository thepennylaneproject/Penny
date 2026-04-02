import type { NavView } from "@/components/Shell";

/** URL → state: project open always implies portfolio nav context. */
export function readPortfolioStateFromSearch(search: string): {
  project: string | null;
  activeView: NavView;
} {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const name = q.get("project")?.trim() || null;
  const v = q.get("view");
  if (name) return { project: name, activeView: "portfolio" };
  if (v === "engine") return { project: null, activeView: "engine" };
  if (v === "jobs") return { project: null, activeView: "jobs" };
  return { project: null, activeView: "portfolio" };
}

/** State → query: never write view alongside project (project implies portfolio nav context). */
export function searchStringForPortfolioState(
  activeView: NavView,
  activeProject: string | null,
  pathname: string
): string {
  const params = new URLSearchParams();
  if (activeView === "engine" && !activeProject) params.set("view", "engine");
  if (activeView === "jobs" && !activeProject) params.set("view", "jobs");
  if (activeProject) params.set("project", activeProject);
  const nextQs = params.toString();
  return nextQs ? `${pathname}?${nextQs}` : pathname;
}
