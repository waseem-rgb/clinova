import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// frontend/src/pages/LabInterpretation.tsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../services/api";
import SidebarNav from "../components/SidebarNav";
function severityRank(s) {
    return s === "critical" ? 5 : s === "severe" ? 4 : s === "moderate" ? 3 : s === "borderline" ? 2 : s === "mild" ? 1 : 0;
}
function badgeStyles(sev) {
    const base = {
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        color: "var(--ink)",
    };
    // keep it subtle (doctor-grade, not flashy)
    if (sev === "critical")
        return { ...base, borderColor: "rgba(220,38,38,0.35)" };
    if (sev === "severe")
        return { ...base, borderColor: "rgba(245,158,11,0.35)" };
    if (sev === "moderate")
        return { ...base, borderColor: "rgba(59,130,246,0.35)" };
    return base;
}
export default function LabInterpretation() {
    const nav = useNavigate();
    const [files, setFiles] = useState([]);
    const [ctxAge, setCtxAge] = useState("");
    const [ctxSex, setCtxSex] = useState("unknown");
    const [ctxPreg, setCtxPreg] = useState("unknown");
    const [ctxDx, setCtxDx] = useState("");
    const [ctxMeds, setCtxMeds] = useState("");
    const [ctxChief, setCtxChief] = useState("");
    const [busy, setBusy] = useState(false);
    const [ready, setReady] = useState(false);
    const [abnorm, setAbnorm] = useState([]);
    const [patterns, setPatterns] = useState([]);
    const [summaryAbn, setSummaryAbn] = useState([]);
    const [coverage, setCoverage] = useState(null);
    const [counts, setCounts] = useState({ tests: 0, abnormalities: 0 });
    const [errorMsg, setErrorMsg] = useState("");
    // filters
    const [onlyCritical, setOnlyCritical] = useState(false);
    const [panelFilter, setPanelFilter] = useState("All");
    const [query, setQuery] = useState("");
    const panels = useMemo(() => {
        const set = new Set();
        for (const a of abnorm)
            set.add(a.panel);
        return ["All", ...Array.from(set).sort()];
    }, [abnorm]);
    const filteredAbnorm = useMemo(() => {
        let list = [...abnorm];
        if (onlyCritical)
            list = list.filter((a) => a.severity === "critical" || (a.flag ?? "").toLowerCase() === "critical");
        if (panelFilter !== "All")
            list = list.filter((a) => a.panel === panelFilter);
        const q = query.trim().toLowerCase();
        if (q) {
            list = list.filter((a) => {
                return (a.test.toLowerCase().includes(q) ||
                    a.panel.toLowerCase().includes(q) ||
                    (a.notes ?? "").toLowerCase().includes(q));
            });
        }
        // sort: highest severity first, then panel/test
        list.sort((a, b) => {
            const d = severityRank(b.severity) - severityRank(a.severity);
            if (d !== 0)
                return d;
            if (a.panel !== b.panel)
                return a.panel.localeCompare(b.panel);
            return a.test.localeCompare(b.test);
        });
        return list;
    }, [abnorm, onlyCritical, panelFilter, query]);
    const keyAbnorm = useMemo(() => {
        if (summaryAbn.length)
            return summaryAbn;
        return [...abnorm]
            .slice()
            .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
            .slice(0, 5)
            .map((a) => ({
            test: a.test,
            panel: a.panel,
            value: a.result,
            unit: a.unit,
            severity: a.severity,
            note: a.notes,
        }));
    }, [abnorm, summaryAbn]);
    function onPickFiles(e) {
        const picked = Array.from(e.target.files ?? []);
        if (!picked.length)
            return;
        // append and dedupe by name+size
        const merged = [...files, ...picked];
        const seen = new Set();
        const deduped = [];
        for (const f of merged) {
            const k = `${f.name}__${f.size}`;
            if (seen.has(k))
                continue;
            seen.add(k);
            deduped.push(f);
        }
        setFiles(deduped);
        e.target.value = "";
    }
    function removeFile(idx) {
        const next = files.slice();
        next.splice(idx, 1);
        setFiles(next);
    }
    async function runAnalyze() {
        console.log("[Lab] runAnalyze called with files:", files.length, files.map(f => f.name));
        setBusy(true);
        setReady(false);
        setErrorMsg("");
        try {
            const form = new FormData();
            files.forEach((f) => {
                console.log("[Lab] Appending file:", f.name, f.size);
                form.append("files", f);
            });
            if (ctxAge)
                form.append("age", ctxAge);
            if (ctxSex)
                form.append("sex", ctxSex);
            if (ctxPreg)
                form.append("pregnancy", ctxPreg);
            if (ctxDx)
                form.append("known_dx", ctxDx);
            if (ctxMeds)
                form.append("current_meds", ctxMeds);
            if (ctxChief)
                form.append("chief_complaint", ctxChief);
            console.log("[Lab] Sending request to:", `${API_BASE}/lab/analyze?include_evidence=false`);
            const res = await fetch(`${API_BASE}/lab/analyze?include_evidence=false`, {
                method: "POST",
                body: form,
            });
            console.log("[Lab] Response status:", res.status, res.statusText);
            if (!res.ok) {
                const text = await res.text();
                console.error("[Lab] Error response:", text);
                throw new Error(text || `HTTP ${res.status}`);
            }
            const data = await res.json();
            console.log("[Lab] Response data:", data);
            console.log("[Lab] Extracted tests count:", data.extracted_tests_count);
            console.log("[Lab] Abnormalities count:", data.abnormalities_count);
            const mappedAbn = (data.abnormalities ?? []).map((a) => ({
                panel: a.panel,
                test: a.test,
                result: String(a.result ?? ""),
                unit: a.unit ?? undefined,
                range: a.range ?? undefined,
                flag: a.flag ?? undefined,
                severity: (a.severity || "normal").toLowerCase(),
                notes: a.notes ?? "",
            }));
            const mappedPatterns = (data.patterns ?? []).map((p) => ({
                title: p.title,
                summary: p.summary,
                likely_conditions: p.likely_conditions ?? [],
                red_flags: p.red_flags ?? [],
                next_investigations: (p.next_investigations ?? []).map((n) => ({
                    test: n.test,
                    why: n.why,
                    whatItHelps: n.what_it_helps,
                })),
            }));
            const mappedSummary = (data.executive_summary?.key_abnormalities ?? []).map((a) => ({
                test: a.test,
                panel: a.panel,
                value: String(a.value ?? ""),
                unit: a.unit ?? undefined,
                severity: (a.severity || "normal").toLowerCase(),
                note: a.note ?? "",
            }));
            setAbnorm(mappedAbn);
            setPatterns(mappedPatterns);
            setSummaryAbn(mappedSummary);
            setCoverage(data.coverage ?? null);
            setCounts({ tests: data.extracted_tests_count ?? 0, abnormalities: data.abnormalities_count ?? 0 });
            setReady(true);
        }
        catch (err) {
            setErrorMsg(err?.message || "Failed to analyze lab report.");
        }
        finally {
            setBusy(false);
        }
    }
    function clearAll() {
        setFiles([]);
        setCtxAge("");
        setCtxSex("unknown");
        setCtxPreg("unknown");
        setCtxDx("");
        setCtxMeds("");
        setCtxChief("");
        setAbnorm([]);
        setPatterns([]);
        setSummaryAbn([]);
        setCoverage(null);
        setCounts({ tests: 0, abnormalities: 0 });
        setErrorMsg("");
        setReady(false);
        setOnlyCritical(false);
        setPanelFilter("All");
        setQuery("");
    }
    const ctxLine = useMemo(() => {
        const bits = [];
        if (ctxAge.trim())
            bits.push(`Age ${ctxAge.trim()}`);
        if (ctxSex !== "unknown")
            bits.push(ctxSex === "male" ? "Male" : "Female");
        if (ctxPreg !== "unknown")
            bits.push(ctxPreg === "yes" ? "Pregnant" : "Not pregnant");
        if (ctxDx.trim())
            bits.push(`Known Dx: ${ctxDx.trim()}`);
        if (ctxMeds.trim())
            bits.push(`Meds: ${ctxMeds.trim()}`);
        if (ctxChief.trim())
            bits.push(`Complaint: ${ctxChief.trim()}`);
        return bits.join(" • ");
    }, [ctxAge, ctxSex, ctxPreg, ctxDx, ctxMeds, ctxChief]);
    return (_jsx("div", { style: { minHeight: "100vh", background: "var(--page-bg)", padding: "24px 24px 24px 0" }, children: _jsxs("div", { style: { maxWidth: "100%", minWidth: 1200, margin: 0, display: "grid", gridTemplateColumns: "260px 1fr", gap: 24 }, children: [_jsx(SidebarNav, {}), _jsxs("div", { children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }, children: [_jsx("button", { onClick: () => nav("/"), style: {
                                        border: "1px solid var(--border)",
                                        background: "var(--surface)",
                                        padding: "8px 12px",
                                        borderRadius: 12,
                                        cursor: "pointer",
                                        fontWeight: 800,
                                        color: "var(--ink)",
                                        boxShadow: "0 8px 18px rgba(15,23,42,0.08)",
                                    }, children: "\u2190 Back" }), _jsxs("div", { style: { display: "flex", gap: 10 }, children: [_jsx("button", { onClick: clearAll, style: {
                                                border: "1px solid var(--border)",
                                                background: "var(--surface)",
                                                padding: "8px 12px",
                                                borderRadius: 12,
                                                cursor: "pointer",
                                                fontWeight: 800,
                                                color: "var(--ink)",
                                                boxShadow: "0 8px 18px rgba(15,23,42,0.08)",
                                            }, children: "Clear" }), _jsx("button", { onClick: runAnalyze, disabled: busy || files.length === 0, style: {
                                                border: "1px solid rgba(14,165,164,0.35)",
                                                background: busy || files.length === 0
                                                    ? "var(--surface-2)"
                                                    : "linear-gradient(135deg, var(--accent), var(--accent-2))",
                                                padding: "8px 12px",
                                                borderRadius: 12,
                                                cursor: busy || files.length === 0 ? "not-allowed" : "pointer",
                                                fontWeight: 900,
                                                color: busy || files.length === 0 ? "var(--muted)" : "#fff",
                                                boxShadow: busy || files.length === 0 ? "none" : "0 12px 28px rgba(14,165,164,0.3)",
                                            }, title: files.length === 0 ? "Upload at least one PDF first" : "Parse and interpret", children: busy ? "Processing…" : "Interpret" })] })] }), _jsxs("div", { style: { marginTop: 16 }, children: [_jsx("div", { style: {
                                        fontSize: 36,
                                        fontWeight: 700,
                                        color: "var(--ink)",
                                        letterSpacing: -0.6,
                                        fontFamily: "var(--font-display)",
                                    }, children: "Lab Interpretation" }), _jsx("div", { style: { color: "var(--muted)", marginTop: 4 }, children: "Upload medical report PDFs \u2192 identify abnormalities \u2192 doctor-friendly interpretation & next steps." })] }), _jsxs("div", { style: {
                                marginTop: 16,
                                display: "grid",
                                gridTemplateColumns: "1.2fr 0.8fr",
                                gap: 14,
                            }, children: [_jsxs("div", { style: {
                                        background: "var(--surface)",
                                        border: "1px solid var(--border)",
                                        borderRadius: 18,
                                        padding: 16,
                                        boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
                                    }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", fontSize: 16 }, children: "Upload PDFs" }), _jsx("div", { style: { color: "var(--muted-2)", fontSize: 12 }, children: "Multiple files supported \u2022 30+ pages OK" })] }), _jsxs("div", { style: {
                                                marginTop: 12,
                                                borderRadius: 14,
                                                border: "1px dashed rgba(15,23,42,0.2)",
                                                background: "var(--surface-2)",
                                                padding: 14,
                                            }, children: [_jsx("input", { type: "file", accept: "application/pdf", multiple: true, onChange: onPickFiles, style: { width: "100%" } }), _jsx("div", { style: { marginTop: 8, color: "var(--muted-2)", fontSize: 12 }, children: "Tip: Upload all PDFs for the same patient visit together for a combined interpretation." })] }), _jsx("div", { style: { marginTop: 12 }, children: files.length === 0 ? (_jsx("div", { style: { color: "var(--muted)" }, children: "No files uploaded yet." })) : (_jsx("div", { style: { display: "grid", gap: 8 }, children: files.map((f, idx) => (_jsxs("div", { style: {
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "space-between",
                                                        gap: 10,
                                                        border: "1px solid var(--border)",
                                                        borderRadius: 12,
                                                        padding: "10px 10px",
                                                        background: "var(--surface-2)",
                                                    }, children: [_jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { style: {
                                                                        fontWeight: 800,
                                                                        color: "var(--ink)",
                                                                        overflow: "hidden",
                                                                        textOverflow: "ellipsis",
                                                                        whiteSpace: "nowrap",
                                                                    }, children: f.name }), _jsxs("div", { style: { color: "var(--muted-2)", fontSize: 12 }, children: [(f.size / (1024 * 1024)).toFixed(2), " MB"] })] }), _jsx("button", { onClick: () => removeFile(idx), style: {
                                                                border: "1px solid var(--border)",
                                                                background: "var(--surface)",
                                                                borderRadius: 10,
                                                                padding: "6px 10px",
                                                                cursor: "pointer",
                                                                fontWeight: 800,
                                                                color: "var(--ink)",
                                                            }, children: "Remove" })] }, `${f.name}-${f.size}-${idx}`))) })) })] }), _jsxs("div", { style: {
                                        background: "var(--surface)",
                                        border: "1px solid var(--border)",
                                        borderRadius: 18,
                                        padding: 16,
                                        boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
                                    }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", fontSize: 16 }, children: "Clinical context (optional)" }), _jsx("div", { style: { color: "var(--muted-2)", fontSize: 12, marginTop: 4 }, children: "Adds relevance (e.g., CKD/DM/pregnancy affects interpretation)." }), _jsxs("div", { style: { marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }, children: [_jsx(Field, { label: "Age", value: ctxAge, onChange: setCtxAge, placeholder: "e.g., 54" }), _jsx(SelectField, { label: "Sex", value: ctxSex, onChange: (v) => setCtxSex(v), options: [
                                                        { value: "unknown", label: "Unknown" },
                                                        { value: "male", label: "Male" },
                                                        { value: "female", label: "Female" },
                                                    ] }), _jsx(SelectField, { label: "Pregnancy", value: ctxPreg, onChange: (v) => setCtxPreg(v), options: [
                                                        { value: "unknown", label: "Unknown" },
                                                        { value: "no", label: "No" },
                                                        { value: "yes", label: "Yes" },
                                                    ] }), _jsx(Field, { label: "Known Dx", value: ctxDx, onChange: setCtxDx, placeholder: "e.g., DM, CKD" })] }), _jsx("div", { style: { marginTop: 10 }, children: _jsx(Field, { label: "Current meds", value: ctxMeds, onChange: setCtxMeds, placeholder: "e.g., ACE inhibitor, diuretics" }) }), _jsx("div", { style: { marginTop: 10 }, children: _jsx(Field, { label: "Chief complaint", value: ctxChief, onChange: setCtxChief, placeholder: "e.g., fever, vomiting, jaundice" }) }), _jsx("div", { style: { marginTop: 10, color: "var(--muted-2)", fontSize: 12 }, children: ctxLine ? (_jsxs("span", { children: [_jsx("b", { children: "Context:" }), " ", ctxLine] })) : ("No context added.") })] })] }), _jsx("div", { style: { marginTop: 16 }, children: !ready ? (_jsx("div", { style: {
                                    background: "var(--surface)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 18,
                                    padding: 16,
                                    color: "var(--muted)",
                                }, children: busy
                                    ? "Processing…"
                                    : "Upload PDFs and click “Interpret” to generate the doctor-grade output." })) : (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr", gap: 14 }, children: [counts.tests === 0 && (_jsx("div", { style: {
                                            background: "var(--surface)",
                                            border: "1px solid rgba(234,88,12,0.35)",
                                            borderRadius: 18,
                                            padding: 16,
                                            color: "#b45309",
                                            fontWeight: 800,
                                        }, children: "No lab values detected\u2014try another PDF or check if scanned image PDF requires OCR (not enabled)." })), errorMsg && (_jsx("div", { style: {
                                            background: "var(--surface)",
                                            border: "1px solid rgba(220,38,38,0.35)",
                                            borderRadius: 18,
                                            padding: 16,
                                            color: "#b91c1c",
                                            fontWeight: 800,
                                        }, children: errorMsg })), _jsxs("div", { style: {
                                            background: "var(--surface)",
                                            border: "1px solid var(--border)",
                                            borderRadius: 18,
                                            padding: 16,
                                            boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
                                        }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", fontSize: 16 }, children: "Executive summary" }), _jsxs("div", { style: { color: "var(--muted-2)", fontSize: 12 }, children: [counts.tests, " tests \u2022 ", counts.abnormalities, " abnormalities"] })] }), _jsxs("div", { style: { marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }, children: [_jsxs("div", { style: {
                                                            border: "1px solid var(--border)",
                                                            borderRadius: 14,
                                                            padding: 12,
                                                            background: "var(--surface-2)",
                                                        }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)" }, children: "Key abnormalities" }), _jsx("div", { style: { marginTop: 8, display: "grid", gap: 8 }, children: keyAbnorm.map((a, i) => (_jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: 10 }, children: [_jsxs("div", { style: { color: "var(--ink)", fontWeight: 800 }, children: [a.test, _jsxs("span", { style: { color: "var(--muted)", fontWeight: 700 }, children: [" \u2022 ", a.panel] })] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsxs("div", { style: { fontWeight: 900, color: "var(--ink)" }, children: [a.value, " ", a.unit ?? ""] }), _jsx("span", { style: badgeStyles(a.severity), children: a.severity.toUpperCase() })] })] }, i))) })] }), _jsxs("div", { style: {
                                                            border: "1px solid var(--border)",
                                                            borderRadius: 14,
                                                            padding: 12,
                                                            background: "var(--surface-2)",
                                                        }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)" }, children: "Likely patterns" }), _jsx("div", { style: { marginTop: 8, display: "grid", gap: 8 }, children: patterns.slice(0, 3).map((p, i) => (_jsxs("div", { style: { color: "var(--ink)", fontWeight: 800 }, children: ["\u2022 ", p.title] }, i))) })] })] })] }), _jsxs("div", { style: {
                                            background: "var(--surface)",
                                            border: "1px solid var(--border)",
                                            borderRadius: 18,
                                            padding: 16,
                                            boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
                                        }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", fontSize: 16 }, children: "Abnormalities" }), _jsxs("div", { style: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }, children: [_jsxs("label", { style: { display: "flex", alignItems: "center", gap: 8, color: "var(--ink)", fontWeight: 800 }, children: [_jsx("input", { type: "checkbox", checked: onlyCritical, onChange: (e) => setOnlyCritical(e.target.checked) }), "Critical only"] }), _jsx("select", { value: panelFilter, onChange: (e) => setPanelFilter(e.target.value), style: {
                                                                    padding: "8px 10px",
                                                                    borderRadius: 10,
                                                                    border: "1px solid var(--border)",
                                                                    background: "var(--surface)",
                                                                    fontWeight: 800,
                                                                    color: "var(--ink)",
                                                                }, children: panels.map((p) => (_jsx("option", { value: p, children: p }, p))) }), _jsx("input", { value: query, onChange: (e) => setQuery(e.target.value), placeholder: "Search tests/panels\u2026", style: {
                                                                    padding: "8px 10px",
                                                                    borderRadius: 10,
                                                                    border: "1px solid var(--border)",
                                                                    background: "var(--surface)",
                                                                    fontWeight: 800,
                                                                    color: "var(--ink)",
                                                                    minWidth: 220,
                                                                } })] })] }), _jsxs("div", { style: { marginTop: 12, overflowX: "auto" }, children: [_jsxs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 14 }, children: [_jsx("thead", { children: _jsxs("tr", { style: { textAlign: "left", color: "var(--ink)" }, children: [_jsx("th", { style: th, children: "Panel" }), _jsx("th", { style: th, children: "Test" }), _jsx("th", { style: th, children: "Result" }), _jsx("th", { style: th, children: "Range" }), _jsx("th", { style: th, children: "Flag" }), _jsx("th", { style: th, children: "Severity" }), _jsx("th", { style: th, children: "Notes" })] }) }), _jsx("tbody", { children: filteredAbnorm.map((a, idx) => (_jsxs("tr", { style: { borderTop: "1px solid var(--border)" }, children: [_jsx("td", { style: tdMuted, children: a.panel }), _jsx("td", { style: tdStrong, children: a.test }), _jsx("td", { style: td, children: _jsxs("span", { style: { fontWeight: 900, color: "var(--ink)" }, children: [a.result, " ", a.unit ?? ""] }) }), _jsx("td", { style: tdMuted, children: a.range ?? "—" }), _jsx("td", { style: tdMuted, children: a.flag ?? "—" }), _jsx("td", { style: td, children: _jsx("span", { style: badgeStyles(a.severity), children: a.severity.toUpperCase() }) }), _jsx("td", { style: tdMuted, children: a.notes ?? "" })] }, idx))) })] }), filteredAbnorm.length === 0 && (_jsx("div", { style: { color: "var(--muted)", marginTop: 10 }, children: "No abnormalities match the current filters." }))] })] }), _jsxs("div", { style: {
                                            background: "var(--surface)",
                                            border: "1px solid var(--border)",
                                            borderRadius: 18,
                                            padding: 16,
                                            boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
                                        }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", fontSize: 16 }, children: "Interpretation patterns" }), _jsx("div", { style: { color: "var(--muted-2)", marginTop: 4, fontSize: 12 }, children: "Generated from deterministic rules; RAG-ready for the next stage." }), _jsx("div", { style: { marginTop: 12, display: "grid", gap: 12 }, children: patterns.map((p, idx) => (_jsxs("details", { open: idx === 0, style: {
                                                        border: "1px solid var(--border)",
                                                        borderRadius: 14,
                                                        padding: 12,
                                                        background: "var(--surface-2)",
                                                    }, children: [_jsxs("summary", { style: { cursor: "pointer", listStyle: "none" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)" }, children: p.title }), _jsx("div", { style: { color: "var(--muted-2)", fontSize: 12 }, children: "Expand" })] }), _jsx("div", { style: { color: "var(--muted)", marginTop: 6 }, children: p.summary })] }), _jsxs("div", { style: { marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }, children: [_jsxs("div", { style: { border: "1px solid var(--border)", borderRadius: 12, padding: 10, background: "var(--surface)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)" }, children: "Likely conditions" }), _jsx("ul", { style: { margin: "8px 0 0 18px", color: "var(--ink)", fontWeight: 700 }, children: p.likely_conditions.map((x, i) => (_jsxs("li", { style: { marginBottom: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [_jsx("span", { children: x }), _jsx("button", { onClick: () => nav(`/ddx?condition=${encodeURIComponent(x)}&source=lab`), style: {
                                                                                            padding: "2px 8px",
                                                                                            borderRadius: 6,
                                                                                            border: "1px solid var(--accent)",
                                                                                            background: "var(--surface)",
                                                                                            cursor: "pointer",
                                                                                            fontWeight: 700,
                                                                                            color: "var(--accent)",
                                                                                            fontSize: 10,
                                                                                        }, title: `Investigate ${x} in DDx`, children: "\uD83D\uDD0D DDx" }), _jsx("button", { onClick: () => nav(`/treatment?topic=${encodeURIComponent(x)}&source=lab`), style: {
                                                                                            padding: "2px 8px",
                                                                                            borderRadius: 6,
                                                                                            border: "1px solid #059669",
                                                                                            background: "var(--surface)",
                                                                                            cursor: "pointer",
                                                                                            fontWeight: 700,
                                                                                            color: "#059669",
                                                                                            fontSize: 10,
                                                                                        }, title: `Get treatment for ${x}`, children: "Treat" })] }, i))) })] }), _jsxs("div", { style: { border: "1px solid var(--border)", borderRadius: 12, padding: 10, background: "var(--surface)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)" }, children: "Red flags" }), _jsx("ul", { style: { margin: "8px 0 0 18px", color: "var(--ink)", fontWeight: 700 }, children: p.red_flags.map((x, i) => (_jsx("li", { style: { marginBottom: 6 }, children: x }, i))) })] })] }), _jsxs("div", { style: { marginTop: 12, border: "1px solid var(--border)", borderRadius: 12, padding: 10, background: "var(--surface)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)" }, children: "Next investigations" }), _jsx("div", { style: { marginTop: 8, overflowX: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 14 }, children: [_jsx("thead", { children: _jsxs("tr", { style: { textAlign: "left", color: "var(--ink)" }, children: [_jsx("th", { style: th, children: "Test" }), _jsx("th", { style: th, children: "Why" }), _jsx("th", { style: th, children: "What it helps" })] }) }), _jsx("tbody", { children: p.next_investigations.map((n, i) => (_jsxs("tr", { style: { borderTop: "1px solid var(--border)" }, children: [_jsx("td", { style: tdStrong, children: n.test }), _jsx("td", { style: tdMuted, children: n.why }), _jsx("td", { style: tdMuted, children: n.whatItHelps })] }, i))) })] }) })] })] }, idx))) })] }), _jsxs("div", { style: {
                                            background: "var(--surface)",
                                            border: "1px solid var(--border)",
                                            borderRadius: 18,
                                            padding: 16,
                                        }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", fontSize: 16 }, children: "Coverage gate" }), _jsxs("div", { style: { color: "var(--muted)", marginTop: 6 }, children: ["In real mode, the system verifies that ", _jsx("b", { children: "every abnormality" }), " is covered by at least one interpretation pattern or note."] }), _jsxs("div", { style: { color: "var(--muted-2)", marginTop: 8, fontSize: 12 }, children: ["Status:", " ", _jsx("b", { children: coverage?.all_addressed ? "All abnormalities addressed" : "Missing coverage" })] }), coverage?.missing?.length ? (_jsxs("div", { style: { marginTop: 6, color: "#b45309", fontSize: 12 }, children: ["Missing: ", coverage.missing.join(", ")] })) : null] })] })) }), _jsx("div", { style: { marginTop: 12, color: "var(--muted-2)", fontSize: 12 }, children: "Note: If no lab values are detected, the PDF may be scanned and require OCR (not enabled)." })] })] }) }));
}
function Field({ label, value, onChange, placeholder, }) {
    return (_jsxs("label", { style: { display: "grid", gap: 6 }, children: [_jsx("div", { style: { fontSize: 12, fontWeight: 900, color: "var(--ink)" }, children: label }), _jsx("input", { value: value, onChange: (e) => onChange(e.target.value), placeholder: placeholder, style: {
                    padding: "10px 10px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--ink)",
                    fontWeight: 800,
                    outline: "none",
                } })] }));
}
function SelectField({ label, value, onChange, options, }) {
    return (_jsxs("label", { style: { display: "grid", gap: 6 }, children: [_jsx("div", { style: { fontSize: 12, fontWeight: 900, color: "var(--ink)" }, children: label }), _jsx("select", { value: value, onChange: (e) => onChange(e.target.value), style: {
                    padding: "10px 10px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--ink)",
                    fontWeight: 800,
                    outline: "none",
                }, children: options.map((o) => (_jsx("option", { value: o.value, children: o.label }, o.value))) })] }));
}
const th = {
    padding: "10px 8px",
    fontSize: 12,
    letterSpacing: 0.2,
    textTransform: "uppercase",
    color: "var(--muted)",
};
const td = {
    padding: "10px 8px",
    color: "var(--ink)",
    verticalAlign: "top",
};
const tdMuted = {
    padding: "10px 8px",
    color: "var(--muted)",
    verticalAlign: "top",
    fontWeight: 700,
};
const tdStrong = {
    padding: "10px 8px",
    color: "var(--ink)",
    verticalAlign: "top",
    fontWeight: 900,
};
