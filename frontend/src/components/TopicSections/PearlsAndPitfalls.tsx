// frontend/src/components/TopicSections/PearlsAndPitfalls.tsx
import React from "react";
import type { TopicContent } from "../../types/topic";

interface Props {
  data: TopicContent["clinicalPearlsAndPitfalls"];
}

function CardList({ items, type }: { items: string[]; type: "pearl" | "pitfall" }) {
  const isPearl = type === "pearl";
  const borderColor = isPearl ? "#116329" : "#CF222E";
  const bg = isPearl ? "rgba(17,99,41,0.03)" : "rgba(207,34,46,0.03)";
  const borderFull = isPearl ? "1px solid rgba(17,99,41,0.15)" : "1px solid rgba(207,34,46,0.15)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item, i) => (
        <div key={i} style={{
          padding: "11px 13px",
          borderLeft: `3px solid ${borderColor}`,
          background: bg,
          border: borderFull,
          borderRadius: "0 6px 6px 0",
          fontSize: 13,
          color: "#1A2B3C",
          lineHeight: 1.6,
        }}>
          {item}
        </div>
      ))}
    </div>
  );
}

export default function PearlsAndPitfalls({ data }: Props) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      <div>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
          textTransform: "uppercase", color: "var(--brand)", marginBottom: 12,
        }}>
          Clinical Pearls
        </div>
        <CardList items={data.pearls} type="pearl" />
      </div>
      <div>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
          textTransform: "uppercase", color: "#CF222E", marginBottom: 12,
        }}>
          Pitfalls to Avoid
        </div>
        <CardList items={data.pitfalls} type="pitfall" />
      </div>
    </div>
  );
}
