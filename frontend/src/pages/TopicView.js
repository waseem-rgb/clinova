import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// frontend/src/pages/TopicView.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import SidebarNav from "../components/SidebarNav";
import { COLLECTIONS, cleanTopicTitle, getTopicByCollection } from "../api/topic";
function isCollectionKey(x) {
    return x === "medicine" || x === "obgyn" || x === "pediatrics" || x === "surgery";
}
const DEFAULT_OPEN = new Set([
    "diagnostic_approach",
    "treatment_strategy",
    "clinical_pearls",
    "clinical_features",
]);
const KEY_SECTIONS = new Set(["diagnostic_approach", "treatment_strategy", "clinical_pearls", "clinical_features"]);
function hasSectionContent(section) {
    const content = (section.content || []).filter((c) => c && c.trim().length > 0);
    if (content.length > 0)
        return true;
    if (section.subsections?.some((s) => (s.content || []).some((c) => c && c.trim().length > 0)))
        return true;
    if (section.tables?.some((t) => (t.rows || []).length > 0))
        return true;
    return false;
}
function SectionAccordion({ section }) {
    const openByDefault = DEFAULT_OPEN.has(section.id);
    return (_jsxs("details", { open: openByDefault, style: { borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 14 }, children: [_jsx("summary", { style: { cursor: "pointer", fontWeight: 800, color: "var(--ink)" }, children: section.title }), _jsxs("div", { style: { marginTop: 10, color: "var(--ink)" }, children: [section.content?.map((p, idx) => (_jsx("p", { style: { margin: "8px 0", lineHeight: 1.6 }, children: p }, idx))), section.subsections?.map((sub, idx) => (_jsxs("div", { style: { marginTop: 12 }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 6 }, children: sub.title }), sub.content?.map((p, i) => (_jsx("p", { style: { margin: "6px 0", lineHeight: 1.6 }, children: p }, i)))] }, idx))), section.tables?.map((tbl, idx) => (_jsxs("div", { style: { marginTop: 12 }, children: [tbl.title && _jsx("div", { style: { fontWeight: 700, marginBottom: 6 }, children: tbl.title }), _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsx("tr", { children: tbl.columns.map((c, i) => (_jsx("th", { style: { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)" }, children: c }, i))) }) }), _jsx("tbody", { children: tbl.rows.map((row, i) => (_jsx("tr", { children: row.map((cell, j) => (_jsx("td", { style: { padding: "8px 10px", borderBottom: "1px solid var(--border)" }, children: cell }, j))) }, i))) })] })] }, idx)))] })] }));
}
function QuickViewCard({ quickView }) {
    return (_jsxs("div", { style: {
            background: "var(--surface)",
            borderRadius: 16,
            border: "1px solid var(--border)",
            padding: 16,
            boxShadow: "var(--shadow)",
        }, children: [_jsx("div", { style: { fontWeight: 800, marginBottom: 10, color: "var(--ink)" }, children: "Clinical Quick View" }), _jsx("ul", { style: { margin: 0, paddingLeft: 18, color: "var(--ink)" }, children: quickView.bullets?.slice(0, 8).map((b, i) => (_jsx("li", { style: { marginBottom: 6, lineHeight: 1.5 }, children: b }, i))) }), quickView.table && quickView.table.length > 0 && (_jsx("div", { style: { marginTop: 12 }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)" }, children: "Clinical Question" }), _jsx("th", { style: { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)" }, children: "Practical Answer" })] }) }), _jsx("tbody", { children: quickView.table.map((row, idx) => (_jsxs("tr", { children: [_jsx("td", { style: { padding: "8px 10px", borderBottom: "1px solid var(--border)" }, children: row.q }), _jsx("td", { style: { padding: "8px 10px", borderBottom: "1px solid var(--border)" }, children: row.a })] }, idx))) })] }) }))] }));
}
function ThresholdsTable({ rows }) {
    if (!rows || rows.length === 0)
        return null;
    return (_jsxs("div", { style: {
            background: "var(--surface)",
            borderRadius: 16,
            border: "1px solid var(--border)",
            padding: 16,
            boxShadow: "var(--shadow)",
            marginTop: 16,
        }, children: [_jsx("div", { style: { fontWeight: 800, marginBottom: 10, color: "var(--ink)" }, children: "Interpretation / Key thresholds" }), _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)" }, children: "Finding / Threshold" }), _jsx("th", { style: { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)" }, children: "Clinical meaning" }), _jsx("th", { style: { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)" }, children: "Next step" })] }) }), _jsx("tbody", { children: rows.map((r, idx) => (_jsxs("tr", { children: [_jsx("td", { style: { padding: "8px 10px", borderBottom: "1px solid var(--border)" }, children: r.finding }), _jsx("td", { style: { padding: "8px 10px", borderBottom: "1px solid var(--border)" }, children: r.meaning }), _jsx("td", { style: { padding: "8px 10px", borderBottom: "1px solid var(--border)" }, children: r.next_step })] }, idx))) })] })] }));
}
function EvidenceDrawer({ items }) {
    if (!items || items.length === 0)
        return null;
    return (_jsxs("details", { style: { marginTop: 18 }, children: [_jsx("summary", { style: { cursor: "pointer", fontWeight: 800, color: "var(--ink)" }, children: "Show evidence" }), _jsx("div", { style: { marginTop: 10 }, children: items.map((it) => (_jsxs("div", { style: {
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 10,
                    }, children: [_jsxs("div", { style: { fontSize: 12, color: "var(--muted)", marginBottom: 6 }, children: [it.meta?.source, it.meta?.chapter ? ` • ${it.meta.chapter}` : "", it.meta?.page_start ? ` • p.${it.meta.page_start}` : ""] }), _jsx("div", { style: { whiteSpace: "pre-wrap", lineHeight: 1.5 }, children: it.text })] }, it.id))) })] }));
}
export default function TopicView() {
    const navigate = useNavigate();
    const params = useParams();
    const [sp] = useSearchParams();
    const collection = useMemo(() => {
        const raw = params.collection;
        return isCollectionKey(raw) ? raw : "medicine";
    }, [params.collection]);
    const qRaw = sp.get("q") ?? "";
    const q = useMemo(() => cleanTopicTitle(qRaw), [qRaw]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);
    const [data, setData] = useState(null);
    const abortRef = useRef(null);
    useEffect(() => {
        if (!q.trim()) {
            setErr("Missing topic query");
            setData(null);
            return;
        }
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;
        (async () => {
            try {
                setErr(null);
                setLoading(true);
                const resp = await getTopicByCollection(collection, q, ac.signal);
                setData(resp);
            }
            catch (e) {
                if (e?.name !== "AbortError")
                    setErr(e?.message ?? "Failed to fetch topic");
            }
            finally {
                setLoading(false);
            }
        })();
        return () => ac.abort();
    }, [collection, q]);
    const collectionLabel = COLLECTIONS.find((c) => c.key === collection)?.label ?? "Medicine";
    const doctorView = data?.doctor_view;
    const sections = useMemo(() => doctorView?.sections ?? [], [doctorView]);
    const filteredSections = useMemo(() => sections.filter(hasSectionContent), [sections]);
    const thresholds = useMemo(() => doctorView?.thresholds ?? [], [doctorView]);
    const hasKeySections = useMemo(() => filteredSections.some((section) => section.id && KEY_SECTIONS.has(section.id)), [filteredSections]);
    const hasPearlSection = useMemo(() => filteredSections.some((section) => section.id === "clinical_pearls"), [filteredSections]);
    return (_jsx("div", { style: { minHeight: "100vh", background: "var(--page-bg)", padding: "24px 24px 24px 0" }, children: _jsxs("div", { style: { maxWidth: "100%", minWidth: 1200, margin: 0, display: "grid", gridTemplateColumns: "260px 1fr", gap: 24 }, children: [_jsx(SidebarNav, {}), _jsxs("div", { children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }, children: [_jsx("button", { onClick: () => navigate("/"), style: {
                                        border: "1px solid var(--border)",
                                        background: "var(--surface)",
                                        padding: "8px 12px",
                                        borderRadius: 12,
                                        cursor: "pointer",
                                        fontWeight: 800,
                                        color: "var(--ink)",
                                        boxShadow: "0 8px 18px rgba(15,23,42,0.08)",
                                    }, children: "\u2190 Back" }), _jsx("div", { style: { fontWeight: 800, color: "var(--muted)" }, children: collectionLabel })] }), _jsxs("div", { style: {
                                background: "var(--surface)",
                                borderRadius: 18,
                                border: "1px solid var(--border)",
                                boxShadow: "var(--shadow)",
                                padding: 22,
                            }, children: [_jsx("div", { style: {
                                        fontSize: 40,
                                        fontWeight: 700,
                                        letterSpacing: -0.8,
                                        marginBottom: 6,
                                        color: "var(--ink)",
                                        fontFamily: "var(--font-display)",
                                    }, children: q || "Topic" }), _jsx("div", { style: { color: "var(--muted)", marginBottom: 16 }, children: "Doctor-friendly structured topic view" }), (loading || (!err && !doctorView)) && (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontWeight: 700 }, children: [_jsx("span", { className: "hourglass", "aria-hidden": true, style: { fontSize: 24, lineHeight: 1, display: "inline-block" }, children: "\u23F3" }), "Loading topic\u2026"] })), err && _jsx("div", { style: { color: "#b91c1c", fontWeight: 700 }, children: err }), !loading && !err && doctorView && (_jsxs("div", { style: { marginTop: 10 }, children: [_jsx(QuickViewCard, { quickView: doctorView.quick_view }), _jsx(ThresholdsTable, { rows: thresholds }), !hasKeySections && (_jsx("div", { style: {
                                                marginTop: 16,
                                                padding: 12,
                                                borderRadius: 12,
                                                border: "1px solid var(--border)",
                                                background: "var(--surface-2)",
                                                fontWeight: 700,
                                                color: "var(--muted)",
                                            }, children: "No structured evidence found for this topic. Try expanding evidence." })), filteredSections.length > 0 && (_jsx("div", { style: { marginTop: 18 }, children: filteredSections.map((section) => (_jsx(SectionAccordion, { section: section }, section.id))) })), !hasPearlSection && doctorView.pearls && doctorView.pearls.length > 0 && (_jsxs("div", { style: { marginTop: 18 }, children: [_jsx("div", { style: { fontWeight: 800, marginBottom: 8 }, children: "Clinical pearls & pitfalls" }), _jsx("ul", { style: { margin: 0, paddingLeft: 18 }, children: doctorView.pearls.map((p, i) => (_jsx("li", { style: { marginBottom: 6 }, children: p }, i))) })] })), doctorView.takeaway && doctorView.takeaway.length > 0 && (_jsxs("div", { style: { marginTop: 18 }, children: [_jsx("div", { style: { fontWeight: 800, marginBottom: 8 }, children: "Key takeaway" }), doctorView.takeaway.map((t, i) => (_jsx("p", { style: { margin: "6px 0" }, children: t }, i)))] })), _jsx(EvidenceDrawer, { items: data?.evidence?.items ?? [] })] }))] })] })] }) }));
}
