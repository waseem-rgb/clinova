import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function SectionNav({ titles, active, onSelect }) {
    return (_jsxs("div", { className: "sectionNav", children: [_jsx("div", { className: "sectionNavHeader", children: "SECTIONS" }), _jsx("div", { className: "sectionNavList", children: titles.map((t) => (_jsx("button", { className: `sectionNavItem ${active === t ? "active" : ""}`, onClick: () => onSelect(t), children: t }, t))) })] }));
}
