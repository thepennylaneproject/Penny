"use client";

import { useState, useEffect } from "react";

/**
 * Hook to persist state to localStorage and restore on mount.
 * Syncs state back to localStorage on every change.
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(initialValue);

  // Read from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        setStoredValue(JSON.parse(item) as T);
      }
    } catch {
      console.warn(`localStorage error reading key "${key}"`);
    }
  }, [key]);

  // Write to localStorage whenever value changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch {
      console.warn(`localStorage error writing key "${key}"`);
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue];
}
