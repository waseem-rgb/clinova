import React, { useEffect, useMemo, useRef, useState } from "react";

type InlineTypeaheadProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  fetchSuggestions: (text: string) => Promise<string[]>;
  delimiter?: string;
};

function getActiveToken(value: string, delimiter?: string) {
  if (!delimiter) {
    return { token: value, start: 0 };
  }
  const idx = value.lastIndexOf(delimiter);
  const start = idx >= 0 ? idx + 1 : 0;
  const token = value.slice(start).trim();
  return { token, start };
}

function applySuggestion(value: string, suggestion: string, delimiter?: string) {
  if (!delimiter) return suggestion;
  const idx = value.lastIndexOf(delimiter);
  const base = idx >= 0 ? value.slice(0, idx + 1) : "";
  const trimmedBase = base.trimEnd();
  const sep = trimmedBase.endsWith(delimiter) ? " " : "";
  return `${trimmedBase}${sep}${suggestion}`.trim();
}

export default function InlineTypeahead({ value, onChange, placeholder, multiline, fetchSuggestions, delimiter }: InlineTypeaheadProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [ghost, setGhost] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const { token } = useMemo(() => getActiveToken(value, delimiter), [value, delimiter]);

  useEffect(() => {
    if (token.trim().length < 2) {
      setGhost("");
      setSuggestions([]);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const t = window.setTimeout(async () => {
      try {
        const list = await fetchSuggestions(token.trim());
        if (ac.signal.aborted) return;
        setSuggestions(list || []);
      } catch {
        setSuggestions([]);
      }
    }, 200);
    return () => window.clearTimeout(t);
  }, [token, fetchSuggestions]);

  useEffect(() => {
    if (!token || !suggestions.length) {
      setGhost("");
      return;
    }
    const match = suggestions.find((s) => s.toLowerCase().startsWith(token.toLowerCase()));
    if (match && match.length > token.length) {
      setGhost(match.slice(token.length));
    } else {
      setGhost("");
    }
  }, [token, suggestions]);

  function acceptSuggestion() {
    if (!ghost) return;
    const full = `${token}${ghost}`;
    onChange(applySuggestion(value, full, delimiter));
    setGhost("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if ((e.key === "Tab" || e.key === "ArrowRight") && ghost) {
      e.preventDefault();
      acceptSuggestion();
      return;
    }
    if (e.key === "Escape") {
      setGhost("");
      setShowDropdown(false);
      return;
    }
    if (e.key === " " && e.ctrlKey) {
      e.preventDefault();
      setShowDropdown((v) => !v);
    }
  }

  const ghostValue = ghost ? `${value}${ghost}` : value;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          color: "var(--muted)",
          opacity: 0.4,
          whiteSpace: multiline ? "pre-wrap" : "pre",
          padding: 10,
          fontSize: 14,
          fontFamily: "inherit",
          lineHeight: "1.4",
        }}
      >
        {ghostValue}
      </div>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={onKeyDown}
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--ink)",
            width: "100%",
            minHeight: 80,
            position: "relative",
            zIndex: 1,
          }}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={onKeyDown}
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--ink)",
            width: "100%",
            position: "relative",
            zIndex: 1,
          }}
        />
      )}
      {showDropdown && suggestions.length > 0 && (
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => {
                onChange(applySuggestion(value, s, delimiter));
                setShowDropdown(false);
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                cursor: "pointer",
                fontWeight: 700,
                color: "var(--ink)",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
