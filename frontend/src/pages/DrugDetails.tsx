import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API_BASE } from "../services/api";
import SidebarNav from "../components/SidebarNav";
import InlineSuggestInput from "../components/InlineSuggestInput";
import {
  loadDrugDetailsState,
  saveDrugDetailsState,
  clearSearchState,
} from "../app/lib/searchMemory";

export default function DrugDetails() {
  const nav = useNavigate();
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  
  const [q, setQ] = useState("");
  const [showSources, setShowSources] = useState(false);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [autoLoad, setAutoLoad] = useState(false);

  // Restore state on mount or handle URL query params from handoff
  useEffect(() => {
    const drugFromUrl = params.get("q") || params.get("drug") || "";
    const source = params.get("source") || null;
    
    if (drugFromUrl) {
      // Handoff from another page - set drug and trigger auto-load
      setQ(drugFromUrl);
      setAutoLoad(true);
      // Clear URL params without navigation
      window.history.replaceState({}, "", "/drug");
    } else {
      // No handoff - restore from saved state
      const saved = loadDrugDetailsState();
      if (saved) {
        setQ(saved.input.query || "");
        setData(saved.output);
      }
    }
  }, [params]);

  // Auto-load drug when coming from handoff
  useEffect(() => {
    if (autoLoad && q.trim()) {
      loadDrug(q);
      setAutoLoad(false);
    }
  }, [autoLoad, q]);

  async function loadDrug(name: string) {
    if (!name.trim()) return;
    
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/drugs/${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      setData(result);
      // Save to memory
      saveDrugDetailsState({ query: name }, result);
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to fetch drug");
    } finally {
      setBusy(false);
    }
  }

  function handleNewSearch() {
    setQ("");
    setData(null);
    setErrorMsg("");
    clearSearchState("drugDetails");
  }

  function copySkeleton() {
    if (!data?.header?.canonical_generic_name) return;
    const text = `Rx: ${data.header.canonical_generic_name} — [form/strength]`;
    navigator.clipboard.writeText(text).catch(() => {});
  }

  function handleSelectDrug(drug: string) {
    setQ(drug);
    loadDrug(drug);
  }

  // Handoff: Navigate to Interactions to check this drug
  function handleCheckInteractions() {
    if (!data?.header?.canonical_generic_name) return;
    nav(`/interactions?drug=${encodeURIComponent(data.header.canonical_generic_name)}&source=drug`);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg)", padding: "24px 24px 24px 0" }}>
      <div style={{ maxWidth: "100%", minWidth: 1200, margin: 0, display: "grid", gridTemplateColumns: "260px 1fr", gap: 24 }}>
        <SidebarNav />

        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={() => nav("/")}
              style={{
                border: "1px solid var(--border)",
                background: "var(--surface)",
                padding: "8px 12px",
                borderRadius: 12,
                cursor: "pointer",
                fontWeight: 800,
                color: "var(--ink)",
                boxShadow: "0 8px 18px rgba(15,23,42,0.08)",
              }}
            >
              ← Back
            </button>
            
            {data && (
              <button
                onClick={handleNewSearch}
                style={{
                  border: "1px solid var(--accent)",
                  background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                  padding: "8px 16px",
                  borderRadius: 12,
                  cursor: "pointer",
                  fontWeight: 800,
                  color: "#fff",
                  boxShadow: "0 8px 18px rgba(14,165,164,0.25)",
                }}
              >
                + New Search
              </button>
            )}
          </div>

          <h1
            style={{
              marginTop: 16,
              fontSize: 36,
              fontWeight: 700,
              color: "var(--ink)",
              letterSpacing: -0.6,
              fontFamily: "var(--font-display)",
            }}
          >
            Drug Details
          </h1>

          <div
            style={{
              marginTop: 16,
              background: "var(--surface)",
              borderRadius: 18,
              border: "1px solid var(--border)",
              padding: 18,
              boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
            }}
          >
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <InlineSuggestInput
                  value={q}
                  onChange={setQ}
                  placeholder="Search drug (e.g., metformin, atorvastatin)..."
                  suggestionType="drug"
                  onSelectSuggestion={handleSelectDrug}
                  minChars={2}
                />
              </div>
              <button
                onClick={() => loadDrug(q)}
                disabled={!q.trim() || busy}
                style={{
                  padding: "10px 18px",
                  borderRadius: 12,
                  border: "1px solid rgba(14,165,164,0.35)",
                  background: busy ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), var(--accent-2))",
                  color: busy ? "var(--muted)" : "#fff",
                  fontWeight: 800,
                  cursor: busy ? "not-allowed" : "pointer",
                  boxShadow: busy ? "none" : "0 12px 28px rgba(14,165,164,0.3)",
                  whiteSpace: "nowrap",
                }}
              >
                {busy ? "Loading…" : "Get Details"}
              </button>
            </div>
            {errorMsg && <div style={{ marginTop: 10, color: "#b91c1c" }}>{errorMsg}</div>}
          </div>

          {busy && <div style={{ marginTop: 12 }}>Loading…</div>}

          {data && (
            <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
              {/* Header Card */}
              <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)", boxShadow: "0 16px 40px rgba(15,23,42,0.08)" }}>
                <div style={{ fontWeight: 900, fontSize: 20, color: "var(--ink)" }}>
                  {data.header?.canonical_generic_name}
                </div>
                {data.header?.drug_class && (
                  <div style={{ marginTop: 4, color: "var(--muted)", fontWeight: 600 }}>
                    {data.header.drug_class}
                  </div>
                )}
                <div style={{ marginTop: 6, color: "var(--muted)" }}>
                  {(data.header?.common_brand_names || []).join(", ") || "Brand names: See India brands section"}
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(data.header?.quick_flags || []).map((f: string) => (
                    <span key={f} style={{ 
                      border: "1px solid rgba(234,88,12,0.3)", 
                      background: "rgba(234,88,12,0.08)",
                      borderRadius: 999, 
                      padding: "4px 10px", 
                      fontSize: 12, 
                      fontWeight: 700,
                      color: "#b45309",
                    }}>
                      ⚠ {f}
                    </span>
                  ))}
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={copySkeleton}
                    style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontWeight: 700, cursor: "pointer" }}
                  >
                    📋 Copy Rx Skeleton
                  </button>
                  <button
                    onClick={() => setShowSources((v) => !v)}
                    style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontWeight: 700, cursor: "pointer" }}
                  >
                    {showSources ? "Hide Sources" : "Show Sources"}
                  </button>
                  <button
                    onClick={handleCheckInteractions}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 10,
                      border: "1px solid #ea580c",
                      background: "linear-gradient(135deg, #ea580c, #dc2626)",
                      color: "#fff",
                      fontWeight: 800,
                      cursor: "pointer",
                      boxShadow: "0 4px 12px rgba(234,88,12,0.2)",
                    }}
                  >
                    ⚡ Check Interactions
                  </button>
                </div>
              </div>

              {/* Executive Summary Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                {(data.executive_summary_cards || []).map((card: any, idx: number) => (
                  <div key={idx} style={{ background: "var(--surface)", borderRadius: 16, padding: 14, border: "1px solid var(--border)" }}>
                    <div style={{ fontWeight: 800, color: "var(--muted)", fontSize: 12, textTransform: "uppercase" }}>{card.title}</div>
                    <div style={{ marginTop: 6, color: "var(--ink)", fontWeight: 600 }}>{card.value || "Not found in sources"}</div>
                  </div>
                ))}
              </div>

              {/* Sections */}
              {(data.sections || []).map((section: any) => {
                const bullets = section.bullets || [];
                // Skip empty sections
                if (bullets.length === 0 || (bullets.length === 1 && bullets[0] === "Not found in sources")) {
                  return null;
                }
                return (
                  <div key={section.key} style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                    <div style={{ fontWeight: 900, color: "var(--ink)" }}>{section.title}</div>
                    <ul style={{ margin: "8px 0 0 18px", color: "var(--muted)" }}>
                      {bullets.map((b: string, idx: number) => (
                        <li key={`${section.key}-${idx}`}>{b}</li>
                      ))}
                    </ul>
                    {showSources && section.citations?.length > 0 && (
                      <div style={{ marginTop: 6, color: "var(--muted-2)", fontSize: 12 }}>
                        Citations: {section.citations.join(", ")}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Brands & Prices */}
              {(data.brands_and_prices?.rows || []).length > 0 && (
                <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 900, color: "var(--ink)" }}>🇮🇳 Indian Brands & Prices</div>
                  <div style={{ marginTop: 10, overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: "var(--ink)" }}>
                          <th style={th}>Brand</th>
                          <th style={th}>Strength</th>
                          <th style={th}>Form</th>
                          <th style={th}>Pack</th>
                          <th style={th}>Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.brands_and_prices?.rows || []).map((row: any, idx: number) => (
                          <tr key={idx} style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={tdStrong}>{row.brand || "—"}</td>
                            <td style={tdMuted}>{row.strength || "—"}</td>
                            <td style={tdMuted}>{row.form || "—"}</td>
                            <td style={tdMuted}>{row.pack || "—"}</td>
                            <td style={tdMuted}>{row.price || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {(data.brands_and_prices?.rows || []).length === 0 && (
                    <div style={{ marginTop: 8, color: "var(--muted)" }}>No brand information found in MIMS/Tripathi sources.</div>
                  )}
                </div>
              )}

              {/* Evidence (Collapsible) */}
              <details style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                <summary style={{ fontWeight: 900, cursor: "pointer", color: "var(--ink)" }}>📚 Evidence Sources</summary>
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {(data.evidence || []).map((e: any, idx: number) => (
                    <div key={idx} style={{ fontSize: 12, color: "var(--muted)", padding: 8, background: "var(--surface-2)", borderRadius: 8 }}>
                      <div style={{ fontWeight: 700 }}>{e.book} {e.page_start ? `p${e.page_start}` : ""}</div>
                      <div style={{ marginTop: 4 }}>{e.snippet}</div>
                      <div style={{ color: "var(--muted-2)", marginTop: 2 }}>chunk_id: {e.chunk_id}</div>
                    </div>
                  ))}
                  {(data.evidence || []).length === 0 && (
                    <div style={{ color: "var(--muted)" }}>No evidence chunks available.</div>
                  )}
                </div>
              </details>

              {/* Coverage Gate */}
              {!data.coverage_gate?.passed && (
                <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid rgba(234,88,12,0.3)" }}>
                  <div style={{ fontWeight: 900, color: "#b45309" }}>⚠ Coverage Notice</div>
                  <div style={{ marginTop: 6, color: "var(--muted)" }}>
                    Some information may be incomplete. Evidence coverage did not fully pass.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {!data && !busy && (
            <div style={{ marginTop: 24, padding: 24, textAlign: "center", color: "var(--muted)" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>💊</div>
              <div style={{ fontWeight: 700 }}>Search for a drug to see details</div>
              <div style={{ marginTop: 8 }}>
                Enter a generic or brand name above to get comprehensive drug information.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "10px 8px",
  fontSize: 12,
  letterSpacing: 0.2,
  textTransform: "uppercase",
  color: "var(--muted)",
};

const tdMuted: React.CSSProperties = {
  padding: "10px 8px",
  color: "var(--muted)",
  verticalAlign: "top",
};

const tdStrong: React.CSSProperties = {
  padding: "10px 8px",
  color: "var(--ink)",
  verticalAlign: "top",
  fontWeight: 800,
};
