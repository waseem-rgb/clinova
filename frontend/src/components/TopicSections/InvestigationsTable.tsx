// frontend/src/components/TopicSections/InvestigationsTable.tsx
import React from "react";
import type { Investigation } from "../../types/topic";

interface Props {
  investigations: Investigation[];
}

const TIER_COLORS: Record<string, { bg: string; color: string }> = {
  PHC:      { bg: "rgba(45,164,78,0.08)",   color: "#2DA44E" },
  CHC:      { bg: "rgba(10,110,94,0.08)",   color: "var(--brand)" },
  District: { bg: "rgba(30,100,200,0.07)",  color: "#4493F8" },
  Referral: { bg: "rgba(207,34,46,0.07)",   color: "#CF222E" },
};

const COST_LABELS: Record<string, string> = {
  free:     "Free",
  low:      "Low",
  moderate: "Moderate",
  high:     "High",
};

export default function InvestigationsTable({ investigations }: Props) {
  return (
    <div style={{ border: "1px solid #D0D7DE", borderRadius: 8, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#F6F8FA" }}>
            {["Investigation", "Purpose", "Interpretation", "Tier", "Cost"].map((h) => (
              <th key={h} style={{
                padding: "9px 12px",
                textAlign: "left",
                fontSize: 10, fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#8B949E",
                borderBottom: "1px solid #D0D7DE",
                whiteSpace: "nowrap",
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {investigations.map((inv, i) => {
            const tier = TIER_COLORS[inv.tier] ?? TIER_COLORS.CHC;
            return (
              <tr
                key={i}
                style={{ borderBottom: i < investigations.length - 1 ? "1px solid #F0F1F2" : "none" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#F9FAFB"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <td style={{ padding: "10px 12px", verticalAlign: "top", fontWeight: 600, color: "#1A2B3C" }}>
                  {inv.name}
                </td>
                <td style={{ padding: "10px 12px", verticalAlign: "top", color: "#57606A", lineHeight: 1.5 }}>
                  {inv.purpose}
                </td>
                <td style={{ padding: "10px 12px", verticalAlign: "top", color: "#57606A", lineHeight: 1.5, fontSize: 12.5 }}>
                  {inv.interpretation}
                </td>
                <td style={{ padding: "10px 12px", verticalAlign: "top" }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    padding: "2px 7px", borderRadius: 3,
                    background: tier.bg, color: tier.color,
                    letterSpacing: 0.4,
                    whiteSpace: "nowrap",
                  }}>
                    {inv.tier}
                  </span>
                </td>
                <td style={{ padding: "10px 12px", verticalAlign: "top", fontSize: 12, color: "#8B949E" }}>
                  {inv.cost ? COST_LABELS[inv.cost] : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
