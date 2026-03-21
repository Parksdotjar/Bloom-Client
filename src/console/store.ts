import { useCallback, useMemo, useState } from 'react';
import { CONSOLE_HISTORY_KEY } from '../constants/console';
import type { ConsoleOutputEntry, ConsoleOutputKind } from './types';

function nowId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readStoredHistory(): string[] {
  try {
    const raw = localStorage.getItem(CONSOLE_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) as string[] : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value) => typeof value === 'string').slice(-200);
  } catch {
    return [];
  }
}

function writeStoredHistory(history: string[]) {
  localStorage.setItem(CONSOLE_HISTORY_KEY, JSON.stringify(history.slice(-200)));
}

export function useBloomConsoleStore(persistHistory: boolean) {
  const [entries, setEntries] = useState<ConsoleOutputEntry[]>([]);
  const [history, setHistory] = useState<string[]>(() => (persistHistory ? readStoredHistory() : []));

  const pushEntry = useCallback((kind: ConsoleOutputKind, text: string) => {
    setEntries((current) => [
      ...current,
      {
        id: nowId(),
        kind,
        text,
        atMs: Date.now()
      }
    ]);
  }, []);

  const pushLines = useCallback((kind: Exclude<ConsoleOutputKind, 'command'>, lines: string[]) => {
    setEntries((current) => [
      ...current,
      ...lines.map((text) => ({
        id: nowId(),
        kind,
        text,
        atMs: Date.now()
      }))
    ]);
  }, []);

  const clearEntries = useCallback(() => {
    setEntries([]);
  }, []);

  const pushHistory = useCallback((value: string) => {
    const nextValue = value.trim();
    if (!nextValue) return;
    setHistory((current) => {
      const withoutDup = current.filter((item) => item !== nextValue);
      const next = [...withoutDup, nextValue].slice(-200);
      if (persistHistory) {
        writeStoredHistory(next);
      }
      return next;
    });
  }, [persistHistory]);

  const setPersistedHistory = useCallback((enabled: boolean) => {
    if (enabled) {
      writeStoredHistory(history);
      return;
    }
    localStorage.removeItem(CONSOLE_HISTORY_KEY);
  }, [history]);

  const api = useMemo(() => ({
    entries,
    history,
    pushEntry,
    pushLines,
    clearEntries,
    pushHistory,
    setPersistedHistory
  }), [clearEntries, entries, history, pushEntry, pushHistory, pushLines, setPersistedHistory]);

  return api;
}
