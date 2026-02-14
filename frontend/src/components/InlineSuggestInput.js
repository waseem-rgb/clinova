import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// frontend/src/components/InlineSuggestInput.tsx
/**
 * Universal Inline Autocomplete Component.
 *
 * Uses the Smart Field Suggest endpoint (/api/suggest/field) for
 * RAG-based + AI-cleaned suggestions for all input fields.
 *
 * Features:
 * - Anchored dropdown popover
 * - Keyboard navigation (↑↓ Enter Escape Tab)
 * - Multi-value support (comma-separated)
 * - Debounced API calls
 * - Max 12 suggestions
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFieldSuggestions } from "../api/fieldSuggest";
// Map component suggestion types to API field types
const SUGGESTION_TO_FIELD_MAP = {
    symptom: "symptom",
    condition: "condition",
    drug: "drug",
    comorbidity: "comorbidity",
    med: "medication",
    medication: "medication",
    duration: "generic", // duration uses static + generic
    topic: "condition",
    disease: "condition",
    severity: "generic", // severity uses static
    setting: "generic", // setting uses static
    renal: "renal_status",
    hepatic: "hepatic_status",
    allergy: "allergy",
};
// Static suggestions for fields with predefined options
const STATIC_SUGGESTIONS = {
    severity: ["mild", "moderate", "severe", "critical"],
    setting: ["OPD", "ER", "Ward", "ICU", "Home", "Clinic"],
    duration: [
        "since yesterday",
        "for 1 day",
        "for 2 days",
        "for 3 days",
        "for 1 week",
        "for 2 weeks",
        "for 1 month",
        "for 3 months",
        "for 6 months",
        "for 1 year",
    ],
};
// Fields that use static suggestions only
const STATIC_ONLY_FIELDS = new Set(["severity", "setting"]);
// Fields that combine static + API suggestions
const HYBRID_FIELDS = new Set(["duration"]);
export default function InlineSuggestInput({ value, onChange, placeholder = "", suggestionType, onSelectSuggestion, debounceMs = 250, minChars = 2, disabled = false, multiValue = false, className = "", style = {}, inputStyle = {}, }) {
    const [suggestions, setSuggestions] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef(null);
    const containerRef = useRef(null);
    const abortRef = useRef(null);
    const debounceRef = useRef(null);
    // Get the current query term (last value if multiValue)
    const queryTerm = multiValue
        ? (value.split(",").pop()?.trim() || "")
        : value.trim();
    const fetchSuggestions = useCallback(async (text) => {
        if (text.length < minChars) {
            setSuggestions([]);
            return;
        }
        // Handle static-only fields
        if (STATIC_ONLY_FIELDS.has(suggestionType)) {
            const staticList = STATIC_SUGGESTIONS[suggestionType] || [];
            const filtered = staticList.filter(s => s.toLowerCase().includes(text.toLowerCase()));
            setSuggestions(filtered);
            if (filtered.length > 0 && isFocused) {
                setIsOpen(true);
            }
            return;
        }
        // Abort previous request
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;
        try {
            // Get API suggestions from /api/suggest/field
            const fieldType = SUGGESTION_TO_FIELD_MAP[suggestionType];
            const items = await fetchFieldSuggestions({
                field: fieldType,
                q: text,
                limit: 12,
            }, ac.signal);
            // Extract labels from response
            let labels = items.map(item => item.label);
            // For hybrid fields, combine with static suggestions
            if (HYBRID_FIELDS.has(suggestionType)) {
                const staticList = STATIC_SUGGESTIONS[suggestionType] || [];
                const staticMatches = staticList.filter(s => s.toLowerCase().includes(text.toLowerCase()));
                // Prepend static matches, then API results (deduped)
                const seen = new Set(staticMatches.map(s => s.toLowerCase()));
                const apiUnique = labels.filter(l => !seen.has(l.toLowerCase()));
                labels = [...staticMatches, ...apiUnique];
            }
            // Filter out already selected values for multiValue
            if (multiValue && value) {
                const existing = value.split(",").map(v => v.trim().toLowerCase());
                labels = labels.filter(l => !existing.includes(l.toLowerCase()));
            }
            setSuggestions(labels.slice(0, 12));
            if (labels.length > 0 && isFocused) {
                setIsOpen(true);
            }
        }
        catch (e) {
            if (e?.name !== "AbortError") {
                setSuggestions([]);
            }
        }
    }, [suggestionType, minChars, multiValue, value, isFocused]);
    // Debounced fetch
    useEffect(() => {
        if (debounceRef.current) {
            window.clearTimeout(debounceRef.current);
        }
        debounceRef.current = window.setTimeout(() => {
            fetchSuggestions(queryTerm);
        }, debounceMs);
        return () => {
            if (debounceRef.current) {
                window.clearTimeout(debounceRef.current);
            }
        };
    }, [queryTerm, debounceMs, fetchSuggestions]);
    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);
    const handleSelect = (suggestion) => {
        if (multiValue) {
            // Replace the last partial term with the full suggestion
            const parts = value.split(",").map(p => p.trim());
            parts[parts.length - 1] = suggestion;
            const newValue = parts.filter(Boolean).join(", ");
            onChange(newValue);
        }
        else {
            onChange(suggestion);
        }
        onSelectSuggestion?.(suggestion);
        setSuggestions([]);
        setIsOpen(false);
        setActiveIndex(-1);
        inputRef.current?.focus();
    };
    const handleKeyDown = (e) => {
        if (!isOpen || suggestions.length === 0) {
            return;
        }
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setActiveIndex(prev => prev < suggestions.length - 1 ? prev + 1 : 0);
                break;
            case "ArrowUp":
                e.preventDefault();
                setActiveIndex(prev => prev > 0 ? prev - 1 : suggestions.length - 1);
                break;
            case "Enter":
                e.preventDefault();
                if (activeIndex >= 0 && suggestions[activeIndex]) {
                    handleSelect(suggestions[activeIndex]);
                }
                break;
            case "Escape":
                setIsOpen(false);
                setActiveIndex(-1);
                break;
            case "Tab":
                if (activeIndex >= 0 && suggestions[activeIndex]) {
                    e.preventDefault();
                    handleSelect(suggestions[activeIndex]);
                }
                else {
                    setIsOpen(false);
                }
                break;
        }
    };
    const handleFocus = () => {
        setIsFocused(true);
        if (suggestions.length > 0) {
            setIsOpen(true);
        }
    };
    const handleBlur = () => {
        // Delay blur to allow click on suggestion
        setTimeout(() => {
            setIsFocused(false);
            setIsOpen(false);
        }, 150);
    };
    return (_jsxs("div", { ref: containerRef, className: className, style: { position: "relative", ...style }, children: [_jsx("input", { ref: inputRef, type: "text", value: value, onChange: (e) => onChange(e.target.value), onKeyDown: handleKeyDown, onFocus: handleFocus, onBlur: handleBlur, placeholder: placeholder, disabled: disabled, autoComplete: "off", style: {
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface-2)",
                    color: "var(--ink)",
                    width: "100%",
                    ...inputStyle,
                } }), isOpen && suggestions.length > 0 && (_jsx("div", { style: {
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    marginTop: 4,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
                    zIndex: 1000,
                    maxHeight: 280,
                    overflowY: "auto",
                }, children: suggestions.map((suggestion, index) => (_jsx("div", { onClick: () => handleSelect(suggestion), onMouseEnter: () => setActiveIndex(index), style: {
                        padding: "10px 14px",
                        cursor: "pointer",
                        background: index === activeIndex ? "var(--surface-2)" : "transparent",
                        color: "var(--ink)",
                        fontWeight: index === activeIndex ? 700 : 400,
                        borderBottom: index < suggestions.length - 1 ? "1px solid var(--border)" : "none",
                        transition: "background 0.1s",
                    }, children: suggestion }, `${suggestion}-${index}`))) }))] }));
}
