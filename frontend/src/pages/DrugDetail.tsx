// frontend/src/pages/DrugDetail.tsx
// Clinova — Unified Drug Detail page (drugs.db: FDA + curated overlay)
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE } from "../services/api";
import SidebarNav from "../components/SidebarNav";

interface DrugData {
  id: string;
  name: string;
  generic_name: string;
  brand_names: string[];
  drug_class: string[];
  route: string[];
  manufacturer: string;
  indications: string;
  dosing: string;
  contraindications: string;
  warnings: string;
  interactions: string;
  side_effects: string;
  pregnancy: string;
  rxcui: string[];
  completeness_score: number;
  dosing_structured: any;
  india_brands: string[];
  curated_data: any;
}

type TabKey = "overview" | "dosing" | "side_effects" | "interactions" | "warnings";

function cleanClass(cls: string): string {
  return cls.replace(/ \[EPC\]/g, "").trim();
}

function cleanFDAText(text: string): string {
  if (!text) return "";
  return text
    // Remove FDA section numbers like "1.1", "2.3.1" at start of lines
    .replace(/^\d+(\.\d+)*\s+[A-Z][A-Z\s&/,]+\n/gm, "")
    // Remove standalone ALL-CAPS headers (5+ chars)
    .replace(/^[A-Z][A-Z\s&/,]{4,}$/gm, "")
    // Remove leading section number references
    .replace(/^\d+(\.\d+)*\s+/gm, "")
    // Clean multiple blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function addToRx(drug: { id: string; name: string }) {
  try {
    const raw = localStorage.getItem("clinova_current_rx");
    const rx = raw ? JSON.parse(raw) : { patient: {}, drugs: [], createdAt: new Date().toISOString() };
    if (rx.drugs.some((d: any) => d.id === drug.id)) return;
    rx.drugs.push({ id: drug.id, name: drug.name, dose: "", frequency: "", duration: "", route: "Oral", instructions: "" });
    localStorage.setItem("clinova_current_rx", JSON.stringify(rx));
    window.dispatchEvent(new Event("rx-updated"));
  } catch {}
}

