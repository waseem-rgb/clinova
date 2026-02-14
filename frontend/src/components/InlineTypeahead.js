import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
function getActiveToken(value, delimiter) {
    if (!delimiter) {
        return { token: value, start: 0 };
    }
    const idx = value.lastIndexOf(delimiter);
    const start = idx >= 0 ? idx + 1 : 0;
    const token = value.slice(start).trim();
    return { token, start };
}
function applySuggestion(value, suggestion, delimiter) {
    if (!delimiter)
        return suggestion;
    const idx = value.lastIndexOf(delimiter);
    const base = idx >= 0 ? value.slice(0, idx + 1) : "";
    const trimmedBase = base.trimEnd();
    const sep = trimmedBase.endsWith(delimiter) ? " " : "";
    return `${trimmedBase}${sep}${suggestion}`.trim();
}
export default function InlineTypeahead({ value, onChange, placeholder, multiline, fetchSuggestions, delimiter }) {
    const [suggestions, setSuggestions] = useState([]);
    const [ghost, setGhost] = useState("");
    const [showDropdown, setShowDropdown] = useState(false);
    const abortRef = useRef(null);
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
                if (ac.signal.aborted)
                    return;
                setSuggestions(list || []);
            }
            catch {
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
        }
        else {
            setGhost("");
        }
    }, [token, suggestions]);
    function acceptSuggestion() {
        if (!ghost)
            return;
        const full = `${token}${ghost}`;
        onChange(applySuggestion(value, full, delimiter));
        setGhost("");
    }
    function onKeyDown(e) {
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
    return (_jsxs("div", { style: { position: "relative", width: "100%" }, children: [_jsx("div", { style: {
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
                }, children: ghostValue }), multiline ? (_jsx("textarea", { value: value, onChange: (e) => onChange(e.target.value), placeholder: placeholder, onKeyDown: onKeyDown, style: {
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--ink)",
                    width: "100%",
                    minHeight: 80,
                    position: "relative",
                    zIndex: 1,
                } })) : (_jsx("input", { value: value, onChange: (e) => onChange(e.target.value), placeholder: placeholder, onKeyDown: onKeyDown, style: {
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--ink)",
                    width: "100%",
                    position: "relative",
                    zIndex: 1,
                } })), showDropdown && suggestions.length > 0 && (_jsx("div", { style: { marginTop: 6, display: "flex", flexWrap: "wrap", gap: 8 }, children: suggestions.map((s) => (_jsx("button", { onClick: () => {
                        onChange(applySuggestion(value, s, delimiter));
                        setShowDropdown(false);
                    }, style: {
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        cursor: "pointer",
                        fontWeight: 700,
                        color: "var(--ink)",
                    }, children: s }, s))) }))] }));
}
