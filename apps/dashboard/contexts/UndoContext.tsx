"use client";

/**
 * UndoContext — manages undo state for destructive actions.
 *
 * Provides a context for tracking recently performed destructive actions
 * and allowing users to undo them within a 5-second window.
 */

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import {
  isUndoValid,
  getRemainingUndoTime,
  type UndoState,
  type UndoContextValue,
  UNDO_SUCCESS_EVENT,
  type UndoSuccessDetail,
} from "@/lib/undo-machine";

const UndoContext = createContext<UndoContextValue | undefined>(undefined);

export interface UndoProviderProps {
  children: React.ReactNode;
}

export function UndoProvider({ children }: UndoProviderProps) {
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [remainingTime, setRemainingTime] = useState(0);
  const [isUndoing, setIsUndoing] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);

  // Timer for updating remaining time
  useEffect(() => {
    if (!undoState || !isUndoValid(undoState)) {
      setUndoState(null);
      setRemainingTime(0);
      setUndoError(null);
      setIsUndoing(false);
      return;
    }

    setRemainingTime(getRemainingUndoTime(undoState));
    const interval = setInterval(() => {
      const remaining = getRemainingUndoTime(undoState);
      setRemainingTime(remaining);

      if (remaining <= 0) {
        setUndoState(null);
        setRemainingTime(0);
        setUndoError(null);
        setIsUndoing(false);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [undoState]);

  const canUndo = undoState !== null && isUndoValid(undoState);

  const undo = useCallback(async () => {
    if (!undoState || isUndoing) return;

    setIsUndoing(true);
    setUndoError(null);
    try {
      await undoState.performUndo();
      const detail: UndoSuccessDetail = {
        action: undoState.action,
        data: undoState.data,
      };
      window.dispatchEvent(new CustomEvent<UndoSuccessDetail>(UNDO_SUCCESS_EVENT, { detail }));
      setUndoState(null);
      setRemainingTime(0);
    } catch (error) {
      setUndoError(error instanceof Error ? error.message : "Undo failed.");
    } finally {
      setIsUndoing(false);
    }
  }, [isUndoing, undoState]);

  const clear = useCallback(() => {
    setUndoState(null);
    setRemainingTime(0);
    setUndoError(null);
    setIsUndoing(false);
  }, []);

  const value: UndoContextValue = {
    undoState,
    canUndo,
    remainingTime,
    isUndoing,
    undoError,
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
