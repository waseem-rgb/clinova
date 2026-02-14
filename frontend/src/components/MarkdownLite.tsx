// frontend/src/components/MarkdownLite.tsx
import React from "react";

type Props = {
  markdown: string;
};

function escapeHtml(s: string) {
  return s
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;");
}

function inlineFormat(s: string) {
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

function parseTable(lines: string[], start: number) {
  // markdown table:
  // | a | b |
  // |---|---|
  // | 1 | 2 |
  const header = lines[start];
  const sep = lines[start + 1];
  if (!header || !sep) return null;

  const isSep = /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(sep);
  if (!isSep) return null;

  const rows: string[] = [];
  let i = start;
  while (i < lines.length && lines[i].includes("|")) {
    rows.push(lines[i]);
    i++;
  }

  const splitRow = (row: string) =>
    row
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

  const headerCells = splitRow(rows[0]);
  const bodyRows = rows.slice(2).map(splitRow);

  return { end: i, headerCells, bodyRows };
}

export default function MarkdownLite({ markdown }: Props) {
  const lines = (markdown ?? "").split("\r\n").join("\n").split("\n");

  const blocks: React.ReactNode[] = [];
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
      blocks.push(
        <div key={`tbl-${i}`} style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              background: "#fff",
            }}
          >
            <thead>
              <tr>
                {table.headerCells.map((c, idx) => (
                  <th
                    key={idx}
                    style={{
                      textAlign: "left",
                      border: "1px solid #d0d7de",
                      padding: "10px 12px",
                      background: "#f6f8fa",
                      fontWeight: 700,
                      color: "#111827",
                      whiteSpace: "nowrap",
                    }}
                    dangerouslySetInnerHTML={{ __html: inlineFormat(c) }}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {table.bodyRows.map((r, rIdx) => (
                <tr key={rIdx}>
                  {r.map((c, cIdx) => (
                    <td
                      key={cIdx}
                      style={{
                        border: "1px solid #d0d7de",
                        padding: "10px 12px",
                        color: "#111827",
                        verticalAlign: "top",
                      }}
                      dangerouslySetInnerHTML={{ __html: inlineFormat(c) }}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      i = table.end;
      continue;
    }

    // headings (#, ##, ###)
    const m = /^(#{1,6})\s+(.*)$/.exec(line.trim());
    if (m) {
      const level = m[1].length;
      const text = m[2] ?? "";
      const Tag = (`h${Math.min(level + 1, 6)}` as any) as import("react").ElementType; // slightly larger visual
      blocks.push(
        <Tag
          key={`h-${i}`}
          style={{
            margin: "18px 0 10px",
            color: "#111827",
            fontWeight: 800,
            lineHeight: 1.25,
          }}
          dangerouslySetInnerHTML={{ __html: inlineFormat(text) }}
        />
      );
      i++;
      continue;
    }

    // bullet list
    if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={`ul-${i}`} style={{ margin: "8px 0 14px 18px", color: "#111827" }}>
          {items.map((it, idx) => (
            <li
              key={idx}
              style={{ margin: "6px 0", lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{ __html: inlineFormat(it) }}
            />
          ))}
        </ul>
      );
      continue;
    }

    // code block ``` ```
    if (line.trim().startsWith("```")) {
      let j = i + 1;
      const codeLines: string[] = [];
      while (j < lines.length && !lines[j].trim().startsWith("```")) {
        codeLines.push(lines[j]);
        j++;
      }
      blocks.push(
        <pre
          key={`pre-${i}`}
          style={{
            background: "#0b1220",
            color: "#e5e7eb",
            padding: "14px 14px",
            borderRadius: 12,
            overflowX: "auto",
            border: "1px solid rgba(17,24,39,0.12)",
          }}
        >
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      i = Math.min(j + 1, lines.length);
      continue;
    }

    // paragraph (consume until blank line)
    const para: string[] = [];
    while (i < lines.length && lines[i].trim()) {
      // stop paragraph if next is table or heading
      if (/^(#{1,6})\s+/.test(lines[i].trim())) break;
      if (parseTable(lines, i)) break;
      if (lines[i].trim().startsWith("```")) break;
      para.push(lines[i]);
      i++;
    }

    blocks.push(
      <p
        key={`p-${i}`}
        style={{ margin: "10px 0", color: "#111827", lineHeight: 1.75, fontSize: 15 }}
        dangerouslySetInnerHTML={{ __html: inlineFormat(para.join(" ").trim()) }}
      />
    );
  }

  return <div>{blocks}</div>;
}
