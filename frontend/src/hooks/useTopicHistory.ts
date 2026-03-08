// frontend/src/hooks/useTopicHistory.ts
// localStorage-backed recently viewed topics + bookmarks
import { useState, useCallback } from "react";

const HISTORY_KEY  = "clinova_topic_history";
const BOOKMARKS_KEY = "clinova_topic_bookmarks";
const MAX_HISTORY  = 20;

export interface HistoryEntry {
  slug: string;
  title: string;
  icd10?: string;
  specialty?: string[];
  visitedAt: number;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function useTopicHistory() {
  const [history,   setHistory]   = useState<HistoryEntry[]>(() => load<HistoryEntry[]>(HISTORY_KEY,  []));
  const [bookmarks, setBookmarks] = useState<string[]>(      () => load<string[]>(       BOOKMARKS_KEY, []));

  const addToHistory = useCallback((entry: Omit<HistoryEntry, "visitedAt">) => {
    setHistory((prev) => {
      const deduped = prev.filter((h) => h.slug !== entry.slug);
      const next = [{ ...entry, visitedAt: Date.now() }, ...deduped].slice(0, MAX_HISTORY);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleBookmark = useCallback((slug: string) => {
    setBookmarks((prev) => {
      const next = prev.includes(slug)
        ? prev.filter((b) => b !== slug)
        : [slug, ...prev];
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isBookmarked = useCallback(
    (slug: string) => bookmarks.includes(slug),
    [bookmarks]
  );

  const clearHistory = useCallback(() => {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  }, []);

  return { history, bookmarks, addToHistory, toggleBookmark, isBookmarked, clearHistory };
}
