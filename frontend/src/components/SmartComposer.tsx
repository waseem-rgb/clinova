/**
 * SmartComposer - Inline typeahead component with ghost text suggestions.
 *
 * Features:
 * - Ghost text inline completion (light gray overlay)
 * - Accept with TAB or → (right arrow)
 * - Dismiss with ESC
 * - Suggestions update while typing
 * - NO dropdown suggestions by default
 * - Optional dropdown on Ctrl+Space
 * - Debounced API calls for suggestions
 *
 * This component is specifically designed for doctor-first UX:
 * - Faster than typing full drug names
 * - Non-intrusive suggestions
 * - Doctor has full control
 */

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { API_BASE } from "../services/api";

export interface Suggestion {
  display: string;
  value: string;
  type?: string;
  generic?: string;
  brand?: string;
  strength?: string;
  [key: string]: unknown;
}

export interface SmartComposerProps {
  /** Current value */
  value: string;
  /** Called when value changes */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Field type for suggestions: drug, frequency, duration, timing, route, form, instruction, diagnosis */
  fieldType?:
    | "drug"
    | "frequency"
    | "duration"
    | "timing"
    | "route"
    | "form"
    | "instruction"
    | "diagnosis"
    | "generic";
  /** Use multiline textarea instead of input */
  multiline?: boolean;
  /** Custom fetch function for suggestions (overrides fieldType) */
  fetchSuggestions?: (text: string) => Promise<Suggestion[]>;
  /** Delimiter for token-based suggestions (e.g., "," for comma-separated) */
  delimiter?: string;
  /** Debounce delay in ms */
  debounceMs?: number;
  /** Max number of suggestions to fetch */
  limit?: number;
  /** Disable the component */
  disabled?: boolean;
  /** Additional class name */
  className?: string;
  /** Input style override */
  style?: React.CSSProperties;
  /** Called when a suggestion is accepted */
  onSuggestionAccepted?: (suggestion: Suggestion) => void;
}

/**
 * Get the active token being typed (last segment after delimiter)
 */
function getActiveToken(
  value: string,
  delimiter?: string
): { token: string; start: number } {
  if (!delimiter) {
    return { token: value, start: 0 };
  }
  const idx = value.lastIndexOf(delimiter);
  const start = idx >= 0 ? idx + 1 : 0;
  const token = value.slice(start).trim();
  return { token, start };
}

/**
 * Apply a suggestion to the current value, respecting delimiter
 */
function applySuggestion(
  value: string,
  suggestion: string,
  delimiter?: string
): string {
  if (!delimiter) return suggestion;
  const idx = value.lastIndexOf(delimiter);
  const base = idx >= 0 ? value.slice(0, idx + 1) : "";
  const trimmedBase = base.trimEnd();
  const sep = trimmedBase.endsWith(delimiter) ? " " : "";
  return `${trimmedBase}${sep}${suggestion}`.trim();
}

/**
 * Default fetch function using the prescription suggest API
 */
