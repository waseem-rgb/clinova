// frontend/src/components/TopicSearchDropdown.tsx
// Inline topic search with grouped dropdown (saved + all matches)
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

interface TopicResult {
  slug: string;
  title: string;
  icd10?: string;
  specialty?: string[];
}

interface TopicSearchDropdownProps {
  placeholder?: string;
  bookmarkedSlugs?: string[];
  onQueryChange?: (q: string) => void;
}

function CategoryLabel({ label, first }: { label: string; first?: boolean }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
      textTransform: "uppercase", color: "var(--text-muted)",
      padding: "8px 14px 4px",
      borderTop: first ? "none" : "1px solid var(--border)",
    }}>
      {label}
    </div>
  );
}

export default function TopicSearchDropdown({
  placeholder = "Search topics by name, ICD-10, or tag…",
  bookmarkedSlugs = [],
  onQueryChange,
}: TopicSearchDropdownProps) {
  const navigate   = useNavigate();
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState<TopicResult[]>([]);
  const [open,     setOpen]     = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [loading,  setLoading]  = useState(false);

  const inputRef   = useRef<HTMLInputElement>(null);
  const dropRef    = useRef<HTMLUListElement>(null);
  const abortRef   = useRef<AbortController | null>(null);
  const timerRef   = useRef<number | null>(null);

  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      setLoading(true);
      const res = await fetch(`/api/topics/search?q=${encodeURIComponent(q)}`, { signal: ac.signal });
      if (!res.ok) return;
      const data = await res.json();
      setResults(data.results ?? []);
      setOpen(true);
    } catch (e: any) {
      if (e?.name !== "AbortError") setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    onQueryChange?.(query);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => fetchResults(query), 200);
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, [query, fetchResults, onQueryChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const total = results.length;
    if (!open || total === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((p) => Math.min(p + 1, total - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx((p) => Math.max(p - 1, -1)); }
    if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      navigate(`/topics/${results[activeIdx].slug}`);
      setOpen(false);
    }
    if (e.key === "Escape") { setOpen(false); setActiveIdx(-1); }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        !inputRef.current?.contains(e.target as Node) &&
        !dropRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const saved  = results.filter((r) => bookmarkedSlugs.includes(r.slug));
  const others = results.filter((r) => !bookmarkedSlugs.includes(r.slug));

  const renderItem = (item: TopicResult, globalIdx: number) => (
    <li
      key={item.slug}
      role="option"
      aria-selected={globalIdx === activeIdx}
      onClick={() => { navigate(`/topics/${item.slug}`); setOpen(false); }}
      onMouseEnter={() => setActiveIdx(globalIdx)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "9px 14px", cursor: "pointer",
        background: globalIdx === activeIdx ? "var(--bg-raised)" : "transparent",
        transition: "background 0.08s",
      }}
    >
      {item.icd10 && (
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
          color: "var(--brand)", border: "1px solid var(--brand-border)",
          borderRadius: 3, padding: "1px 5px", flexShrink: 0,
        }}>
          {item.icd10}
        </span>
      )}
      <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500, flex: 1 }}>
        {item.title}
      </span>
      {item.specialty?.[0] && (
        <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
          {item.specialty[0]}
        </span>
      )}
    </li>
  );

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActiveIdx(-1); }}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "10px 14px",
          fontSize: 13,
          border: "1px solid var(--border)",
          borderRadius: open && results.length > 0 ? "6px 6px 0 0" : 6,
          background: "var(--bg-surface)",
          color: "var(--text-primary)",
          outline: "none",
          boxSizing: "border-box",
          transition: "border-color 0.1s",
        }}
        onFocusCapture={(e) => { e.currentTarget.style.borderColor = "var(--brand-border)"; }}
        onBlurCapture={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
      />

      {loading && (
        <div style={{
          position: "absolute", right: 12, top: "50%",
          transform: "translateY(-50%)", fontSize: 11, color: "var(--text-muted)",
        }}>
          …
        </div>
      )}

      {open && results.length > 0 && (
        <ul
          ref={dropRef}
          role="listbox"
          style={{
            position: "absolute", top: "100%", left: 0, right: 0,
            margin: 0, padding: 0, listStyle: "none",
            background: "var(--bg-surface)",
            border: "1px solid var(--border)", borderTop: "none",
            borderRadius: "0 0 6px 6px",
            boxShadow: "0 8px 24px rgba(15,23,42,0.10)",
            maxHeight: 320, overflowY: "auto",
            zIndex: 200,
          }}
        >
          {saved.length > 0 && (
            <>
              <CategoryLabel label="Saved Topics" first />
              {saved.map((item, i) => renderItem(item, i))}
            </>
          )}
          {others.length > 0 && (
            <>
              <CategoryLabel label="All Topics" first={saved.length === 0} />
              {others.map((item, i) => renderItem(item, saved.length + i))}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
