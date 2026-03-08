// frontend/src/components/TopicSections/TreatmentByFacility.tsx
import React, { useState } from "react";
import type { TopicContent, TreatmentContext } from "../../types/topic";

interface Props {
  byContext: TreatmentContext[];
  firstLine: TopicContent["treatment"]["firstLine"];
  secondLine: TopicContent["treatment"]["secondLine"];
  principles: string[];
  specialPopulations: TopicContent["treatment"]["specialPopulations"];
  monitoring: TopicContent["treatment"]["monitoring"];
  whenToRefer: string[];
  pitfalls: string[];
}

const FACILITY_ORDER = ["PHC", "CHC", "District"] as const;
const EVIDENCE_COLORS: Record<string, string> = {
  A: "var(--brand)",
  B: "#8B949E",
  C: "#6E7681",
  Expert: "#D97706",
};

export default function TreatmentByFacility({
  byContext, firstLine, secondLine, principles,
  specialPopulations, monitoring, whenToRefer, pitfalls,
}: Props) {
  const ordered = FACILITY_ORDER.map(f => byContext.find(c => c.facility === f)).filter(Boolean) as TreatmentContext[];
  const [activeTab, setActiveTab] = useState<string>(ordered[0]?.facility ?? "PHC");
  const activeCtx = ordered.find(c => c.facility === activeTab);

  const SECTION = ({ label }: { label: string }) => (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
      textTransform: "uppercase", color: "#8B949E",
      marginBottom: 12, marginTop: 24,
    }}>
      {label}
    </div>
  );

  return (
    <div>
      {/* Principles */}
      {principles.length > 0 && (
        <div style={{
          background: "rgba(10,110,94,0.04)",
          border: "1px solid rgba(10,110,94,0.15)",
          borderLeft: "3px solid var(--brand)",
          borderRadius: 6,
          padding: "12px 14px",
          marginBottom: 20,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
            textTransform: "uppercase", color: "var(--brand)", marginBottom: 8,
          }}>
            Treatment Principles
          </div>
          <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 4 }}>
            {principles.map((p, i) => (
              <li key={i} style={{ fontSize: 13, lineHeight: 1.55, color: "#1A2B3C" }}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {/* By Facility tabs */}
      <SECTION label="By Facility Level" />
      <div style={{
        display: "flex",
        border: "1px solid #D0D7DE",
        borderRadius: 6,
        overflow: "hidden",
        marginBottom: 16,
      }}>
        {ordered.map((ctx, i) => (
          <button
            key={ctx.facility}
            onClick={() => setActiveTab(ctx.facility)}
            style={{
              flex: 1,
              padding: "9px 12px",
              fontSize: 12,
              fontWeight: activeTab === ctx.facility ? 600 : 400,
              textAlign: "center",
              cursor: "pointer",
              background: activeTab === ctx.facility ? "var(--brand)" : "#FFFFFF",
              color: activeTab === ctx.facility ? "#fff" : "#57606A",
              border: "none",
              borderRight: i < ordered.length - 1 ? "1px solid #D0D7DE" : "none",
              transition: "all 0.12s ease",
            }}
          >
            {ctx.facility}
          </button>
        ))}
      </div>

      {activeCtx && (
        <div>
          {/* Approach */}
          <p style={{ fontSize: 13, color: "#57606A", lineHeight: 1.6, marginBottom: 14, marginTop: 0 }}>
            {activeCtx.approach}
          </p>

          {/* Drug table */}
          {activeCtx.drugs.length > 0 && (
            <div style={{ border: "1px solid #D0D7DE", borderRadius: 6, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: "#F6F8FA" }}>
                    {["Drug / Agent", "Dose", "Route", "Duration", "Notes"].map((h) => (
                      <th key={h} style={{
                        padding: "8px 10px", textAlign: "left",
                        fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
                        textTransform: "uppercase", color: "#8B949E",
                        borderBottom: "1px solid #D0D7DE",
                        whiteSpace: "nowrap",
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeCtx.drugs.map((drug, i) => (
                    <tr
                      key={i}
                      style={{ borderBottom: i < activeCtx.drugs.length - 1 ? "1px solid #F0F1F2" : "none" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#F9FAFB"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <td style={{ padding: "9px 10px", verticalAlign: "top", fontWeight: 600, color: "#1A2B3C" }}>
                        {drug.name}
                      </td>
                      <td style={{ padding: "9px 10px", verticalAlign: "top", fontFamily: "var(--font-mono)", fontSize: 12, color: "#57606A" }}>
                        {drug.dose}
                      </td>
                      <td style={{ padding: "9px 10px", verticalAlign: "top", color: "#57606A" }}>
                        {drug.route}
                      </td>
                      <td style={{ padding: "9px 10px", verticalAlign: "top", color: "#57606A", whiteSpace: "nowrap" }}>
                        {drug.duration}
                      </td>
                      <td style={{ padding: "9px 10px", verticalAlign: "top", color: "#8B949E", fontSize: 12 }}>
                        {drug.notes ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* First-line summary */}
      {firstLine.length > 0 && (
        <>
          <SECTION label="First-Line Treatment" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {firstLine.map((opt, i) => (
              <div key={i} style={{
                display: "flex", gap: 10, alignItems: "flex-start",
                padding: "10px 12px",
                background: "#FFFFFF",
                border: "1px solid #D0D7DE",
                borderRadius: 6,
                fontSize: 13,
              }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                  color: EVIDENCE_COLORS[opt.evidence] ?? "#8B949E",
                  border: `1px solid ${EVIDENCE_COLORS[opt.evidence] ?? "rgba(0,0,0,0.12)"}`,
                  borderRadius: 3, padding: "2px 5px", flexShrink: 0, marginTop: 1,
                  opacity: 0.9,
                }}>
                  {opt.evidence}
                </span>
                <div>
                  <span style={{ fontWeight: 600, color: "#1A2B3C" }}>
                    {opt.drug ?? opt.intervention}
                  </span>
                  {(opt.dose || opt.duration) && (
                    <span style={{ color: "#57606A", fontFamily: "var(--font-mono)", fontSize: 11, marginLeft: 6 }}>
                      {[opt.dose, opt.duration].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  {opt.note && (
                    <div style={{ fontSize: 12, color: "#57606A", marginTop: 2 }}>
                      {opt.note}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Second-line */}
      {secondLine.length > 0 && (
        <>
          <SECTION label="Second-Line / Alternatives" />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {secondLine.map((opt, i) => (
              <div key={i} style={{
                display: "flex", gap: 10, alignItems: "flex-start",
                padding: "9px 12px",
                border: "1px solid #D0D7DE",
                borderRadius: 6,
                fontSize: 13,
              }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                  color: EVIDENCE_COLORS[opt.evidence] ?? "#8B949E",
                  border: `1px solid ${EVIDENCE_COLORS[opt.evidence] ?? "rgba(0,0,0,0.12)"}`,
                  borderRadius: 3, padding: "2px 5px", flexShrink: 0, marginTop: 1,
                  opacity: 0.7,
                }}>
                  {opt.evidence}
                </span>
                <div>
                  <span style={{ color: "#1A2B3C" }}>{opt.drug ?? opt.intervention}</span>
                  {opt.dose && (
                    <span style={{ color: "#57606A", fontFamily: "var(--font-mono)", fontSize: 11, marginLeft: 6 }}>
                      {opt.dose}
                    </span>
                  )}
                  {opt.note && (
                    <div style={{ fontSize: 12, color: "#57606A", marginTop: 2 }}>{opt.note}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Special Populations */}
      {specialPopulations.length > 0 && (
        <>
          <SECTION label="Special Populations" />
          <div style={{ border: "1px solid #D0D7DE", borderRadius: 6, overflow: "hidden" }}>
            {specialPopulations.map((sp, i) => (
              <div key={i} style={{
                padding: "11px 14px",
                borderBottom: i < specialPopulations.length - 1 ? "1px solid #F0F1F2" : "none",
                display: "grid",
                gridTemplateColumns: "90px 1fr",
                gap: 12,
              }}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                  color: "#8B949E", textTransform: "uppercase",
                  letterSpacing: 0.4, paddingTop: 1,
                }}>
                  {sp.population}
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "#1A2B3C", lineHeight: 1.5 }}>
                    {sp.modification}
                  </div>
                  {sp.caution && (
                    <div style={{
                      fontSize: 12, color: "#CF222E", marginTop: 4, lineHeight: 1.4,
                      display: "flex", gap: 5,
                    }}>
                      <span style={{ flexShrink: 0, fontWeight: 700 }}>Caution:</span>
                      <span>{sp.caution}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Monitoring */}
      {monitoring.length > 0 && (
        <>
          <SECTION label="Monitoring" />
          <div style={{ border: "1px solid #D0D7DE", borderRadius: 6, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: "#F6F8FA" }}>
                  {["Parameter", "Frequency", "Target", "If Abnormal"].map((h) => (
                    <th key={h} style={{
                      padding: "8px 10px", textAlign: "left",
                      fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
                      textTransform: "uppercase", color: "#8B949E",
                      borderBottom: "1px solid #D0D7DE",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monitoring.map((m, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: i < monitoring.length - 1 ? "1px solid #F0F1F2" : "none" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#F9FAFB"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <td style={{ padding: "8px 10px", verticalAlign: "top", fontWeight: 600, color: "#1A2B3C" }}>{m.parameter}</td>
                    <td style={{ padding: "8px 10px", verticalAlign: "top", color: "#57606A" }}>{m.frequency}</td>
                    <td style={{ padding: "8px 10px", verticalAlign: "top", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--brand)" }}>{m.target ?? "—"}</td>
                    <td style={{ padding: "8px 10px", verticalAlign: "top", fontSize: 12, color: "#57606A" }}>{m.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* When to Refer */}
      {whenToRefer.length > 0 && (
        <>
          <SECTION label="When to Refer" />
          <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 5 }}>
            {whenToRefer.map((item, i) => (
              <li key={i} style={{ fontSize: 13, color: "#57606A", lineHeight: 1.5 }}>{item}</li>
            ))}
          </ul>
        </>
      )}

      {/* Pitfalls */}
      {pitfalls.length > 0 && (
        <>
          <SECTION label="Common Pitfalls" />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {pitfalls.map((p, i) => (
              <div key={i} style={{
                padding: "9px 12px",
                borderLeft: "3px solid #CF222E",
                background: "rgba(207,34,46,0.03)",
                border: "1px solid rgba(207,34,46,0.15)",
                borderRadius: "0 6px 6px 0",
                fontSize: 13,
                color: "#1A2B3C",
                lineHeight: 1.5,
              }}>
                {p}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