async function defaultFetchSuggestions(
  fieldType: string,
  text: string,
  limit: number
): Promise<Suggestion[]> {
  try {
    const res = await fetch(`${API_BASE}/prescription/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field: fieldType,
        text: text,
        limit: limit,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.suggestions || [];
  } catch (e) {
    console.error("Suggestion fetch error:", e);
    return [];
  }
}

export default function SmartComposer({
  value,
  onChange,
  placeholder,
  fieldType = "generic",
  multiline = false,
  fetchSuggestions,
  delimiter,
  debounceMs = 150,
  limit = 8,
  disabled = false,
  className = "",
  style,
  onSuggestionAccepted,
}: SmartComposerProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [ghost, setGhost] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Get the current token being typed
  const { token } = useMemo(
    () => getActiveToken(value, delimiter),
    [value, delimiter]
  );

  // Fetch suggestions when token changes
  useEffect(() => {
    if (token.trim().length < 1) {
      setGhost("");
      setSuggestions([]);
      return;
    }

    // Abort previous request
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const timeoutId = window.setTimeout(async () => {
      try {
        let list: Suggestion[];
        if (fetchSuggestions) {
          list = await fetchSuggestions(token.trim());
        } else {
          list = await defaultFetchSuggestions(fieldType, token.trim(), limit);
        }
        if (ac.signal.aborted) return;
        setSuggestions(list || []);
        setSelectedIndex(0);
      } catch {
        if (!ac.signal.aborted) {
          setSuggestions([]);
        }
      }
    }, debounceMs);

    return () => {
      window.clearTimeout(timeoutId);
      ac.abort();
    };
  }, [token, fetchSuggestions, fieldType, limit, debounceMs]);

  // Update ghost text when suggestions or token changes
  useEffect(() => {
    if (!token || !suggestions.length) {
      setGhost("");
      return;
    }

    // Find best matching suggestion that starts with the token
    const tokenLower = token.toLowerCase();
    const match = suggestions.find((s) => {
      const val = (s.value || s.display || "").toLowerCase();
      return val.startsWith(tokenLower) && val.length > tokenLower.length;
    });

    if (match) {
      const matchValue = match.value || match.display;
      // Ghost is the part of the suggestion after what's already typed
      setGhost(matchValue.slice(token.length));
    } else {
      setGhost("");
    }
  }, [token, suggestions]);

  // Accept the current ghost suggestion
  const acceptGhost = useCallback(() => {
    if (!ghost) return;
    const fullValue = `${token}${ghost}`;
    const newValue = applySuggestion(value, fullValue, delimiter);
    onChange(newValue);
    setGhost("");

    // Find and notify about accepted suggestion
    const accepted = suggestions.find(
      (s) => (s.value || s.display).toLowerCase() === fullValue.toLowerCase()
    );
    if (accepted && onSuggestionAccepted) {
      onSuggestionAccepted(accepted);
    }
  }, [
    ghost,
    token,
    value,
    delimiter,
    onChange,
    suggestions,
    onSuggestionAccepted,
  ]);

  // Accept a specific suggestion from dropdown
  const acceptSuggestion = useCallback(
    (suggestion: Suggestion) => {
      const newValue = applySuggestion(
        value,
        suggestion.value || suggestion.display,
        delimiter
      );
      onChange(newValue);
      setGhost("");
      setShowDropdown(false);
      if (onSuggestionAccepted) {
        onSuggestionAccepted(suggestion);
      }
      inputRef.current?.focus();
    },
    [value, delimiter, onChange, onSuggestionAccepted]
  );

  // Handle keyboard events
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      // Accept ghost with Tab or Right Arrow
      if ((e.key === "Tab" || e.key === "ArrowRight") && ghost) {
        e.preventDefault();
        acceptGhost();
        return;
      }

      // Dismiss with Escape
      if (e.key === "Escape") {
        setGhost("");
        setShowDropdown(false);
        return;
      }

      // Toggle dropdown with Ctrl+Space
      if (e.key === " " && e.ctrlKey) {
        e.preventDefault();
        setShowDropdown((v) => !v);
        return;
      }

      // Dropdown navigation
      if (showDropdown && suggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          acceptSuggestion(suggestions[selectedIndex]);
          return;
        }
      }
    },
    [ghost, acceptGhost, showDropdown, suggestions, selectedIndex, acceptSuggestion]
  );

  // Calculate ghost value for overlay
  const ghostValue = ghost ? `${value}${ghost}` : value;

  // Common input styles
  const inputStyles: React.CSSProperties = {
    padding: 10,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--ink)",
    width: "100%",
    position: "relative",
    zIndex: 1,
    fontSize: 14,
    fontFamily: "inherit",
    lineHeight: "1.5",
    ...style,
  };

  return (
    <div style={{ position: "relative", width: "100%" }} className={className}>
      {/* Ghost text overlay */}
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
          lineHeight: "1.5",
          overflow: "hidden",
        }}
        aria-hidden="true"
      >
        {ghostValue}
      </div>

      {/* Input element */}
      {multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            ...inputStyles,
            minHeight: 80,
            resize: "vertical",
          }}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          style={inputStyles}
        />
      )}

      {/* Hint text */}
      {ghost && !showDropdown && (
        <div
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 11,
            color: "var(--muted)",
            opacity: 0.7,
            pointerEvents: "none",
          }}
        >
          TAB to accept
        </div>
      )}

      {/* Dropdown (shown on Ctrl+Space) */}
      {showDropdown && suggestions.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 100,
            maxHeight: 250,
            overflowY: "auto",
          }}
        >
          {suggestions.map((s, idx) => (
            <div
              key={s.value || s.display}
              onClick={() => acceptSuggestion(s)}
              onMouseEnter={() => setSelectedIndex(idx)}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                background:
                  idx === selectedIndex
                    ? "rgba(14,165,164,0.1)"
                    : "transparent",
                borderBottom:
                  idx < suggestions.length - 1
                    ? "1px solid var(--border)"
                    : "none",
              }}
            >
              <div style={{ fontWeight: 600, color: "var(--ink)" }}>
                {s.display}
              </div>
              {s.type && (
                <div
                  style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}
                >
                  {s.type}
                  {s.generic && s.type === "brand" && ` • ${s.generic}`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Quick suggestions pills (shown when dropdown not visible) */}
      {!showDropdown &&
        suggestions.length > 0 &&
        token.length >= 2 &&
        suggestions.length <= 5 && (
          <div
            style={{
              marginTop: 6,
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {suggestions.slice(0, 4).map((s) => (
              <button
                key={s.value || s.display}
                type="button"
                onClick={() => acceptSuggestion(s)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--ink)",
                }}
              >
                {s.display.length > 30
                  ? s.display.slice(0, 30) + "…"
                  : s.display}
              </button>
            ))}
            {suggestions.length > 4 && (
              <button
                type="button"
                onClick={() => setShowDropdown(true)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "var(--muted)",
                }}
              >
                +{suggestions.length - 4} more
              </button>
            )}
          </div>
        )}
    </div>
  );
}
