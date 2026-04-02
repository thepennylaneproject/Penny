"use client";

import { useLayoutEffect, useEffect } from "react";
import type { NavView } from "@/components/Shell";
import {
  readPortfolioStateFromSearch,
  searchStringForPortfolioState,
} from "@/lib/portfolio-url-state";

type PortfolioRouter = {
  replace: (href: string, options?: { scroll?: boolean }) => void;
};

/**
 * Reads `?project` / `?view` from the URL into React state on mount and on browser
 * back/forward (popstate). Pairs with useSyncPortfolioUrl for user-driven state → URL.
 */
export function useSyncUrlToPortfolioState(
  setActiveProject: (name: string | null) => void,
  setActiveView: (view: NavView) => void
) {
  useLayoutEffect(() => {
    const read = () => {
      const { project, activeView } = readPortfolioStateFromSearch(
        window.location.search
      );
      setActiveProject(project);
      setActiveView(activeView);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [setActiveProject, setActiveView]);
}

export function useSyncPortfolioUrl(
  activeView: NavView,
  activeProject: string | null,
  pathname: string,
  router: PortfolioRouter
) {
  useEffect(() => {
    const next = searchStringForPortfolioState(activeView, activeProject, pathname);
    if (typeof window !== "undefined") {
      const cur = `${window.location.pathname}${window.location.search}`;
      if (cur !== next) router.replace(next, { scroll: false });
    }
  }, [activeView, activeProject, pathname, router]);
}
