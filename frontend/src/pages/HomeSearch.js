import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// frontend/src/pages/HomeSearch.tsx
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cleanTopicTitle, suggestByCollection } from "../api/topic";
import SidebarNav from "../components/SidebarNav";
import AutocompleteDropdown from "../components/AutocompleteDropdown";
export default function HomeSearch() {
    const navigate = useNavigate();
    // NON-NEGOTIABLE: do not show subjects in UI.
    // Keep backend collection logic intact by using a silent default.
    const [collection] = useState("medicine");
    const [query, setQuery] = useState("");
    // Convert suggestions to AutocompleteItem format
    const fetchSuggestions = useCallback(async (q, signal) => {
        const list = await suggestByCollection(collection, q.trim(), 50, signal);
        return list.map((text, idx) => ({
            id: `${text}-${idx}`,
            text: cleanTopicTitle(text),
        }));
    }, [collection]);
    function goToTopic(rawTitle) {
        const cleaned = cleanTopicTitle(rawTitle);
        if (!cleaned)
            return;
        // keep routing exactly same pattern; collection stays silent "medicine"
        navigate(`/topic/${collection}?q=${encodeURIComponent(cleaned)}`);
    }
    const handleSelect = useCallback((item) => {
        goToTopic(item.text);
    }, [collection, navigate]);
    const handleSubmit = useCallback((value) => {
        if (value.trim()) {
            goToTopic(value);
        }
    }, [collection, navigate]);
    return (_jsx("div", { style: { minHeight: "100vh", background: "var(--page-bg)", padding: "24px 24px 24px 0" }, children: _jsxs("div", { style: { maxWidth: "100%", minWidth: 1280, margin: 0, display: "grid", gridTemplateColumns: "260px 1fr", gap: 28 }, children: [_jsx(SidebarNav, {}), _jsx("div", { style: { minHeight: "86vh", display: "grid", alignContent: "center" }, children: _jsxs("div", { style: { maxWidth: 900, margin: "0 auto", width: "100%" }, children: [_jsxs("div", { style: { textAlign: "center", marginBottom: 28 }, children: [_jsx("div", { style: {
                                            fontSize: 64,
                                            fontWeight: 700,
                                            letterSpacing: -1.2,
                                            fontFamily: "var(--font-display)",
                                            color: "var(--ink)",
                                            background: "linear-gradient(135deg, var(--ink), var(--accent))",
                                            WebkitBackgroundClip: "text",
                                            WebkitTextFillColor: "transparent",
                                            backgroundClip: "text",
                                        }, children: "MedCompanion" }), _jsx("div", { style: { color: "var(--muted)", marginTop: 10, fontSize: 17 }, children: "Doctor-grade medical knowledge at your fingertips" })] }), _jsxs("div", { style: {
                                    borderRadius: 24,
                                    padding: "32px",
                                    background: "linear-gradient(180deg, var(--surface), var(--surface-2))",
                                    border: "1px solid var(--border)",
                                    boxShadow: "0 24px 48px rgba(15,23,42,0.1)",
                                }, children: [_jsxs("div", { style: { display: "flex", gap: 14, alignItems: "flex-start" }, children: [_jsx("div", { style: { flex: 1 }, children: _jsx(AutocompleteDropdown, { query: query, value: query, onChange: setQuery, fetchSuggestions: fetchSuggestions, onSelect: handleSelect, onSubmit: handleSubmit, minChars: 2, debounceMs: 200, maxItems: 12, placeholder: "Search medical topics... (e.g., epilepsy, diabetes, pneumonia)", inputStyle: {
                                                        padding: "22px 24px",
                                                        fontSize: 20,
                                                        borderRadius: 18,
                                                    } }) }), _jsx("button", { onClick: () => handleSubmit(query), disabled: !query.trim(), style: {
                                                    padding: "22px 32px",
                                                    borderRadius: 18,
                                                    border: "1px solid rgba(14,165,164,0.4)",
                                                    background: query.trim()
                                                        ? "linear-gradient(135deg, var(--accent), var(--accent-2))"
                                                        : "var(--surface-2)",
                                                    color: query.trim() ? "#fff" : "var(--muted)",
                                                    cursor: query.trim() ? "pointer" : "not-allowed",
                                                    fontWeight: 800,
                                                    fontSize: 17,
                                                    boxShadow: query.trim() ? "0 12px 28px rgba(14,165,164,0.25)" : "none",
                                                    transition: "all 0.2s ease",
                                                }, children: "Search" })] }), _jsxs("div", { style: { marginTop: 18, color: "var(--muted)", fontSize: 13 }, children: [_jsx("span", { style: { fontWeight: 600 }, children: "Tip:" }), " Use", " ", _jsx("kbd", { style: { background: "var(--surface-2)", padding: "2px 6px", borderRadius: 4, fontSize: 11 }, children: "\u2191" }), " ", _jsx("kbd", { style: { background: "var(--surface-2)", padding: "2px 6px", borderRadius: 4, fontSize: 11 }, children: "\u2193" }), " ", "to navigate,", " ", _jsx("kbd", { style: { background: "var(--surface-2)", padding: "2px 6px", borderRadius: 4, fontSize: 11 }, children: "Enter" }), " ", "to select,", " ", _jsx("kbd", { style: { background: "var(--surface-2)", padding: "2px 6px", borderRadius: 4, fontSize: 11 }, children: "Esc" }), " ", "to close"] })] }), _jsxs("div", { style: { marginTop: 32 }, children: [_jsx("div", { style: { color: "var(--ink)", fontWeight: 800, marginBottom: 14, fontSize: 15 }, children: "Popular Topics" }), _jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: 10 }, children: [
                                            "Hypertension",
                                            "Type 2 Diabetes",
                                            "Epilepsy",
                                            "Pneumonia",
                                            "Heart Failure",
                                            "Asthma",
                                            "COPD",
                                            "Anemia",
                                            "Hypothyroidism",
                                            "Hyperlipidemia",
                                        ].map((topic) => (_jsx("button", { onClick: () => goToTopic(topic), style: {
                                                padding: "10px 16px",
                                                borderRadius: 12,
                                                border: "1px solid var(--border)",
                                                background: "var(--surface)",
                                                color: "var(--ink)",
                                                cursor: "pointer",
                                                fontWeight: 600,
                                                fontSize: 14,
                                                transition: "all 0.15s ease",
                                            }, onMouseEnter: (e) => {
                                                e.currentTarget.style.borderColor = "var(--accent)";
                                                e.currentTarget.style.transform = "translateY(-1px)";
                                            }, onMouseLeave: (e) => {
                                                e.currentTarget.style.borderColor = "var(--border)";
                                                e.currentTarget.style.transform = "translateY(0)";
                                            }, children: topic }, topic))) })] }), _jsx("div", { style: { marginTop: 20, color: "var(--muted-2)", fontSize: 12, textAlign: "center" }, children: "Powered by Harrison's Principles of Internal Medicine and other trusted medical references" })] }) })] }) }));
}
