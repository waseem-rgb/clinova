import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// frontend/src/components/AutocompleteDropdown.tsx
import { useEffect, useRef, useState, useCallback } from "react";
// In-memory cache with TTL
const suggestionCache = new Map();
const CACHE_TTL_MS = 60000; // 60 seconds
const CACHE_MAX_SIZE = 200;
function getCached(key) {
    const entry = suggestionCache.get(key);
    if (!entry)
        return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        suggestionCache.delete(key);
        return null;
    }
    return entry.data;
}
function setCache(key, data) {
    // Enforce max size
    if (suggestionCache.size >= CACHE_MAX_SIZE) {
        const oldestKey = suggestionCache.keys().next().value;
        if (oldestKey)
            suggestionCache.delete(oldestKey);
    }
    suggestionCache.set(key, { data, timestamp: Date.now() });
}
export default function AutocompleteDropdown({ query: externalQuery, fetchSuggestions, onSelect, minChars = 2, debounceMs = 200, maxItems = 12, placeholder = "Type to search...", inputStyle, containerStyle, value, onChange, onSubmit, }) {
    const [internalValue, setInternalValue] = useState(externalQuery || "");
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const inputRef = useRef(null);
    const listRef = useRef(null);
    const abortRef = useRef(null);
    const debounceRef = useRef(null);
    const currentValue = value !== undefined ? value : internalValue;
    const handleInputChange = useCallback((e) => {
        const newVal = e.target.value;
        if (onChange) {
            onChange(newVal);
        }
        else {
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
            }
            catch (err) {
                if (err?.name !== "AbortError") {
                    console.error("Autocomplete fetch error:", err);
                    setSuggestions([]);
                }
            }
            finally {
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
    const handleKeyDown = useCallback((e) => {
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
                }
                else if (onSubmit) {
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
            const item = listRef.current.children[activeIndex];
            if (item) {
                item.scrollIntoView({ block: "nearest" });
            }
        }
    }, [activeIndex]);
    const handleSelect = useCallback((item) => {
        onSelect(item);
        setOpen(false);
        setActiveIndex(-1);
        if (onChange) {
            onChange(item.text);
        }
        else {
            setInternalValue(item.text);
        }
    }, [onSelect, onChange]);
    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (inputRef.current && !inputRef.current.contains(e.target)) {
                const listEl = listRef.current;
                if (listEl && !listEl.contains(e.target)) {
                    setOpen(false);
                }
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);
    // Highlight matching text
    const highlightMatch = (text, query) => {
        if (!query.trim())
            return text;
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi");
        const parts = text.split(regex);
        return parts.map((part, i) => regex.test(part) ? (_jsx("mark", { style: { background: "rgba(14,165,164,0.3)", padding: 0, borderRadius: 2 }, children: part }, i)) : (part));
    };
    return (_jsxs("div", { style: { position: "relative", width: "100%", ...containerStyle }, children: [_jsx("input", { ref: inputRef, type: "text", value: currentValue, onChange: handleInputChange, onKeyDown: handleKeyDown, onFocus: () => {
                    if (suggestions.length > 0)
                        setOpen(true);
                }, placeholder: placeholder, "aria-autocomplete": "list", "aria-expanded": open, "aria-controls": "autocomplete-listbox", role: "combobox", style: {
                    width: "100%",
                    padding: "16px 20px",
                    fontSize: 18,
                    border: "1px solid var(--border)",
                    borderRadius: open && suggestions.length > 0 ? "16px 16px 0 0" : 16,
                    background: "var(--surface)",
                    color: "var(--ink)",
                    outline: "none",
                    ...inputStyle,
                } }), loading && (_jsx("div", { style: {
                    position: "absolute",
                    right: 16,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--muted)",
                    fontSize: 12,
                }, children: "\u23F3" })), open && suggestions.length > 0 && (_jsx("ul", { ref: listRef, id: "autocomplete-listbox", role: "listbox", style: {
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
                }, children: suggestions.map((item, idx) => (_jsxs("li", { role: "option", "aria-selected": idx === activeIndex, onClick: () => handleSelect(item), onMouseEnter: () => setActiveIndex(idx), style: {
                        padding: "12px 20px",
                        cursor: "pointer",
                        background: idx === activeIndex ? "var(--surface-2)" : "transparent",
                        borderBottom: idx < suggestions.length - 1 ? "1px solid var(--border)" : "none",
                        transition: "background 0.1s",
                    }, children: [_jsx("div", { style: { fontWeight: 600, color: "var(--ink)" }, children: highlightMatch(item.text, currentValue) }), item.subtitle && (_jsx("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 2 }, children: item.subtitle }))] }, item.id))) }))] }));
}
