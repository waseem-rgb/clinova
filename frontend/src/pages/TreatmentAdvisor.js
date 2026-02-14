import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { API_BASE } from "../services/api";
import SidebarNav from "../components/SidebarNav";
import InlineSuggestInput from "../components/InlineSuggestInput";
import { loadTreatmentState, saveTreatmentState, clearSearchState, } from "../app/lib/searchMemory";
const INITIAL_INPUT = {
    topic: "",
    age: "",
    sex: "unknown",
    pregnancy: "unknown",
    severity: "",
    setting: "",
    comorbidities: "",
    allergies: "",
    renal: "",
    hepatic: "",
    currentMeds: "",
};
export default function TreatmentAdvisor() {
    const nav = useNavigate();
    const location = useLocation();
    const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const [input, setInput] = useState(INITIAL_INPUT);
    const [busy, setBusy] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [data, setData] = useState(null);
    // Restore state on mount
    useEffect(() => {
        const saved = loadTreatmentState();
        if (saved) {
            setInput(saved.input);
            setData(saved.output);
        }
    }, []);
    // Handle topic from URL query params (from DDx)
    useEffect(() => {
        const fromQuery = params.get("topic") || params.get("diagnosis") || "";
        if (fromQuery && !input.topic) {
            setInput((prev) => ({ ...prev, topic: fromQuery }));
        }
    }, [params, input.topic]);
    const updateField = (key, value) => {
        setInput((prev) => ({ ...prev, [key]: value }));
    };
    async function runTx() {
        setBusy(true);
        setErrorMsg("");
        try {
            const res = await fetch(`${API_BASE}/treatment/plan`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    topic_or_diagnosis: input.topic,
                    context: {
                        age: input.age ? Number(input.age) : null,
                        sex: input.sex,
                        pregnancy: input.pregnancy,
                        severity: input.severity || null,
                        setting: input.setting || null,
                        comorbidities: input.comorbidities ? input.comorbidities.split(",").map((s) => s.trim()).filter(Boolean) : [],
                        allergies: input.allergies ? input.allergies.split(",").map((s) => s.trim()).filter(Boolean) : [],
                        renal_status: input.renal || null,
                        hepatic_status: input.hepatic || null,
                        current_meds: input.currentMeds ? input.currentMeds.split(",").map((s) => s.trim()).filter(Boolean) : [],
                    },
                    confirmed_diagnosis: true,
                    source: params.get("source") || "direct",
                }),
            });
            if (!res.ok)
                throw new Error(await res.text());
            const result = await res.json();
            setData(result);
            // Save to memory
            saveTreatmentState(input, result);
        }
        catch (e) {
            setErrorMsg(e?.message || "Failed to fetch treatment");
        }
        finally {
            setBusy(false);
        }
    }
    function handleNewSearch() {
        setInput(INITIAL_INPUT);
        setData(null);
        setErrorMsg("");
        clearSearchState("treatment");
    }
    // Handoff: Navigate to Drug Details for a specific drug
    function handleDrugDetails(drug) {
        nav(`/drug?q=${encodeURIComponent(drug)}&source=treatment`);
    }
    // Handoff: Navigate to Interactions for a specific drug
    function handleCheckInteractions(drug) {
        nav(`/interactions?drug=${encodeURIComponent(drug)}&source=treatment`);
    }
    // Handoff: Batch check all drugs from the treatment plan
    function handleCheckAllInteractions() {
        const allDrugs = [];
        // Collect all drugs from first-line and second-line regimens
        const firstLine = data?.first_line_regimens || [];
        const secondLine = data?.second_line_regimens || [];
        [...firstLine, ...secondLine].forEach((plan) => {
            (plan.drugs || []).forEach((drug) => {
                if (drug.generic && !allDrugs.includes(drug.generic)) {
                    allDrugs.push(drug.generic);
                }
            });
        });
        // Also add current meds from input if any
        if (input.currentMeds) {
            input.currentMeds.split(",").forEach((med) => {
                const trimmed = med.trim();
                if (trimmed && !allDrugs.includes(trimmed)) {
                    allDrugs.push(trimmed);
                }
            });
        }
        if (allDrugs.length > 0) {
            nav(`/interactions?drugs=${encodeURIComponent(allDrugs.join(","))}&source=treatment`);
        }
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
                            }, children: "Treatment Advisor" }), _jsxs("div", { style: {
                                marginTop: 16,
                                background: "var(--surface)",
                                borderRadius: 18,
                                border: "1px solid var(--border)",
                                padding: 18,
                                boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
                            }, children: [_jsxs("label", { style: { display: "grid", gap: 6 }, children: [_jsx("span", { style: { fontWeight: 800, color: "var(--ink)" }, children: "Condition / Topic *" }), _jsx(InlineSuggestInput, { value: input.topic, onChange: (v) => updateField("topic", v), placeholder: "e.g., community acquired pneumonia", suggestionType: "disease", minChars: 2 })] }), _jsxs("div", { style: { marginTop: 12, display: "grid", gap: 10, gridTemplateColumns: "repeat(3, 1fr)" }, children: [_jsxs("label", { style: { display: "grid", gap: 6 }, children: [_jsx("span", { style: { fontWeight: 800, color: "var(--ink)" }, children: "Age" }), _jsx("input", { value: input.age, onChange: (e) => updateField("age", e.target.value), placeholder: "e.g., 54", type: "number", style: inputStyle })] }), _jsxs("label", { style: { display: "grid", gap: 6 }, children: [_jsx("span", { style: { fontWeight: 800, color: "var(--ink)" }, children: "Sex" }), _jsxs("select", { value: input.sex, onChange: (e) => updateField("sex", e.target.value), style: inputStyle, children: [_jsx("option", { value: "unknown", children: "Unknown" }), _jsx("option", { value: "male", children: "Male" }), _jsx("option", { value: "female", children: "Female" })] })] }), _jsxs("label", { style: { display: "grid", gap: 6 }, children: [_jsx("span", { style: { fontWeight: 800, color: "var(--ink)" }, children: "Pregnancy" }), _jsxs("select", { value: input.pregnancy, onChange: (e) => updateField("pregnancy", e.target.value), style: inputStyle, children: [_jsx("option", { value: "unknown", children: "Unknown" }), _jsx("option", { value: "no", children: "No" }), _jsx("option", { value: "yes", children: "Yes" })] })] }), _jsxs("label", { style: { display: "grid", gap: 6 }, children: [_jsx("span", { style: { fontWeight: 800, color: "var(--ink)" }, children: "Severity" }), _jsx(InlineSuggestInput, { value: input.severity, onChange: (v) => updateField("severity", v), placeholder: "mild/moderate/severe", suggestionType: "severity", minChars: 1 })] }), _jsxs("label", { style: { display: "grid", gap: 6 }, children: [_jsx("span", { style: { fontWeight: 800, color: "var(--ink)" }, children: "Setting" }), _jsx(InlineSuggestInput, { value: input.setting, onChange: (v) => updateField("setting", v), placeholder: "OPD/ER/ICU", suggestionType: "setting", minChars: 1 })] }), _jsxs("label", { style: { display: "grid", gap: 6 }, children: [_jsx("span", { style: { fontWeight: 800, color: "var(--ink)" }, children: "Comorbidities (comma)" }), _jsx(InlineSuggestInput, { value: input.comorbidities, onChange: (v) => updateField("comorbidities", v), placeholder: "e.g., diabetes mellitus, CKD", suggestionType: "comorbidity", multiValue: true, minChars: 2 })] }), _jsxs("label", { style: { display: "grid", gap: 6 }, children: [_jsx("span", { style: { fontWeight: 800, color: "var(--ink)" }, children: "Allergies (comma)" }), _jsx(InlineSuggestInput, { value: input.allergies, onChange: (v) => updateField("allergies", v), placeholder: "e.g., penicillin, sulfa", suggestionType: "drug", multiValue: true, minChars: 2 })] }), _jsxs("label", { style: { display: "grid", gap: 6 }, children: [_jsx("span", { style: { fontWeight: 800, color: "var(--ink)" }, children: "Renal status" }), _jsx(InlineSuggestInput, { value: input.renal, onChange: (v) => updateField("renal", v), placeholder: "e.g., CKD stage 3", suggestionType: "renal", minChars: 2 })] }), _jsxs("label", { style: { display: "grid", gap: 6 }, children: [_jsx("span", { style: { fontWeight: 800, color: "var(--ink)" }, children: "Hepatic status" }), _jsx(InlineSuggestInput, { value: input.hepatic, onChange: (v) => updateField("hepatic", v), placeholder: "e.g., cirrhosis Child-Pugh B", suggestionType: "hepatic", minChars: 2 })] }), _jsxs("label", { style: { display: "grid", gap: 6 }, children: [_jsx("span", { style: { fontWeight: 800, color: "var(--ink)" }, children: "Current meds (comma)" }), _jsx(InlineSuggestInput, { value: input.currentMeds, onChange: (v) => updateField("currentMeds", v), placeholder: "e.g., lisinopril, metformin", suggestionType: "drug", multiValue: true, minChars: 2 })] })] }), _jsx("button", { onClick: runTx, disabled: !input.topic.trim() || busy, style: {
                                        marginTop: 14,
                                        padding: "12px 20px",
                                        borderRadius: 12,
                                        border: "1px solid rgba(14,165,164,0.35)",
                                        background: busy ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), var(--accent-2))",
                                        color: busy ? "var(--muted)" : "#fff",
                                        fontWeight: 800,
                                        cursor: busy ? "not-allowed" : "pointer",
                                        boxShadow: busy ? "none" : "0 12px 28px rgba(14,165,164,0.3)",
                                    }, children: busy ? "Loading..." : "Get Treatment Plan" }), errorMsg && _jsx("div", { style: { marginTop: 10, color: "#b91c1c" }, children: errorMsg })] }), data && (_jsxs("div", { style: { marginTop: 16, display: "grid", gap: 14 }, children: [_jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", fontSize: 16 }, children: "Summary Plan" }), _jsx("ul", { style: { margin: "8px 0 0 18px", color: "var(--muted)" }, children: (data.summary_plan || []).map((s, idx) => (_jsx("li", { children: s }, `sum-${idx}`))) })] }), _jsx(SectionPlan, { title: "First-line Regimen", plans: data.first_line_regimens || [], onDrugDetails: handleDrugDetails, onCheckInteractions: handleCheckInteractions }), _jsx(SectionPlan, { title: "Second-line / Alternatives", plans: data.second_line_regimens || [], onDrugDetails: handleDrugDetails, onCheckInteractions: handleCheckInteractions }), _jsxs("div", { style: {
                                        background: "linear-gradient(135deg, rgba(234,88,12,0.08), rgba(234,88,12,0.04))",
                                        borderRadius: 18,
                                        padding: 16,
                                        border: "1px solid rgba(234,88,12,0.25)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: 12,
                                    }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 900, color: "#ea580c", fontSize: 15 }, children: "Check All Drug Interactions" }), _jsx("div", { style: { color: "var(--muted)", fontSize: 13, marginTop: 4 }, children: "Verify interactions between all recommended drugs and current medications" })] }), _jsx("button", { onClick: handleCheckAllInteractions, style: {
                                                padding: "10px 18px",
                                                borderRadius: 12,
                                                border: "1px solid #ea580c",
                                                background: "linear-gradient(135deg, #ea580c, #dc2626)",
                                                color: "#fff",
                                                fontWeight: 800,
                                                cursor: "pointer",
                                                boxShadow: "0 8px 20px rgba(234,88,12,0.25)",
                                                whiteSpace: "nowrap",
                                            }, children: "Check Interactions \u2192" })] }), _jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", fontSize: 16 }, children: "Supportive Care" }), _jsx("ul", { style: { margin: "8px 0 0 18px", color: "var(--muted)" }, children: (data.supportive_care || []).map((s, idx) => (_jsx("li", { children: s }, `sup-${idx}`))) })] }), _jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid rgba(185,28,28,0.2)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "#b91c1c", fontSize: 16 }, children: "Contraindications & Cautions" }), _jsx("ul", { style: { margin: "8px 0 0 18px", color: "var(--muted)" }, children: (data.contraindications_and_cautions || []).map((s, idx) => (_jsx("li", { children: s }, `ci-${idx}`))) })] }), _jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", fontSize: 16 }, children: "Monitoring" }), _jsx("ul", { style: { margin: "8px 0 0 18px", color: "var(--muted)" }, children: (data.monitoring || []).map((s, idx) => (_jsx("li", { children: s }, `mon-${idx}`))) })] }), !!(data.drug_interactions_flags || []).length && (_jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid rgba(234,88,12,0.3)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "#ea580c", fontSize: 16 }, children: "Drug Interaction Flags" }), _jsx("ul", { style: { margin: "8px 0 0 18px", color: "var(--muted)" }, children: (data.drug_interactions_flags || []).map((s, idx) => (_jsx("li", { children: s.message || s }, `int-${idx}`))) })] })), _jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", fontSize: 16 }, children: "Follow-up" }), _jsx("ul", { style: { margin: "8px 0 0 18px", color: "var(--muted)" }, children: (data.follow_up || []).map((s, idx) => (_jsx("li", { children: s }, `fup-${idx}`))) })] }), _jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid rgba(185,28,28,0.2)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "#b91c1c", fontSize: 16 }, children: "Red Flags / Urgent Referral" }), _jsx("ul", { style: { margin: "8px 0 0 18px", color: "var(--muted)" }, children: (data.red_flags_urgent_referral || []).map((s, idx) => (_jsx("li", { children: s }, `rf-${idx}`))) })] }), _jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", fontSize: 16 }, children: "India Brand Suggestions" }), _jsx("div", { style: { marginTop: 10, display: "grid", gap: 10 }, children: (data.brands_india || []).map((b, idx) => (_jsxs("div", { style: { padding: 10, background: "var(--surface-2)", borderRadius: 10, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 800, color: "var(--ink)" }, children: b.generic }), _jsx("div", { style: { color: "var(--muted)", fontSize: 13, marginTop: 4 }, children: (b.brand_names || []).length > 0
                                                            ? (b.brand_names || []).join(", ")
                                                            : b.price_notes || "Brands not available in sources" }), !!(b.strengths || []).length && (_jsxs("div", { style: { color: "var(--muted)", fontSize: 12, marginTop: 2 }, children: ["Strengths: ", b.strengths.join("; ")] })), !!(b.forms || []).length && (_jsxs("div", { style: { color: "var(--muted)", fontSize: 12, marginTop: 2 }, children: ["Forms: ", b.forms.join("; ")] }))] }, idx))) })] }), _jsxs("details", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("summary", { style: { fontWeight: 900, cursor: "pointer", color: "var(--ink)" }, children: "Evidence Sources" }), _jsx("div", { style: { marginTop: 10, display: "grid", gap: 8 }, children: (data.evidence?.chunks || []).map((e, idx) => (_jsxs("div", { style: { fontSize: 12, color: "var(--muted)", padding: 8, background: "var(--surface-2)", borderRadius: 8 }, children: [_jsx("div", { style: { marginBottom: 4 }, children: e.excerpt }), e.book_id && (_jsxs("div", { style: { color: "var(--muted-2)", fontWeight: 600 }, children: [e.book_id, " \u2022 ", e.section_path, " \u2022 p", e.page_start] })), _jsxs("div", { style: { color: "var(--muted-2)" }, children: ["chunk_id: ", e.chunk_id] })] }, idx))) })] }), _jsxs("div", { style: {
                                        background: "var(--surface)",
                                        borderRadius: 18,
                                        padding: 16,
                                        border: data.evidence?.coverage?.pass
                                            ? "1px solid rgba(16,185,129,0.3)"
                                            : "1px solid rgba(234,88,12,0.3)",
                                    }, children: [_jsx("div", { style: {
                                                fontWeight: 900,
                                                color: data.evidence?.coverage?.pass ? "#059669" : "#b45309",
                                            }, children: data.evidence?.coverage?.pass ? "Coverage Gate Passed" : "Coverage Gate Issues" }), !data.evidence?.coverage?.pass && (data.evidence?.coverage?.missing || []).length > 0 && (_jsxs("div", { style: { marginTop: 6, color: "var(--muted)", fontSize: 12 }, children: ["Missing evidence for: ", (data.evidence?.coverage?.missing || []).join(", ")] }))] })] })), !data && !busy && (_jsxs("div", { style: { marginTop: 24, padding: 24, textAlign: "center", color: "var(--muted)" }, children: [_jsx("div", { style: { fontSize: 48, marginBottom: 12 } }), _jsx("div", { style: { fontWeight: 700 }, children: "Enter a condition to get treatment recommendations" }), _jsx("div", { style: { marginTop: 8 }, children: "Provide patient details for personalized drug regimens with doses, monitoring, and India brand options." })] }))] })] }) }));
}
function SectionPlan({ title, plans, onDrugDetails, onCheckInteractions }) {
    return (_jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", fontSize: 16 }, children: title }), (plans || []).map((plan, idx) => (_jsxs("div", { style: { marginTop: 12, border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "var(--surface-2)" }, children: [_jsx("div", { style: { fontWeight: 800, color: "var(--ink)" }, children: plan.label }), _jsx("div", { style: { marginTop: 8, overflowX: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 14 }, children: [_jsx("thead", { children: _jsxs("tr", { style: { textAlign: "left", color: "var(--ink)" }, children: [_jsx("th", { style: th, children: "Drug" }), _jsx("th", { style: th, children: "Dose" }), _jsx("th", { style: th, children: "Route" }), _jsx("th", { style: th, children: "Frequency" }), _jsx("th", { style: th, children: "Duration" }), _jsx("th", { style: th, children: "Renal/Hepatic" }), _jsx("th", { style: th, children: "Actions" })] }) }), _jsx("tbody", { children: (plan.drugs || []).map((row, rIdx) => (_jsxs("tr", { style: { borderTop: "1px solid var(--border)" }, children: [_jsx("td", { style: tdStrong, children: row.generic || "—" }), _jsx("td", { style: tdMuted, children: row.dose || "—" }), _jsx("td", { style: tdMuted, children: row.route || "—" }), _jsx("td", { style: tdMuted, children: row.frequency || "—" }), _jsx("td", { style: tdMuted, children: row.duration || "—" }), _jsx("td", { style: tdMuted, children: [row.renal_adjustment, row.hepatic_adjustment].filter(Boolean).join(" / ") || "—" }), _jsx("td", { style: tdMuted, children: row.generic && (_jsxs("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" }, children: [_jsx("button", { onClick: () => onDrugDetails?.(row.generic), style: {
                                                                padding: "4px 8px",
                                                                borderRadius: 6,
                                                                border: "1px solid var(--accent)",
                                                                background: "var(--surface)",
                                                                cursor: "pointer",
                                                                fontWeight: 700,
                                                                color: "var(--accent)",
                                                                fontSize: 11,
                                                                whiteSpace: "nowrap",
                                                            }, title: `View details for ${row.generic}`, children: "\uD83D\uDCCB Details" }), _jsx("button", { onClick: () => onCheckInteractions?.(row.generic), style: {
                                                                padding: "4px 8px",
                                                                borderRadius: 6,
                                                                border: "1px solid #ea580c",
                                                                background: "var(--surface)",
                                                                cursor: "pointer",
                                                                fontWeight: 700,
                                                                color: "#ea580c",
                                                                fontSize: 11,
                                                                whiteSpace: "nowrap",
                                                            }, title: `Check interactions for ${row.generic}`, children: "Check" })] })) })] }, rIdx))) })] }) }), !!plan.indication_notes && _jsx("div", { style: { marginTop: 8, color: "var(--muted)", fontSize: 13 }, children: plan.indication_notes })] }, idx)))] }));
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
