import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// frontend/src/components/SearchBox.tsx
import { useEffect, useMemo, useState } from "react";
export default function SearchBox({ value, onChange, onSearch, placeholder }) {
    const [local, setLocal] = useState(value);
    useEffect(() => setLocal(value), [value]);
    const canSearch = useMemo(() => local.trim().length >= 2, [local]);
    return (_jsxs("div", { className: "flex gap-3 items-center", children: [_jsx("input", { className: "w-full rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-lg text-white outline-none focus:ring-2 focus:ring-white/20", value: local, onChange: (e) => {
                    setLocal(e.target.value);
                    onChange(e.target.value);
                }, onKeyDown: (e) => {
                    if (e.key === "Enter" && canSearch)
                        onSearch();
                }, placeholder: placeholder ?? "Search a topic (e.g., Epilepsy, Asthma, Stroke)" }), _jsx("button", { className: "rounded-2xl px-6 py-4 bg-white/15 text-white hover:bg-white/20 disabled:opacity-40", onClick: () => canSearch && onSearch(), disabled: !canSearch, children: "Search" })] }));
}
