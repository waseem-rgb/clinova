import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API_BASE } from "../services/api";
import SidebarNav from "../components/SidebarNav";
import InlineSuggestInput from "../components/InlineSuggestInput";
import { loadDDxState, saveDDxState, clearSearchState, } from "../app/lib/searchMemory";
const INITIAL_INPUT = {
    symptoms: "",
    duration: "",
    age: "",
    sex: "unknown",
    pregnancy: "unknown",
    comorbidities: "",
    meds: "",
};
export default function DifferentialDiagnosis() {
    const nav = useNavigate();
    const location = useLocation();
    const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const [input, setInput] = useState(INITIAL_INPUT);
    const [busy, setBusy] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [data, setData] = useState(null);
    const [handoffSource, setHandoffSource] = useState(null);
    // Restore state on mount or handle URL query params from handoff
    useEffect(() => {
        const conditionFromUrl = params.get("condition") || params.get("symptoms") || "";
        const source = params.get("source") || null;
        if (conditionFromUrl) {
            // Handoff from another page (e.g., Lab) - pre-fill symptoms
            setInput((prev) => ({ ...prev, symptoms: conditionFromUrl }));
            setHandoffSource(source);
            // Clear URL params without navigation
            window.history.replaceState({}, "", "/ddx");
        }
        else {
            // No handoff - restore from saved state
            const saved = loadDDxState();
            if (saved) {
                setInput(saved.input);
                setData(saved.output);
            }
        }
    }, [params]);
    const updateField = (key, value) => {
        setInput((prev) => ({ ...prev, [key]: value }));
    };
    async function runDDx() {
        setBusy(true);
        setErrorMsg("");
        try {
            const res = await fetch(`${API_BASE}/ddx/run`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    symptoms: input.symptoms,
                    duration: input.duration || null,
                    age: input.age ? Number(input.age) : null,
                    sex: input.sex,
                    pregnancy: input.pregnancy,
                    comorbidities: input.comorbidities ? input.comorbidities.split(",").map((s) => s.trim()).filter(Boolean) : [],
                    meds: input.meds ? input.meds.split(",").map((s) => s.trim()).filter(Boolean) : [],
                }),
            });
            if (!res.ok)
                throw new Error(await res.text());
            const result = await res.json();
            setData(result);
            // Save to memory
            saveDDxState(input, result);
        }
        catch (e) {
            setErrorMsg(e?.message || "Failed to run DDx");
        }
        finally {
            setBusy(false);
        }
    }
    function handleNewSearch() {
        setInput(INITIAL_INPUT);
        setData(null);
        setErrorMsg("");
        clearSearchState("ddx");
    }
    const mustNotMiss = data?.must_not_miss || [];
    const ranked = data?.ranked_ddx || [];
    const systemWise = data?.system_wise || [];
    const algorithm = data?.rapid_algorithm || { step_1: [], step_2: [], step_3: [] };
    const investigations = data?.suggested_investigations || { urgent: [], soon: [], routine: [] };
    const redFlags = data?.red_flags || [];
    const coverage = data?.coverage_gate || { passed: true, missing_evidence_ids: [] };
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
                            }, children: "Differential Diagnosis" }), _jsxs("div", { style: {
                                marginTop: 16,
                                background: "var(--surface)",
                                borderRadius: 18,
                                border: "1px solid var(--border)",
                                padding: 18,
                                boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
                            }, children: [_jsxs("div", { style: { display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }, children: [_jsxs("label", { style: { display: "grid", gap: 6 }, children: [_jsx("span", { style: { fontWeight: 800, color: "var(--ink)" }, children: "Symptoms *" }), _jsx(InlineSuggestInput, { value: input.symptoms, onChange: (v) => updateField("symptoms", v), placeholder: "e.g., chest pain, shortness of breath, fever", suggestionType: "symptom", multiValue: true, minChars: 2 })] }), _jsxs("label", { style: { display: "grid", gap: 6 }, children: [_jsx("span", { style: { fontWeight: 800, color: "var(--ink)" }, children: "Duration" }), _jsx(InlineSuggestInput, { value: input.duration, onChange: (v) => updateField("duration", v), placeholder: "e.g., 3 days, 2 weeks", suggestionType: "duration", minChars: 1 })] }), _jsxs("label", { style: { display: "grid", gap: 6 }, children: [_jsx("span", { style: { fontWeight: 800, color: "var(--ink)" }, children: "Age" }), _jsx("input", { value: input.age, onChange: (e) => updateField("age", e.target.value), placeholder: "e.g., 50", type: "number", style: inputStyle })] }), _jsxs("label", { style: { display: "grid", gap: 6 }, children: [_jsx("span", { style: { fontWeight: 800, color: "var(--ink)" }, children: "Sex" }), _jsxs("select", { value: input.sex, onChange: (e) => updateField("sex", e.target.value), style: inputStyle, children: [_jsx("option", { value: "unknown", children: "Unknown" }), _jsx("option", { value: "male", children: "Male" }), _jsx("option", { value: "female", children: "Female" })] })] }), _jsxs("label", { style: { display: "grid", gap: 6 }, children: [_jsx("span", { style: { fontWeight: 800, color: "var(--ink)" }, children: "Pregnancy" }), _jsxs("select", { value: input.pregnancy, onChange: (e) => updateField("pregnancy", e.target.value), style: inputStyle, children: [_jsx("option", { value: "unknown", children: "Unknown" }), _jsx("option", { value: "no", children: "No" }), _jsx("option", { value: "yes", children: "Yes" })] })] }), _jsxs("label", { style: { display: "grid", gap: 6 }, children: [_jsx("span", { style: { fontWeight: 800, color: "var(--ink)" }, children: "Comorbidities (comma-separated)" }), _jsx(InlineSuggestInput, { value: input.comorbidities, onChange: (v) => updateField("comorbidities", v), placeholder: "e.g., diabetes mellitus, hypertension", suggestionType: "comorbidity", multiValue: true, minChars: 2 })] }), _jsxs("label", { style: { display: "grid", gap: 6, gridColumn: "span 2" }, children: [_jsx("span", { style: { fontWeight: 800, color: "var(--ink)" }, children: "Current Medications (comma-separated)" }), _jsx(InlineSuggestInput, { value: input.meds, onChange: (v) => updateField("meds", v), placeholder: "e.g., metformin, lisinopril", suggestionType: "drug", multiValue: true, minChars: 2 })] })] }), _jsx("button", { onClick: runDDx, disabled: !input.symptoms.trim() || busy, style: {
                                        marginTop: 14,
                                        padding: "12px 20px",
                                        borderRadius: 12,
                                        border: "1px solid rgba(14,165,164,0.35)",
                                        background: busy ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), var(--accent-2))",
                                        color: busy ? "var(--muted)" : "#fff",
                                        fontWeight: 800,
                                        cursor: busy ? "not-allowed" : "pointer",
                                        boxShadow: busy ? "none" : "0 12px 28px rgba(14,165,164,0.3)",
                                    }, children: busy ? "Running DDx…" : "🔍 Run Differential Diagnosis" }), errorMsg && _jsx("div", { style: { marginTop: 10, color: "#b91c1c" }, children: errorMsg })] }), data && (_jsxs("div", { style: { marginTop: 16, display: "grid", gap: 14 }, children: [_jsxs("div", { style: {
                                        background: "var(--surface)",
                                        borderRadius: 18,
                                        padding: 16,
                                        border: "1px solid rgba(185,28,28,0.2)",
                                        boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
                                    }, children: [_jsx("div", { style: { fontWeight: 900, color: "#b91c1c", fontSize: 16, display: "flex", alignItems: "center", gap: 8 }, children: "\uD83D\uDEA8 Must-not-miss (Immediate Action Required)" }), _jsxs("div", { style: { marginTop: 10, overflowX: "auto" }, children: [_jsxs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 14 }, children: [_jsx("thead", { children: _jsxs("tr", { style: { textAlign: "left", color: "var(--ink)" }, children: [_jsx("th", { style: th, children: "Diagnosis" }), _jsx("th", { style: th, children: "Key Clues" }), _jsx("th", { style: th, children: "Immediate Actions" })] }) }), _jsx("tbody", { children: mustNotMiss.map((row, idx) => (_jsxs("tr", { style: { borderTop: "1px solid var(--border)" }, children: [_jsx("td", { style: tdStrong, children: row.diagnosis }), _jsx("td", { style: tdMuted, children: (row.key_clues || row.clues || []).join("; ") }), _jsx("td", { style: tdMuted, children: (row.immediate_actions || []).join("; ") })] }, idx))) })] }), !mustNotMiss.length && _jsx("div", { style: { marginTop: 8, color: "var(--muted)" }, children: "No critical diagnoses flagged for this symptom cluster." })] })] }), _jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", fontSize: 16 }, children: "\uD83D\uDCCA Ranked Working Differential" }), _jsxs("div", { style: { marginTop: 10, display: "grid", gap: 8 }, children: [ranked.map((row, idx) => (_jsxs("div", { style: { border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "var(--surface-2)" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [_jsxs("div", { style: { fontWeight: 800, color: "var(--ink)", fontSize: 15 }, children: [idx + 1, ". ", row.diagnosis] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsx("span", { style: {
                                                                                fontSize: 12,
                                                                                fontWeight: 800,
                                                                                color: row.likelihood === "high" ? "#059669" : row.likelihood === "medium" ? "#d97706" : "var(--muted)",
                                                                                textTransform: "uppercase",
                                                                            }, children: row.likelihood }), _jsx("button", { onClick: () => nav(`/treatment?topic=${encodeURIComponent(row.diagnosis)}&source=ddx`), style: {
                                                                                padding: "4px 10px",
                                                                                borderRadius: 999,
                                                                                border: "1px solid var(--accent)",
                                                                                background: "var(--surface)",
                                                                                cursor: "pointer",
                                                                                fontWeight: 700,
                                                                                color: "var(--accent)",
                                                                                fontSize: 12,
                                                                            }, children: "\u2192 Treatment" })] })] }), !!(row.for?.length) && (_jsxs("div", { style: { color: "#059669", marginTop: 8, fontSize: 13 }, children: [_jsx("b", { children: "\u2713 For:" }), " ", row.for.join("; ")] })), !!(row.against?.length) && (_jsxs("div", { style: { color: "#b91c1c", marginTop: 4, fontSize: 13 }, children: [_jsx("b", { children: "\u2717 Against:" }), " ", row.against.join("; ")] })), !!(row.discriminating_tests?.length) && (_jsxs("div", { style: { color: "var(--muted)", marginTop: 4, fontSize: 13 }, children: [_jsx("b", { children: "Tests:" }), " ", row.discriminating_tests.join("; ")] }))] }, idx))), !ranked.length && _jsx("div", { style: { color: "var(--muted)" }, children: "No ranked differentials extracted." })] })] }), redFlags.length > 0 && (_jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid rgba(180,83,9,0.2)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "#b45309", fontSize: 16 }, children: "Red Flags / When to Escalate" }), _jsx("ul", { style: { margin: "8px 0 0 18px", color: "var(--muted)" }, children: redFlags.map((s, idx) => (_jsx("li", { children: s }, `rf-${idx}`))) })] })), _jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", fontSize: 16 }, children: "Rapid Diagnostic Algorithm" }), _jsxs("div", { style: { marginTop: 10, display: "grid", gap: 12 }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 800, color: "#b91c1c" }, children: "Step 1 \u2014 Immediate (within 1 hour)" }), _jsxs("ul", { style: { margin: "6px 0 0 18px", color: "var(--muted)" }, children: [algorithm.step_1.map((s, idx) => (_jsx("li", { children: s }, `s1-${idx}`))), algorithm.step_1.length === 0 && _jsx("li", { children: "No specific actions listed" })] })] }), _jsxs("div", { children: [_jsx("div", { style: { fontWeight: 800, color: "#d97706" }, children: "Step 2 \u2014 Next hours (1\u20134 hours)" }), _jsxs("ul", { style: { margin: "6px 0 0 18px", color: "var(--muted)" }, children: [algorithm.step_2.map((s, idx) => (_jsx("li", { children: s }, `s2-${idx}`))), algorithm.step_2.length === 0 && _jsx("li", { children: "Based on initial results" })] })] }), _jsxs("div", { children: [_jsx("div", { style: { fontWeight: 800, color: "var(--ink)" }, children: "Step 3 \u2014 If still unclear" }), _jsxs("ul", { style: { margin: "6px 0 0 18px", color: "var(--muted)" }, children: [algorithm.step_3.map((s, idx) => (_jsx("li", { children: s }, `s3-${idx}`))), algorithm.step_3.length === 0 && _jsx("li", { children: "Consider specialist consultation" })] })] })] })] }), _jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", fontSize: 16 }, children: "Suggested Investigations" }), _jsxs("div", { style: { marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 800, color: "#b91c1c", fontSize: 12, textTransform: "uppercase" }, children: "Urgent" }), _jsxs("ul", { style: { margin: "6px 0 0 18px", color: "var(--muted)", fontSize: 13 }, children: [investigations.urgent.map((s, idx) => (_jsx("li", { children: s }, `inv-u-${idx}`))), investigations.urgent.length === 0 && _jsx("li", { children: "\u2014" })] })] }), _jsxs("div", { children: [_jsx("div", { style: { fontWeight: 800, color: "#d97706", fontSize: 12, textTransform: "uppercase" }, children: "Soon" }), _jsxs("ul", { style: { margin: "6px 0 0 18px", color: "var(--muted)", fontSize: 13 }, children: [investigations.soon.map((s, idx) => (_jsx("li", { children: s }, `inv-s-${idx}`))), investigations.soon.length === 0 && _jsx("li", { children: "\u2014" })] })] }), _jsxs("div", { children: [_jsx("div", { style: { fontWeight: 800, color: "var(--muted)", fontSize: 12, textTransform: "uppercase" }, children: "Routine" }), _jsxs("ul", { style: { margin: "6px 0 0 18px", color: "var(--muted)", fontSize: 13 }, children: [investigations.routine.map((s, idx) => (_jsx("li", { children: s }, `inv-r-${idx}`))), investigations.routine.length === 0 && _jsx("li", { children: "\u2014" })] })] })] })] }), systemWise.length > 0 && (_jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", fontSize: 16 }, children: "\uD83C\uDFE5 System-wise Differential" }), _jsx("div", { style: { marginTop: 10, display: "grid", gap: 10 }, children: systemWise.map((group, idx) => (_jsxs("details", { open: idx < 2, children: [_jsx("summary", { style: { fontWeight: 800, cursor: "pointer", color: "var(--ink)" }, children: group.system }), _jsx("div", { style: { marginTop: 8, display: "grid", gap: 6, paddingLeft: 12 }, children: group.items.map((row, rIdx) => (_jsxs("div", { style: { fontSize: 13, color: "var(--muted)" }, children: ["\u2022 ", _jsx("b", { style: { color: "var(--ink)" }, children: row.diagnosis }), row.key_points?.length > 0 && `: ${row.key_points.join("; ")}`] }, `${group.system}-${rIdx}`))) })] }, `${group.system}-${idx}`))) })] })), _jsxs("details", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("summary", { style: { fontWeight: 900, cursor: "pointer", color: "var(--ink)" }, children: "\uD83D\uDCDA Evidence Sources" }), _jsx("div", { style: { marginTop: 10, display: "grid", gap: 8 }, children: (data.evidence || []).map((e, idx) => (_jsxs("div", { style: { fontSize: 12, color: "var(--muted)", padding: 8, background: "var(--surface-2)", borderRadius: 8 }, children: [_jsxs("div", { style: { fontWeight: 700 }, children: [e.source?.title, " ", e.source?.page_start ? `p${e.source.page_start}` : ""] }), _jsx("div", { style: { marginTop: 4 }, children: e.snippet }), _jsxs("div", { style: { color: "var(--muted-2)", marginTop: 2 }, children: ["evidence_id: ", e.id] })] }, idx))) })] }), _jsxs("div", { style: {
                                        background: "var(--surface)",
                                        borderRadius: 18,
                                        padding: 16,
                                        border: coverage.passed ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(234,88,12,0.3)",
                                    }, children: [_jsx("div", { style: { fontWeight: 900, color: coverage.passed ? "#059669" : "#b45309" }, children: coverage.passed ? "Coverage Gate Passed" : "Coverage Gate Issues" }), !coverage.passed && coverage.missing_evidence_ids?.length > 0 && (_jsxs("div", { style: { marginTop: 6, color: "var(--muted)", fontSize: 12 }, children: ["Some diagnoses may lack supporting evidence. Missing: ", coverage.missing_evidence_ids.join(", ")] }))] })] })), !data && !busy && (_jsxs("div", { style: { marginTop: 24, padding: 24, textAlign: "center", color: "var(--muted)" }, children: [_jsx("div", { style: { fontSize: 48, marginBottom: 12 } }), _jsx("div", { style: { fontWeight: 700 }, children: "Enter patient symptoms to generate differential diagnosis" }), _jsx("div", { style: { marginTop: 8 }, children: "Provide symptoms, duration, and patient details for a comprehensive differential." })] }))] })] }) }));
}
const inputStyle = {
    padding: 10,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "var(--ink)",
};
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
