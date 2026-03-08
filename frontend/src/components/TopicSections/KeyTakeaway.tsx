// frontend/src/components/TopicSections/KeyTakeaway.tsx
import React from "react";

interface Props {
  points: string[];
}

export default function KeyTakeaway({ points }: Props) {
  return (
    <div style={{
      background: "rgba(10,110,94,0.04)",
      border: "1px solid rgba(10,110,94,0.15)",
      borderLeft: "3px solid var(--brand)",
      borderRadius: "0 6px 6px 0",
      padding: "16px 20px",
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--brand)",
        marginBottom: 12,
      }}>
        Key Takeaway
      </div>
      <ol style={{
        margin: 0,
        padding: "0 0 0 18px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}>
        {points.map((point, i) => (
          <li key={i} style={{
            fontSize: 14,
            lineHeight: 1.65,
            color: "#1A2B3C",
          }}>
            {point}
          </li>
        ))}
      </ol>
    </div>
  );
}
