// frontend/src/components/TopicSections/DDxTable.tsx
import React from "react";
import type { DDxItem } from "../../types/topic";

interface Props {
  items: DDxItem[];
  algorithm?: string;
}

export default function DDxTable({ items, algorithm }: Props) {
  return (
    <div>
      {/* Diagnostic algorithm */}
      {algorithm && (
        <div style={{
          background: "#F6F8FA",
          border: "1px solid #D0D7DE",
          borderLeft: "3px solid var(--brand)",
          borderRadius: "0 6px 6px 0",
          padding: "12px 14px",
          marginBottom: 16,
          fontSize: 13,
          color: "#57606A",
          lineHeight: 1.7,
          fontFamily: "var(--font-sans)",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
            textTransform: "uppercase", color: "var(--brand)", marginBottom: 6,
          }}>
            Diagnostic Algorithm
          </div>
          {algorithm}
        </div>
      )}

      {/* DDx table */}
      <div style={{ border: "1px solid #D0D7DE", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F6F8FA" }}>
              <th style={{
                padding: "9px 14px",
                textAlign: "left", fontSize: 10, fontWeight: 600,
                letterSpacing: "0.06em", textTransform: "uppercase",
                color: "#8B949E", borderBottom: "1px solid #D0D7DE",
                width: "38%",
              }}>
                Diagnosis
              </th>
              <th style={{
                padding: "9px 14px",
                textAlign: "left", fontSize: 10, fontWeight: 600,
                letterSpacing: "0.06em", textTransform: "uppercase",
                color: "#8B949E", borderBottom: "1px solid #D0D7DE",
              }}>
                Distinguishing Feature
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr
                key={i}
                style={{ borderBottom: i < items.length - 1 ? "1px solid #F0F1F2" : "none" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#F9FAFB"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <td style={{ padding: "9px 14px", verticalAlign: "top", fontWeight: 600, color: "#1A2B3C" }}>
                  {item.diagnosis}
                </td>
                <td style={{ padding: "9px 14px", verticalAlign: "top", color: "#57606A", lineHeight: 1.5 }}>
                  {item.distinguishingFeature}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
