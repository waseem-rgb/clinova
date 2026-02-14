import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function escapeHtml(s) {
    return s
        .split("&").join("&amp;")
        .split("<").join("&lt;")
        .split(">").join("&gt;");
}
function inlineFormat(s) {
    // very small inline formatting: **bold**, *italic*, `code`
    let out = escapeHtml(s);
    // code first
    out = out.replace(/`([^`]+)`/g, (_m, g1) => `<code>${escapeHtml(g1)}</code>`);
    // bold
    out = out.replace(/\*\*([^*]+)\*\*/g, (_m, g1) => `<strong>${g1}</strong>`);
    // italic (simple)
    out = out.replace(/\*([^*]+)\*/g, (_m, g1) => `<em>${g1}</em>`);
    return out;
}
function parseTable(lines, start) {
    // markdown table:
    // | a | b |
    // |---|---|
    // | 1 | 2 |
    const header = lines[start];
    const sep = lines[start + 1];
    if (!header || !sep)
        return null;
    const isSep = /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(sep);
    if (!isSep)
        return null;
    const rows = [];
    let i = start;
    while (i < lines.length && lines[i].includes("|")) {
        rows.push(lines[i]);
        i++;
    }
    const splitRow = (row) => row
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());
    const headerCells = splitRow(rows[0]);
    const bodyRows = rows.slice(2).map(splitRow);
    return { end: i, headerCells, bodyRows };
}
export default function MarkdownLite({ markdown }) {
    const lines = (markdown ?? "").split("\r\n").join("\n").split("\n");
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        // skip blank lines
        if (!line.trim()) {
            i++;
            continue;
        }
        // table
        const table = parseTable(lines, i);
        if (table) {
            blocks.push(_jsx("div", { style: { overflowX: "auto" }, children: _jsxs("table", { style: {
                        width: "100%",
                        borderCollapse: "collapse",
                        background: "#fff",
                    }, children: [_jsx("thead", { children: _jsx("tr", { children: table.headerCells.map((c, idx) => (_jsx("th", { style: {
                                        textAlign: "left",
                                        border: "1px solid #d0d7de",
                                        padding: "10px 12px",
                                        background: "#f6f8fa",
                                        fontWeight: 700,
                                        color: "#111827",
                                        whiteSpace: "nowrap",
                                    }, dangerouslySetInnerHTML: { __html: inlineFormat(c) } }, idx))) }) }), _jsx("tbody", { children: table.bodyRows.map((r, rIdx) => (_jsx("tr", { children: r.map((c, cIdx) => (_jsx("td", { style: {
                                        border: "1px solid #d0d7de",
                                        padding: "10px 12px",
                                        color: "#111827",
                                        verticalAlign: "top",
                                    }, dangerouslySetInnerHTML: { __html: inlineFormat(c) } }, cIdx))) }, rIdx))) })] }) }, `tbl-${i}`));
            i = table.end;
            continue;
        }
        // headings (#, ##, ###)
        const m = /^(#{1,6})\s+(.*)$/.exec(line.trim());
        if (m) {
            const level = m[1].length;
            const text = m[2] ?? "";
            const Tag = `h${Math.min(level + 1, 6)}`; // slightly larger visual
            blocks.push(_jsx(Tag, { style: {
                    margin: "18px 0 10px",
                    color: "#111827",
                    fontWeight: 800,
                    lineHeight: 1.25,
                }, dangerouslySetInnerHTML: { __html: inlineFormat(text) } }, `h-${i}`));
            i++;
            continue;
        }
        // bullet list
        if (/^\s*-\s+/.test(line)) {
            const items = [];
            while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^\s*-\s+/, ""));
                i++;
            }
            blocks.push(_jsx("ul", { style: { margin: "8px 0 14px 18px", color: "#111827" }, children: items.map((it, idx) => (_jsx("li", { style: { margin: "6px 0", lineHeight: 1.6 }, dangerouslySetInnerHTML: { __html: inlineFormat(it) } }, idx))) }, `ul-${i}`));
            continue;
        }
        // code block ``` ```
        if (line.trim().startsWith("```")) {
            let j = i + 1;
            const codeLines = [];
            while (j < lines.length && !lines[j].trim().startsWith("```")) {
                codeLines.push(lines[j]);
                j++;
            }
            blocks.push(_jsx("pre", { style: {
                    background: "#0b1220",
                    color: "#e5e7eb",
                    padding: "14px 14px",
                    borderRadius: 12,
                    overflowX: "auto",
                    border: "1px solid rgba(17,24,39,0.12)",
                }, children: _jsx("code", { children: codeLines.join("\n") }) }, `pre-${i}`));
            i = Math.min(j + 1, lines.length);
            continue;
        }
        // paragraph (consume until blank line)
        const para = [];
        while (i < lines.length && lines[i].trim()) {
            // stop paragraph if next is table or heading
            if (/^(#{1,6})\s+/.test(lines[i].trim()))
                break;
            if (parseTable(lines, i))
                break;
            if (lines[i].trim().startsWith("```"))
                break;
            para.push(lines[i]);
            i++;
        }
        blocks.push(_jsx("p", { style: { margin: "10px 0", color: "#111827", lineHeight: 1.75, fontSize: 15 }, dangerouslySetInnerHTML: { __html: inlineFormat(para.join(" ").trim()) } }, `p-${i}`));
    }
    return _jsx("div", { children: blocks });
}
