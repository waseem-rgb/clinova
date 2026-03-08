// frontend/src/components/AutocompleteDropdown.tsx
import React, { useEffect, useRef, useState, useCallback } from "react";

export interface AutocompleteItem {
  id: string;
  text: string;
  subtitle?: string;
  badge?: string;   // e.g. "TOPIC" for structured topic pages
  href?: string;    // if set, caller uses this for navigation in onSelect
}

interface AutocompleteDropdownProps {
  query: string;
  fetchSuggestions: (q: string, signal: AbortSignal) => Promise<AutocompleteItem[]>;
  onSelect: (item: AutocompleteItem) => void;
  minChars?: number;
  debounceMs?: number;
  maxItems?: number;
  placeholder?: string;
  inputStyle?: React.CSSProperties;
  containerStyle?: React.CSSProperties;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
}

// In-memory cache with TTL
const suggestionCache = new Map<string, { data: AutocompleteItem[]; timestamp: number }>();
const CACHE_TTL_MS = 60_000; // 60 seconds
const CACHE_MAX_SIZE = 200;

function getCached(key: string): AutocompleteItem[] | null {
  const entry = suggestionCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    suggestionCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: AutocompleteItem[]) {
  // Enforce max size
  if (suggestionCache.size >= CACHE_MAX_SIZE) {
    const oldestKey = suggestionCache.keys().next().value;
    if (oldestKey) suggestionCache.delete(oldestKey);
  }
  suggestionCache.set(key, { data, timestamp: Date.now() });
}

export default function AutocompleteDropdown({
  query: externalQuery,
  fetchSuggestions,
  onSelect,
  minChars = 2,
  debounceMs = 200,
  maxItems = 12,
  placeholder = "Type to search...",
  inputStyle,
  containerStyle,
  value,
  onChange,
  onSubmit,
}: AutocompleteDropdownProps) {
  const [internalValue, setInternalValue] = useState(externalQuery || "");
  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  const currentValue = value !== undefined ? value : internalValue;

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    if (onChange) {
      onChange(newVal);
    } else {
      setInternalValue(newVal);
    }
    setActiveIndex(-1);
  }, [onChange]);

  // Fetch suggestions with debounce and caching
  useEffect(() => {
    const q = currentValue.trim();
    
    if (q.length < minChars) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    // Check cache first
    const cached = getCached(q.toLowerCase());
    if (cached) {
      setSuggestions(cached.slice(0, maxItems));
      setOpen(true);
      return;
    }

    // Clear previous debounce
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(async () => {
      // Cancel previous in-flight request
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        setLoading(true);
        const results = await fetchSuggestions(q, ac.signal);
        const limited = results.slice(0, maxItems);
        setCache(q.toLowerCase(), limited);
        setSuggestions(limited);
        setOpen(true);
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error("Autocomplete fetch error:", err);
          setSuggestions([]);
        }
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [currentValue, minChars, debounceMs, maxItems, fetchSuggestions]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) {
      if (e.key === "Enter" && onSubmit) {
        e.preventDefault();
        onSubmit(currentValue);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, -1));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          handleSelect(suggestions[activeIndex]);
        } else if (onSubmit) {
          onSubmit(currentValue);
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }, [open, suggestions, activeIndex, currentValue, onSubmit]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: "nearest" });
      }
    }
  }, [activeIndex]);

  const handleSelect = useCallback((item: AutocompleteItem) => {
    onSelect(item);
    setOpen(false);
    setActiveIndex(-1);
    if (onChange) {
      onChange(item.text);
    } else {
      setInternalValue(item.text);
    }
  }, [onSelect, onChange]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        const listEl = listRef.current;
        if (listEl && !listEl.contains(e.target as Node)) {
          setOpen(false);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Highlight matching text
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} style={{ background: "rgba(14,165,164,0.3)", padding: 0, borderRadius: 2 }}>
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div style={{ position: "relative", width: "100%", ...containerStyle }}>
      <input
        ref={inputRef}
        type="text"
        value={currentValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="autocomplete-listbox"
        role="combobox"
        style={{
          width: "100%",
          padding: "16px 20px",
          fontSize: 18,
          border: "1px solid var(--border)",
          borderRadius: open && suggestions.length > 0 ? "16px 16px 0 0" : 16,
          background: "var(--surface)",
          color: "var(--ink)",
          outline: "none",
          ...inputStyle,
        }}
      />
      
      {loading && (
        <div
          style={{
            position: "absolute",
            right: 16,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--muted)",
            fontSize: 12,
          }}
        >
          ⏳
        </div>
      )}

      {open && suggestions.length > 0 && (
        <ul
          ref={listRef}
          id="autocomplete-listbox"
          role="listbox"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            margin: 0,
            padding: 0,
            listStyle: "none",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderTop: "none",
            borderRadius: "0 0 16px 16px",
            maxHeight: 360,
            overflowY: "auto",
            zIndex: 1000,
            boxShadow: "0 12px 32px rgba(15,23,42,0.12)",
          }}
        >
          {suggestions.map((item, idx) => (
            <li
              key={item.id}
              role="option"
              aria-selected={idx === activeIndex}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setActiveIndex(idx)}
              style={{
                padding: "12px 20px",
                cursor: "pointer",
                background: idx === activeIndex ? "var(--surface-2)" : "transparent",
                borderBottom: idx < suggestions.length - 1 ? "1px solid var(--border)" : "none",
                transition: "background 0.1s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 600, color: "var(--ink)", flex: 1 }}>
                  {highlightMatch(item.text, currentValue)}
                </span>
                {item.badge && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 3,
                    color: "var(--brand)", border: "1px solid var(--brand-border)",
                    letterSpacing: 0.4, textTransform: "uppercase", flexShrink: 0,
                    fontFamily: "var(--font-mono, monospace)",
                  }}>
                    {item.badge}
                  </span>
                )}
              </div>
              {item.subtitle && (
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  {item.subtitle}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
