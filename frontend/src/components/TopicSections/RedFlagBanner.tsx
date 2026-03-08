// frontend/src/components/TopicSections/RedFlagBanner.tsx
import React from "react";

interface Props {
  flags: string[];
}

export default function RedFlagBanner({ flags }: Props) {
  if (!flags.length) return null;
  return (
    <div style={{
      border: "1px solid rgba(207,34,46,0.2)",
      borderLeft: "3px solid #CF222E",
      borderRadius: 6,
      background: "rgba(207,34,46,0.03)",
      padding: "14px 16px",
      marginBottom: 20,
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "#CF222E",
        marginBottom: 10,
      }}>
        Red Flags — Act Immediately
      </div>
      <ul style={{ margin: 0, padding: "0 0 0 14px", display: "flex", flexDirection: "column", gap: 0 }}>
        {flags.map((flag, i) => (
          <li key={i} style={{
            fontSize: 13,
            color: "#1A2B3C",
            padding: "5px 0",
            borderBottom: i < flags.length - 1 ? "1px solid rgba(207,34,46,0.08)" : "none",
            lineHeight: 1.5,
          }}>
            {flag}
          </li>
        ))}
      </ul>
    </div>
  );
}