export default function DrugDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<DrugData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/drugs/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error("Drug not found");
      setData(await res.json());
    } catch {
      setError("Drug not found in the database.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)" }}>
        <div className="sidebar-collapse" style={{ width: 240, minWidth: 240, minHeight: "100vh" }}>
          <SidebarNav />
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading drug details...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)" }}>
        <div className="sidebar-collapse" style={{ width: 240, minWidth: 240, minHeight: "100vh" }}>
          <SidebarNav />
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
          <div style={{ color: "#DC2626", fontWeight: 600, fontSize: 14 }}>{error}</div>
          <button onClick={() => navigate("/drugs")}
            style={{ padding: "8px 20px", background: "var(--teal-700)", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
            Back to Drug Database
          </button>
        </div>
      </div>
    );
  }

  const classes = (data.drug_class || []).map(cleanClass);
  const routes = data.route || [];
  const brands = data.brand_names || [];
  const indiaBrands = data.india_brands || [];
  const curated = data.curated_data || {};

  const tabs: { key: TabKey; label: string; hasContent: boolean }[] = [
    { key: "overview", label: "Overview", hasContent: true },
    { key: "dosing", label: "Dosing", hasContent: !!data.dosing || !!data.dosing_structured || !!curated.dosing },
    { key: "side_effects", label: "Side Effects", hasContent: !!data.side_effects },
    { key: "interactions", label: "Interactions", hasContent: !!data.interactions },
    { key: "warnings", label: "Warnings", hasContent: !!data.warnings || !!data.contraindications },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", display: "flex" }}>
      <div className="sidebar-collapse" style={{ width: 240, minWidth: 240, minHeight: "100vh" }}>
        <SidebarNav />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header */}
        <div className="hero-section" style={{ padding: "0 16px", paddingBottom: 24 }}>
          <div style={{ maxWidth: 900, padding: "32px 0 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <button
                onClick={() => navigate("/drugs")}
                style={{
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 6,
                  color: "rgba(255,255,255,0.7)",
                  padding: "5px 12px",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                Drug Database
              </button>
              {curated.nlem && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 8px",
                  borderRadius: 4, background: "rgba(255,255,255,0.2)",
                  color: "#fff", letterSpacing: 0.5, fontFamily: "var(--font-mono)",
                }}>
                  NLEM 2022
                </span>
              )}
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "2px 8px",
                borderRadius: 4, background: "rgba(255,255,255,0.15)",
                color: "rgba(255,255,255,0.7)", letterSpacing: 0.5, fontFamily: "var(--font-mono)",
              }}>
                FDA
              </span>
            </div>

            <h1 style={{
              margin: 0, fontSize: 32, fontFamily: "var(--font-display)",
              fontStyle: "italic", fontWeight: 400, color: "#fff", letterSpacing: -0.3,
            }}>
              {data.name}
            </h1>

            {data.manufacturer && (
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "rgba(255,255,255,0.45)", fontFamily: "var(--font-mono)" }}>
                {data.manufacturer}
              </p>
            )}

            {/* Chips: class + route */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
              {classes.map((cls, i) => (
                <span key={i} style={{
                  fontSize: 11, padding: "3px 10px", borderRadius: 999,
                  background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)", fontWeight: 500,
                }}>
                  {cls}
                </span>
              ))}
              {routes.map((r, i) => (
                <span key={`r${i}`} style={{
                  fontSize: 11, padding: "3px 10px", borderRadius: 999,
                  background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)",
                  fontWeight: 500, fontFamily: "var(--font-mono)",
                }}>
                  {r}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Tab bar — scrollable on mobile */}
        <div style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "0 16px", overflowX: "auto", WebkitOverflowScrolling: "touch" as any }}>
          <div style={{ maxWidth: 900, display: "flex", gap: 0, whiteSpace: "nowrap" as any }}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "12px 18px", border: "none",
                  borderBottom: activeTab === tab.key ? "2px solid var(--teal-700)" : "2px solid transparent",
                  background: "transparent",
                  color: activeTab === tab.key ? "var(--ink)" : "var(--text-muted)",
                  fontWeight: activeTab === tab.key ? 600 : 500,
                  fontSize: 13, cursor: "pointer", fontFamily: "var(--font-sans)",
                  opacity: tab.hasContent ? 1 : 0.4,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ maxWidth: 900, padding: "20px 16px 80px" }}>

          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Curated summary cards */}
              {curated.mechanism_of_action && (
                <div style={{
                  padding: "14px 16px", background: "#fff",
                  border: "1px solid var(--border)", borderRadius: 10,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--teal-700)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "var(--font-mono)" }}>
                    Mechanism of Action
                  </div>
                  <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.6 }}>
                    {curated.mechanism_of_action}
                  </div>
                </div>
              )}

              {/* Indications */}
              {data.indications && (
                <ContentBlock title="Indications & Usage" content={cleanFDAText(data.indications)} color="var(--teal-700)" />
              )}

              {/* Contraindications */}
              {data.contraindications && (
                <ContentBlock title="Contraindications" content={cleanFDAText(data.contraindications)} color="#DC2626" />
              )}

              {/* Pregnancy */}
              {data.pregnancy && (
                <div style={{
                  padding: "14px 16px",
                  background: "rgba(219,39,119,0.04)",
                  border: "1px solid rgba(219,39,119,0.15)",
                  borderRadius: 10,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#DB2777", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "var(--font-mono)" }}>
                    Pregnancy & Lactation
                  </div>
                  <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.6, whiteSpace: "pre-line" }}>
                    {cleanFDAText(data.pregnancy)}
                  </div>
                </div>
              )}

              {/* Brand names */}
              {indiaBrands.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--teal-700)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "var(--font-mono)" }}>
                    Available in India as
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {indiaBrands.map((b, i) => (
                      <span key={`in${i}`} style={{
                        padding: "5px 12px", borderRadius: 8,
                        border: "1px solid rgba(15,118,110,0.2)", background: "rgba(15,118,110,0.06)",
                        fontSize: 13, color: "var(--teal-700)", fontWeight: 600,
                      }}>
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {brands.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "var(--font-mono)" }}>
                    Other Brand Names
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {brands.slice(0, 8).map((b, i) => (
                      <span key={i} style={{
                        padding: "4px 10px", borderRadius: 6,
                        border: "1px solid var(--border)", background: "#fff",
                        fontSize: 12, color: "var(--text-secondary)", fontWeight: 500,
                      }}>
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick action buttons */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => { addToRx({ id: data.id, name: data.name }); }}
                  style={{
                    padding: "10px 16px", borderRadius: 8, border: "none",
                    background: "var(--teal-700)", color: "#fff",
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Add to Rx
                </button>
                <button
                  onClick={() => navigate(`/dose-calculator?drug=${encodeURIComponent(data.name)}`)}
                  style={{
                    padding: "10px 16px", borderRadius: 8,
                    border: "1px solid var(--border)", background: "#fff",
                    color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Dose Calc
                </button>
                <button
                  onClick={() => navigate(`/interactions?drugs=${encodeURIComponent(data.name)}`)}
                  style={{
                    padding: "10px 16px", borderRadius: 8,
                    border: "1px solid var(--border)", background: "#fff",
                    color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Interactions
                </button>
              </div>
            </div>
          )}

          {/* Dosing Tab */}
          {activeTab === "dosing" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Curated structured dosing */}
              {(data.dosing_structured || curated.dosing) && (
                <StructuredDosingBlock dosing={data.dosing_structured || curated.dosing} />
              )}

              {/* FDA raw dosing text */}
              {data.dosing && (
                <ContentBlock title="FDA Dosage & Administration" content={cleanFDAText(data.dosing)} color="var(--teal-700)" />
              )}

              {/* Available forms from curated */}
              {curated.forms && curated.forms.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "var(--font-mono)" }}>
                    Available Forms
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {curated.forms.map((form: string, i: number) => (
                      <span key={i} style={{
                        padding: "4px 10px", borderRadius: 6,
                        border: "1px solid var(--border)", background: "#fff",
                        fontSize: 12, color: "var(--text-secondary)",
                      }}>
                        {form}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {!data.dosing && !data.dosing_structured && !curated.dosing && (
                <EmptyState text="No dosing data available." />
              )}
            </div>
          )}

          {/* Side Effects Tab */}
          {activeTab === "side_effects" && (
            <div>
              {data.side_effects ? (
                <ContentBlock title="Adverse Reactions" content={cleanFDAText(data.side_effects)} color="#D97706" />
              ) : (
                <EmptyState text="No adverse reaction data available." />
              )}
            </div>
          )}

          {/* Interactions Tab */}
          {activeTab === "interactions" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {data.interactions ? (
                <ContentBlock title="Drug Interactions" content={cleanFDAText(data.interactions)} color="#7C3AED" />
              ) : (
                <EmptyState text="No interaction data available." />
              )}
              <button
                onClick={() => navigate(`/interactions?drugs=${encodeURIComponent(data.name)}`)}
                style={{
                  alignSelf: "flex-start",
                  padding: "8px 16px", borderRadius: 8,
                  border: "1px solid var(--border)", background: "#fff",
                  color: "var(--teal-700)", fontSize: 13, fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Check interactions with other drugs
              </button>
            </div>
          )}

          {/* Warnings Tab */}
          {activeTab === "warnings" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {data.warnings && (
                <ContentBlock title="Warnings & Precautions" content={cleanFDAText(data.warnings)} color="#DC2626" />
              )}
              {data.contraindications && (
                <ContentBlock title="Contraindications" content={cleanFDAText(data.contraindications)} color="#DC2626" />
              )}
              {!data.warnings && !data.contraindications && (
                <EmptyState text="No warning data available." />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Content Block ──────────────────────────────────────────────────────────

function ContentBlock({ title, content, color }: { title: string; content: string; color: string }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid var(--border)",
      borderLeft: `3px solid ${color}`,
      borderRadius: 10,
      padding: "16px 18px",
    }}>
      <div style={{
        fontSize: 12, fontWeight: 600, color, marginBottom: 10,
        textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "var(--font-mono)",
      }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.7, whiteSpace: "pre-line" }}>
        {content}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "24px 0" }}>
      {text}
    </div>
  );
}

function StructuredDosingBlock({ dosing }: { dosing: any }) {
  if (!dosing || typeof dosing !== "object") return null;

  const sections: { label: string; key: string; color: string }[] = [
    { label: "Adult", key: "adult", color: "var(--teal-700)" },
    { label: "Pediatric", key: "pediatric", color: "#2563EB" },
    { label: "Renal Adjustment", key: "renal", color: "#D97706" },
    { label: "Hepatic Adjustment", key: "hepatic", color: "#D97706" },
  ];

  const hasAny = sections.some(s => dosing[s.key]);
  if (!hasAny) return null;

  return (
    <div style={{
      background: "#fff",
      border: "1px solid var(--border)",
      borderRadius: 10,
      overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 18px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--teal-700)", textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "var(--font-mono)" }}>
          Structured Dosing
        </div>
        <span style={{
          fontSize: 10, padding: "2px 8px", borderRadius: 4,
          background: "rgba(16,185,129,0.08)", color: "#059669",
          fontWeight: 600, fontFamily: "var(--font-mono)",
        }}>
          CURATED
        </span>
      </div>
      {sections.map(s => {
        const val = dosing[s.key];
        if (!val) return null;
        const text = typeof val === "string" ? val : JSON.stringify(val, null, 2);
        return (
          <div key={s.key} style={{
            padding: "14px 18px",
            borderBottom: "1px solid var(--border)",
          }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: s.color,
              textTransform: "uppercase", letterSpacing: 0.3,
              fontFamily: "var(--font-mono)", marginBottom: 4,
            }}>
              {s.label}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.6, whiteSpace: "pre-line" }}>
              {text}
            </div>
          </div>
        );
      })}
    </div>
  );
}
