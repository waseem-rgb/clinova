import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API_BASE } from "../services/api";
import SidebarNav from "../components/SidebarNav";
import InlineSuggestInput from "../components/InlineSuggestInput";
import { loadDrugDetailsState, saveDrugDetailsState, clearSearchState, } from "../app/lib/searchMemory";
export default function DrugDetails() {
    const nav = useNavigate();
    const location = useLocation();
    const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const [q, setQ] = useState("");
    const [showSources, setShowSources] = useState(false);
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [autoLoad, setAutoLoad] = useState(false);
    // Restore state on mount or handle URL query params from handoff
    useEffect(() => {
        const drugFromUrl = params.get("q") || params.get("drug") || "";
        const source = params.get("source") || null;
        if (drugFromUrl) {
            // Handoff from another page - set drug and trigger auto-load
            setQ(drugFromUrl);
            setAutoLoad(true);
            // Clear URL params without navigation
            window.history.replaceState({}, "", "/drug");
        }
        else {
            // No handoff - restore from saved state
            const saved = loadDrugDetailsState();
            if (saved) {
                setQ(saved.input.query || "");
                setData(saved.output);
            }
        }
    }, [params]);
    // Auto-load drug when coming from handoff
    useEffect(() => {
        if (autoLoad && q.trim()) {
            loadDrug(q);
            setAutoLoad(false);
        }
    }, [autoLoad, q]);
    async function loadDrug(name) {
        if (!name.trim())
            return;
        setBusy(true);
        setErrorMsg("");
        try {
            const res = await fetch(`${API_BASE}/drugs/${encodeURIComponent(name)}`);
            if (!res.ok)
                throw new Error(await res.text());
            const result = await res.json();
            setData(result);
            // Save to memory
            saveDrugDetailsState({ query: name }, result);
        }
        catch (e) {
            setErrorMsg(e?.message || "Failed to fetch drug");
        }
        finally {
            setBusy(false);
        }
    }
    function handleNewSearch() {
        setQ("");
        setData(null);
        setErrorMsg("");
        clearSearchState("drugDetails");
    }
    function copySkeleton() {
        if (!data?.header?.canonical_generic_name)
            return;
        const text = `Rx: ${data.header.canonical_generic_name} — [form/strength]`;
        navigator.clipboard.writeText(text).catch(() => { });
    }
    function handleSelectDrug(drug) {
        setQ(drug);
        loadDrug(drug);
    }
    // Handoff: Navigate to Interactions to check this drug
    function handleCheckInteractions() {
        if (!data?.header?.canonical_generic_name)
            return;
        nav(`/interactions?drug=${encodeURIComponent(data.header.canonical_generic_name)}&source=drug`);
    }
    return (_jsx("div", { style: { minHeight: "100vh", background: "var(--page-bg)", padding: "24px 24px 24px 0" }, children: _jsxs("div", { style: { maxWidth: "100%", minWidth: 1200, margin: 0, display: "grid", gridTemplateColumns: "260px 1fr", gap: 24 }, children: [_jsx(SidebarNav, {}), _jsxs("div", { children: [_jsxs("div", { style: { display: "flex", gap: 10, alignItems: "center" }, children: [_jsx("button", { onClick: () => nav("/"), style: {
                                        border: "1px solid var(--border)",
                                        background: "var(--surface)",
                                        padding: "8px 12px",
                                        borderRadius: 12,
                                        cursor: "pointer",
                                        fontWeight: 800,
                                        color: "var(--ink)",
                                        boxShadow: "0 8px 18px rgba(15,23,42,0.08)",
                                    }, children: "\u2190 Back" }), data && (_jsx("button", { onClick: handleNewSearch, style: {
                                        border: "1px solid var(--accent)",
                                        background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                                        padding: "8px 16px",
                                        borderRadius: 12,
                                        cursor: "pointer",
                                        fontWeight: 800,
                                        color: "#fff",
                                        boxShadow: "0 8px 18px rgba(14,165,164,0.25)",
                                    }, children: "+ New Search" }))] }), _jsx("h1", { style: {
                                marginTop: 16,
                                fontSize: 36,
                                fontWeight: 700,
                                color: "var(--ink)",
                                letterSpacing: -0.6,
                                fontFamily: "var(--font-display)",
                            }, children: "Drug Details" }), _jsxs("div", { style: {
                                marginTop: 16,
                                background: "var(--surface)",
                                borderRadius: 18,
                                border: "1px solid var(--border)",
                                padding: 18,
                                boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
                            }, children: [_jsxs("div", { style: { display: "flex", gap: 10 }, children: [_jsx("div", { style: { flex: 1 }, children: _jsx(InlineSuggestInput, { value: q, onChange: setQ, placeholder: "Search drug (e.g., metformin, atorvastatin)...", suggestionType: "drug", onSelectSuggestion: handleSelectDrug, minChars: 2 }) }), _jsx("button", { onClick: () => loadDrug(q), disabled: !q.trim() || busy, style: {
                                                padding: "10px 18px",
                                                borderRadius: 12,
                                                border: "1px solid rgba(14,165,164,0.35)",
                                                background: busy ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), var(--accent-2))",
                                                color: busy ? "var(--muted)" : "#fff",
                                                fontWeight: 800,
                                                cursor: busy ? "not-allowed" : "pointer",
                                                boxShadow: busy ? "none" : "0 12px 28px rgba(14,165,164,0.3)",
                                                whiteSpace: "nowrap",
                                            }, children: busy ? "Loading…" : "Get Details" })] }), errorMsg && _jsx("div", { style: { marginTop: 10, color: "#b91c1c" }, children: errorMsg })] }), busy && _jsx("div", { style: { marginTop: 12 }, children: "Loading\u2026" }), data && (_jsxs("div", { style: { marginTop: 16, display: "grid", gap: 14 }, children: [_jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)", boxShadow: "0 16px 40px rgba(15,23,42,0.08)" }, children: [_jsx("div", { style: { fontWeight: 900, fontSize: 20, color: "var(--ink)" }, children: data.header?.canonical_generic_name }), data.header?.drug_class && (_jsx("div", { style: { marginTop: 4, color: "var(--muted)", fontWeight: 600 }, children: data.header.drug_class })), _jsx("div", { style: { marginTop: 6, color: "var(--muted)" }, children: (data.header?.common_brand_names || []).join(", ") || "Brand names: See India brands section" }), _jsx("div", { style: { marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }, children: (data.header?.quick_flags || []).map((f) => (_jsxs("span", { style: {
                                                    border: "1px solid rgba(234,88,12,0.3)",
                                                    background: "rgba(234,88,12,0.08)",
                                                    borderRadius: 999,
                                                    padding: "4px 10px",
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                    color: "#b45309",
                                                }, children: ["\u26A0 ", f] }, f))) }), _jsxs("div", { style: { marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }, children: [_jsx("button", { onClick: copySkeleton, style: { padding: "6px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontWeight: 700, cursor: "pointer" }, children: "\uD83D\uDCCB Copy Rx Skeleton" }), _jsx("button", { onClick: () => setShowSources((v) => !v), style: { padding: "6px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontWeight: 700, cursor: "pointer" }, children: showSources ? "Hide Sources" : "Show Sources" }), _jsx("button", { onClick: handleCheckInteractions, style: {
                                                        padding: "6px 12px",
                                                        borderRadius: 10,
                                                        border: "1px solid #ea580c",
                                                        background: "linear-gradient(135deg, #ea580c, #dc2626)",
                                                        color: "#fff",
                                                        fontWeight: 800,
                                                        cursor: "pointer",
                                                        boxShadow: "0 4px 12px rgba(234,88,12,0.2)",
                                                    }, children: "\u26A1 Check Interactions" })] })] }), _jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }, children: (data.executive_summary_cards || []).map((card, idx) => (_jsxs("div", { style: { background: "var(--surface)", borderRadius: 16, padding: 14, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 800, color: "var(--muted)", fontSize: 12, textTransform: "uppercase" }, children: card.title }), _jsx("div", { style: { marginTop: 6, color: "var(--ink)", fontWeight: 600 }, children: card.value || "Not found in sources" })] }, idx))) }), (data.sections || []).map((section) => {
                                    const bullets = section.bullets || [];
                                    // Skip empty sections
                                    if (bullets.length === 0 || (bullets.length === 1 && bullets[0] === "Not found in sources")) {
                                        return null;
                                    }
                                    return (_jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)" }, children: section.title }), _jsx("ul", { style: { margin: "8px 0 0 18px", color: "var(--muted)" }, children: bullets.map((b, idx) => (_jsx("li", { children: b }, `${section.key}-${idx}`))) }), showSources && section.citations?.length > 0 && (_jsxs("div", { style: { marginTop: 6, color: "var(--muted-2)", fontSize: 12 }, children: ["Citations: ", section.citations.join(", ")] }))] }, section.key));
                                }), (data.brands_and_prices?.rows || []).length > 0 && (_jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)" }, children: "\uD83C\uDDEE\uD83C\uDDF3 Indian Brands & Prices" }), _jsx("div", { style: { marginTop: 10, overflowX: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 14 }, children: [_jsx("thead", { children: _jsxs("tr", { style: { textAlign: "left", color: "var(--ink)" }, children: [_jsx("th", { style: th, children: "Brand" }), _jsx("th", { style: th, children: "Strength" }), _jsx("th", { style: th, children: "Form" }), _jsx("th", { style: th, children: "Pack" }), _jsx("th", { style: th, children: "Price" })] }) }), _jsx("tbody", { children: (data.brands_and_prices?.rows || []).map((row, idx) => (_jsxs("tr", { style: { borderTop: "1px solid var(--border)" }, children: [_jsx("td", { style: tdStrong, children: row.brand || "—" }), _jsx("td", { style: tdMuted, children: row.strength || "—" }), _jsx("td", { style: tdMuted, children: row.form || "—" }), _jsx("td", { style: tdMuted, children: row.pack || "—" }), _jsx("td", { style: tdMuted, children: row.price || "—" })] }, idx))) })] }) }), (data.brands_and_prices?.rows || []).length === 0 && (_jsx("div", { style: { marginTop: 8, color: "var(--muted)" }, children: "No brand information found in MIMS/Tripathi sources." }))] })), _jsxs("details", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("summary", { style: { fontWeight: 900, cursor: "pointer", color: "var(--ink)" }, children: "\uD83D\uDCDA Evidence Sources" }), _jsxs("div", { style: { marginTop: 10, display: "grid", gap: 8 }, children: [(data.evidence || []).map((e, idx) => (_jsxs("div", { style: { fontSize: 12, color: "var(--muted)", padding: 8, background: "var(--surface-2)", borderRadius: 8 }, children: [_jsxs("div", { style: { fontWeight: 700 }, children: [e.book, " ", e.page_start ? `p${e.page_start}` : ""] }), _jsx("div", { style: { marginTop: 4 }, children: e.snippet }), _jsxs("div", { style: { color: "var(--muted-2)", marginTop: 2 }, children: ["chunk_id: ", e.chunk_id] })] }, idx))), (data.evidence || []).length === 0 && (_jsx("div", { style: { color: "var(--muted)" }, children: "No evidence chunks available." }))] })] }), !data.coverage_gate?.passed && (_jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid rgba(234,88,12,0.3)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "#b45309" }, children: "\u26A0 Coverage Notice" }), _jsx("div", { style: { marginTop: 6, color: "var(--muted)" }, children: "Some information may be incomplete. Evidence coverage did not fully pass." })] }))] })), !data && !busy && (_jsxs("div", { style: { marginTop: 24, padding: 24, textAlign: "center", color: "var(--muted)" }, children: [_jsx("div", { style: { fontSize: 48, marginBottom: 12 }, children: "\uD83D\uDC8A" }), _jsx("div", { style: { fontWeight: 700 }, children: "Search for a drug to see details" }), _jsx("div", { style: { marginTop: 8 }, children: "Enter a generic or brand name above to get comprehensive drug information." })] }))] })] }) }));
}
const th = {
    padding: "10px 8px",
    fontSize: 12,
    letterSpacing: 0.2,
    textTransform: "uppercase",
    color: "var(--muted)",
};
const tdMuted = {
    padding: "10px 8px",
    color: "var(--muted)",
    verticalAlign: "top",
};
const tdStrong = {
    padding: "10px 8px",
    color: "var(--ink)",
    verticalAlign: "top",
    fontWeight: 800,
};
