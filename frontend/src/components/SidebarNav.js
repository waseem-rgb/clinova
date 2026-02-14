import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate, useLocation } from "react-router-dom";
export default function SidebarNav() {
    const navigate = useNavigate();
    const location = useLocation();
    const items = [
        { label: "Home", path: "/" },
        { label: "Lab Interpretation", path: "/lab" },
        { label: "Differential Diagnosis", path: "/ddx" },
        { label: "Treatment Advisor", path: "/treatment" },
        { label: "Drug Details", path: "/drug" },
        { label: "Drug Interactions", path: "/interactions" },
        { label: "Prescription Studio", path: "/prescription" },
        { label: "Image Interpretation", path: "/image" },
    ];
    const isActive = (path) => {
        if (path === "/")
            return location.pathname === "/";
        return location.pathname.startsWith(path);
    };
    return (_jsxs("aside", { style: {
            width: 240,
            padding: "22px 18px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "0 18px 18px 0",
            boxShadow: "0 18px 45px rgba(44,62,80,0.12)",
            height: "fit-content",
            position: "sticky",
            top: 22,
            marginLeft: 0,
        }, children: [_jsx("div", { style: { fontWeight: 800, color: "var(--ink)", letterSpacing: 0.2, fontSize: 15 }, children: "MedCompanion" }), _jsx("div", { style: { marginTop: 4, color: "var(--muted-2)", fontSize: 11 }, children: "Clinical Decision Support" }), _jsx("div", { style: { marginTop: 14, display: "grid", gap: 6 }, children: items.map((item) => {
                    const active = isActive(item.path);
                    return (_jsx("button", { onClick: () => navigate(item.path), style: {
                            textAlign: "left",
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: active ? "1px solid var(--accent)" : "1px solid transparent",
                            background: active ? "linear-gradient(135deg, rgba(14,165,164,0.1), rgba(14,165,164,0.05))" : "transparent",
                            color: active ? "var(--accent)" : "var(--ink)",
                            cursor: "pointer",
                            fontWeight: active ? 800 : 600,
                            fontSize: 13,
                            transition: "all 0.15s ease",
                        }, onMouseEnter: (e) => {
                            if (!active) {
                                e.currentTarget.style.background = "var(--surface-2)";
                            }
                        }, onMouseLeave: (e) => {
                            if (!active) {
                                e.currentTarget.style.background = "transparent";
                            }
                        }, children: item.label }, item.path));
                }) }), _jsxs("div", { style: { marginTop: 20, padding: "12px", background: "var(--surface-2)", borderRadius: 10, fontSize: 11, color: "var(--muted)" }, children: [_jsx("strong", { style: { color: "var(--ink)" }, children: "Pro Tip:" }), " Use the home search to explore medical topics with evidence-based information."] })] }));
}
