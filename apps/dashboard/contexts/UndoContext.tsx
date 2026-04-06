"use client";

/**
 * UndoContext — manages undo state for destructive actions.
 *
 * Provides a context for tracking recently performed destructive actions
 * and allowing users to undo them within a 5-second window.
 */

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { UndoState, UndoContextValue } from "@/lib/undo-machine";
import { isUndoValid, getRemainingUndoTime } from "@/lib/undo-machine";

const UndoContext = createContext<UndoContextValue | undefined>(undefined);

export interface UndoProviderProps {
  children: React.ReactNode;
}

export function UndoProvider({ children }: UndoProviderProps) {
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [remainingTime, setRemainingTime] = useState(0);

  // Timer for updating remaining time
  useEffect(() => {
    if (!undoState || !isUndoValid(undoState)) {
      setUndoState(null);
      setRemainingTime(0);
      return;
    }

    const interval = setInterval(() => {
      const remaining = getRemainingUndoTime(undoState);
      setRemainingTime(remaining);
      
      if (remaining <= 0) {
        setUndoState(null);
        setRemainingTime(0);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [undoState]);

  const canUndo = undoState !== null && isUndoValid(undoState);

  const undo = useCallback(async () => {
    if (!undoState) return;

    // Caller should handle the actual undo operation
    // This just clears the undo state
    setUndoState(null);
    setRemainingTime(0);
  }, [undoState]);

  const clear = useCallback(() => {
    setUndoState(null);
    setRemainingTime(0);
  }, []);

  const value: UndoContextValue = {
    undoState,
    canUndo,
    remainingTime,
    undo,
    clear,
    setUndoState,
  };

  return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>;
}

/**
 * Hook to access undo context.
 * Must be used within UndoProvider.
 */
export function useUndo(): UndoContextValue {
  const context = useContext(UndoContext);
  if (context === undefined) {
    throw new Error("useUndo must be used within UndoProvider");
  }
  return context;
}
