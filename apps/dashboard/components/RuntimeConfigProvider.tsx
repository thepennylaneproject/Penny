"use client";

import { createContext, useContext } from "react";

interface RuntimeConfigContextValue {
  laneBaseUrl: string | null;
  laneServerConfigured: boolean;
}

const RuntimeConfigContext = createContext<RuntimeConfigContextValue>({
  laneBaseUrl: null,
  laneServerConfigured: false,
});

export function RuntimeConfigProvider({
  laneBaseUrl,
  laneServerConfigured,
  children,
}: RuntimeConfigContextValue & { children: React.ReactNode }) {
  return (
    <RuntimeConfigContext.Provider value={{ laneBaseUrl, laneServerConfigured }}>
      {children}
    </RuntimeConfigContext.Provider>
  );
}

export function useRuntimeConfig(): RuntimeConfigContextValue {
  return useContext(RuntimeConfigContext);
}
