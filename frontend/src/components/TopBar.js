import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
export default function TopBar() {
    return (_jsx("div", { style: styles.wrap, children: _jsx("div", { style: styles.inner, children: _jsx("div", { style: styles.brand, children: _jsxs(Link, { to: "/", style: styles.brandLink, children: [_jsx("div", { style: styles.logoDot }), _jsxs("div", { children: [_jsx("div", { style: styles.title, children: "MedCompanion" }), _jsx("div", { style: styles.sub, children: "Doctor-grade textbook search \u00B7 RAG-only" })] })] }) }) }) }));
}
const styles = {
    wrap: {
        position: "sticky",
        top: 0,
        zIndex: 50,
        backdropFilter: "blur(10px)",
        background: "rgba(10, 18, 40, 0.65)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
    },
    inner: {
        maxWidth: 1100,
        margin: "0 auto",
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
    },
    brand: { display: "flex", alignItems: "center", gap: 12 },
    brandLink: { display: "flex", alignItems: "center", gap: 12, textDecoration: "none" },
    logoDot: {
        width: 14,
        height: 14,
        borderRadius: 999,
        background: "linear-gradient(135deg, #6aa9ff, #7c3aed)",
        boxShadow: "0 0 18px rgba(106,169,255,0.45)",
    },
    title: { fontSize: 18, fontWeight: 800, color: "rgba(255,255,255,0.92)", letterSpacing: 0.2 },
    sub: { fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 },
};
