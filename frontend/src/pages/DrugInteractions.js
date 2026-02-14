import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API_BASE } from "../services/api";
import SidebarNav from "../components/SidebarNav";
import InlineSuggestInput from "../components/InlineSuggestInput";
import { loadInteractionsState, saveInteractionsState, clearSearchState, } from "../app/lib/searchMemory";
export default function DrugInteractions() {
    const nav = useNavigate();
    const location = useLocation();
    const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const [drugs, setDrugs] = useState("");
    const [busy, setBusy] = useState(false);
    const [data, setData] = useState(null);
    const [errorMsg, setErrorMsg] = useState("");
    const [handoffSource, setHandoffSource] = useState(null);
    // Restore state on mount or handle URL query params from handoff
    useEffect(() => {
        const drugsFromUrl = params.get("drugs") || params.get("drug") || "";
        const source = params.get("source") || null;
        if (drugsFromUrl) {
            // Handoff from another page - use URL drugs
            setDrugs(drugsFromUrl);
            setHandoffSource(source);
            // Clear URL params without navigation
            window.history.replaceState({}, "", "/interactions");
        }
        else {
            // No handoff - restore from saved state
            const saved = loadInteractionsState();
            if (saved) {
                setDrugs(saved.input.drugs || "");
                setData(saved.output);
            }
        }
    }, [params]);
    async function runCheck() {
        setBusy(true);
        setErrorMsg("");
        try {
            const list = drugs.split(",").map((d) => d.trim()).filter(Boolean);
            if (list.length < 2) {
                throw new Error("Please enter at least 2 drugs separated by commas");
            }
            const res = await fetch(`${API_BASE}/interactions/check`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ drugs: list }),
            });
            if (!res.ok)
                throw new Error(await res.text());
            const result = await res.json();
            setData(result);
            // Save to memory
            saveInteractionsState({ drugs }, result);
        }
        catch (e) {
            setErrorMsg(e?.message || "Failed to check interactions");
        }
        finally {
            setBusy(false);
        }
    }
    function handleNewSearch() {
        setDrugs("");
        setData(null);
        setErrorMsg("");
        clearSearchState("interactions");
    }
    // Get severity color
    function getSeverityColor(severity) {
        const s = (severity || "").toLowerCase();
        if (s.includes("contraindicated"))
            return "#b91c1c";
        if (s.includes("major") || s.includes("high"))
            return "#c2410c";
        if (s.includes("moderate"))
            return "#b45309";
        if (s.includes("minor"))
            return "#0891b2";
        return "var(--muted)";
    }
    function getSeverityBg(severity) {
        const s = (severity || "").toLowerCase();
        if (s.includes("contraindicated"))
            return "rgba(185,28,28,0.1)";
        if (s.includes("major") || s.includes("high"))
            return "rgba(194,65,12,0.1)";
        if (s.includes("moderate"))
            return "rgba(180,83,9,0.1)";
        if (s.includes("minor"))
            return "rgba(8,145,178,0.1)";
        return "var(--surface-2)";
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
                            }, children: "Drug Interactions" }), _jsxs("div", { style: {
                                marginTop: 16,
                                background: "var(--surface)",
                                borderRadius: 18,
                                border: "1px solid var(--border)",
                                padding: 18,
                                boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
                            }, children: [_jsx("label", { style: { display: "block", marginBottom: 8 }, children: _jsx("span", { style: { fontWeight: 800, color: "var(--ink)" }, children: "Enter drugs (comma-separated)" }) }), _jsxs("div", { style: { display: "flex", gap: 10 }, children: [_jsx("div", { style: { flex: 1 }, children: _jsx(InlineSuggestInput, { value: drugs, onChange: setDrugs, placeholder: "e.g., warfarin, aspirin, amiodarone", suggestionType: "drug", multiValue: true, minChars: 2 }) }), _jsx("button", { onClick: runCheck, disabled: !drugs.trim() || busy, style: {
                                                padding: "10px 18px",
                                                borderRadius: 12,
                                                border: "1px solid rgba(14,165,164,0.35)",
                                                background: busy ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), var(--accent-2))",
                                                color: busy ? "var(--muted)" : "#fff",
                                                fontWeight: 800,
                                                cursor: busy ? "not-allowed" : "pointer",
                                                boxShadow: busy ? "none" : "0 12px 28px rgba(14,165,164,0.3)",
                                                whiteSpace: "nowrap",
                                            }, children: busy ? "Checking…" : "Check Interactions" })] }), _jsx("div", { style: { marginTop: 6, fontSize: 12, color: "var(--muted)" }, children: "Enter 2-10 drug names to check for interactions" }), errorMsg && _jsx("div", { style: { marginTop: 10, color: "#b91c1c" }, children: errorMsg })] }), data && (_jsxs("div", { style: { marginTop: 16, display: "grid", gap: 14 }, children: [_jsxs("div", { style: {
                                        background: "var(--surface)",
                                        borderRadius: 18,
                                        padding: 16,
                                        border: "1px solid var(--border)",
                                        boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
                                    }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12 }, children: [_jsxs("div", { style: {
                                                        padding: "8px 16px",
                                                        borderRadius: 10,
                                                        background: getSeverityBg(data.overall_risk_level),
                                                        color: getSeverityColor(data.overall_risk_level),
                                                        fontWeight: 900,
                                                        fontSize: 16,
                                                    }, children: ["Overall Risk: ", data.overall_risk_level || "Not assessed"] }), _jsxs("div", { style: { color: "var(--muted)" }, children: [data.drugs?.length || 0, " drugs checked"] })] }), data.summary && (_jsx("div", { style: { marginTop: 12, color: "var(--ink)", lineHeight: 1.6 }, children: data.summary }))] }), (data.interactions || []).length > 0 && (_jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", marginBottom: 12 }, children: "\uD83D\uDD17 Pairwise Interactions" }), _jsx("div", { style: { display: "grid", gap: 10 }, children: (data.interactions || []).map((i, idx) => (_jsxs("div", { style: {
                                                    border: `1px solid ${getSeverityColor(i.severity)}40`,
                                                    background: getSeverityBg(i.severity),
                                                    borderRadius: 12,
                                                    padding: 12,
                                                }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "start" }, children: [_jsx("div", { style: { fontWeight: 800, color: "var(--ink)" }, children: i.pair?.join(" + ") || "Unknown pair" }), _jsx("span", { style: {
                                                                    padding: "4px 10px",
                                                                    borderRadius: 999,
                                                                    background: getSeverityColor(i.severity),
                                                                    color: "#fff",
                                                                    fontSize: 12,
                                                                    fontWeight: 700,
                                                                }, children: i.severity || "Unknown" })] }), i.mechanism && i.mechanism !== "Not found in sources" && (_jsxs("div", { style: { marginTop: 8, color: "var(--muted)" }, children: [_jsx("strong", { children: "Mechanism:" }), " ", i.mechanism] })), i.clinical_effect && (_jsxs("div", { style: { marginTop: 4, color: "var(--muted)" }, children: [_jsx("strong", { children: "Effect:" }), " ", i.clinical_effect] })), i.management && (_jsxs("div", { style: { marginTop: 4, color: "var(--muted)" }, children: [_jsx("strong", { children: "Management:" }), " ", i.management] })), i.monitoring && (_jsxs("div", { style: { marginTop: 4, color: "var(--muted)" }, children: [_jsx("strong", { children: "Monitoring:" }), " ", i.monitoring] })), _jsxs("div", { style: { marginTop: 6, color: "var(--muted-2)", fontSize: 12 }, children: [i.rule_based ? "Rule-based detection" : "Evidence-based", i.citations?.length > 0 && ` • Citations: ${i.citations.join(", ")}`] })] }, idx))) })] })), (data.combined_risks || []).length > 0 && (_jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", marginBottom: 12 }, children: "Combined Risk Clusters" }), _jsx("div", { style: { display: "grid", gap: 10 }, children: (data.combined_risks || []).map((r, idx) => (_jsxs("div", { style: {
                                                    border: "1px solid rgba(180,83,9,0.3)",
                                                    background: "rgba(180,83,9,0.08)",
                                                    borderRadius: 12,
                                                    padding: 12,
                                                }, children: [_jsx("div", { style: { fontWeight: 800, color: "#b45309" }, children: r.risk_type }), _jsx("div", { style: { marginTop: 6, color: "var(--muted)" }, children: r.explanation }), _jsxs("div", { style: { marginTop: 4, color: "var(--muted)" }, children: [_jsx("strong", { children: "Drugs involved:" }), " ", (r.implicated_drugs || []).join(", ")] }), r.monitoring && (_jsxs("div", { style: { marginTop: 4, color: "var(--muted)" }, children: [_jsx("strong", { children: "Monitoring:" }), " ", r.monitoring] }))] }, idx))) })] })), (data.monitoring || []).length > 0 && (_jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)" }, children: "\uD83D\uDCCB Monitoring Recommendations" }), _jsx("ul", { style: { margin: "8px 0 0 18px", color: "var(--muted)" }, children: (data.monitoring || []).map((m, idx) => (_jsx("li", { children: m }, idx))) })] })), (data.safer_alternatives || []).length > 0 && (_jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)" }, children: "\uD83D\uDCA1 Safer Alternatives" }), _jsx("ul", { style: { margin: "8px 0 0 18px", color: "var(--muted)" }, children: (data.safer_alternatives || []).map((a, idx) => (_jsx("li", { children: a }, idx))) })] })), _jsxs("details", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("summary", { style: { fontWeight: 900, cursor: "pointer", color: "var(--ink)" }, children: "\uD83D\uDCDA Evidence Sources" }), _jsxs("div", { style: { marginTop: 10, display: "grid", gap: 8 }, children: [(data.evidence || []).map((e, idx) => (_jsxs("div", { style: { fontSize: 12, color: "var(--muted)", padding: 8, background: "var(--surface-2)", borderRadius: 8 }, children: [_jsxs("div", { style: { fontWeight: 700 }, children: [e.book, " ", e.page_start ? `p${e.page_start}` : ""] }), _jsx("div", { style: { marginTop: 4 }, children: e.snippet }), _jsxs("div", { style: { color: "var(--muted-2)", marginTop: 2 }, children: ["chunk_id: ", e.chunk_id] })] }, idx))), (data.evidence || []).length === 0 && (_jsx("div", { style: { color: "var(--muted)" }, children: "No evidence chunks retrieved (rule-based detection only)." }))] })] }), (data.interactions || []).length === 0 && (data.combined_risks || []).length === 0 && (_jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid rgba(16,185,129,0.3)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "#059669" }, children: "\u2713 No Significant Interactions Found" }), _jsx("div", { style: { marginTop: 6, color: "var(--muted)" }, children: "No major interactions were detected between these drugs in the available sources. However, always verify with current drug references and clinical judgment." })] }))] })), !data && !busy && (_jsxs("div", { style: { marginTop: 24, padding: 24, textAlign: "center", color: "var(--muted)" }, children: [_jsx("div", { style: { fontSize: 48, marginBottom: 12 }, children: "\uD83D\uDD00" }), _jsx("div", { style: { fontWeight: 700 }, children: "Check Drug Interactions" }), _jsx("div", { style: { marginTop: 8 }, children: "Enter 2 or more drug names above to check for potential interactions." })] }))] })] }) }));
}
