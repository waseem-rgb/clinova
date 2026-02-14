import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API_BASE } from "../services/api";
import SidebarNav from "../components/SidebarNav";
import InlineSuggestInput from "../components/InlineSuggestInput";
import {
  loadInteractionsState,
  saveInteractionsState,
  clearSearchState,
} from "../app/lib/searchMemory";

export default function DrugInteractions() {
  const nav = useNavigate();
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  
  const [drugs, setDrugs] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [handoffSource, setHandoffSource] = useState<string | null>(null);

  // Restore state on mount or handle URL query params from handoff
  useEffect(() => {
    const drugsFromUrl = params.get("drugs") || params.get("drug") || "";
    const source = params.get("source") || null;
    
    if (drugsFromUrl) {
      // Handoff from another page - use URL drugs
      setDrugs(drugsFromUrl);
      setHandoffSource(source);
      // Clear URL params without navigation
      window.history.replaceState({}, "", "/interactions");
    } else {
      // No handoff - restore from saved state
      const saved = loadInteractionsState();
      if (saved) {
        setDrugs(saved.input.drugs || "");
        setData(saved.output);
      }
    }
  }, [params]);

  async function runCheck() {
    setBusy(true);
    setErrorMsg("");
    try {
      const list = drugs.split(",").map((d) => d.trim()).filter(Boolean);
      if (list.length < 2) {
        throw new Error("Please enter at least 2 drugs separated by commas");
      }
      
      const res = await fetch(`${API_BASE}/interactions/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drugs: list }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      setData(result);
      // Save to memory
      saveInteractionsState({ drugs }, result);
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to check interactions");
    } finally {
      setBusy(false);
    }
  }

  function handleNewSearch() {
    setDrugs("");
    setData(null);
    setErrorMsg("");
    clearSearchState("interactions");
  }

  // Get severity color
  function getSeverityColor(severity: string): string {
    const s = (severity || "").toLowerCase();
    if (s.includes("contraindicated")) return "#b91c1c";
    if (s.includes("major") || s.includes("high")) return "#c2410c";
    if (s.includes("moderate")) return "#b45309";
    if (s.includes("minor")) return "#0891b2";
    return "var(--muted)";
  }

  function getSeverityBg(severity: string): string {
    const s = (severity || "").toLowerCase();
    if (s.includes("contraindicated")) return "rgba(185,28,28,0.1)";
    if (s.includes("major") || s.includes("high")) return "rgba(194,65,12,0.1)";
    if (s.includes("moderate")) return "rgba(180,83,9,0.1)";
    if (s.includes("minor")) return "rgba(8,145,178,0.1)";
    return "var(--surface-2)";
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
            Drug Interactions
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
            <label style={{ display: "block", marginBottom: 8 }}>
              <span style={{ fontWeight: 800, color: "var(--ink)" }}>Enter drugs (comma-separated)</span>
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <InlineSuggestInput
                  value={drugs}
                  onChange={setDrugs}
                  placeholder="e.g., warfarin, aspirin, amiodarone"
                  suggestionType="drug"
                  multiValue={true}
                  minChars={2}
                />
              </div>
              <button
                onClick={runCheck}
                disabled={!drugs.trim() || busy}
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
                {busy ? "Checking…" : "Check Interactions"}
              </button>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
              Enter 2-10 drug names to check for interactions
            </div>
            {errorMsg && <div style={{ marginTop: 10, color: "#b91c1c" }}>{errorMsg}</div>}
          </div>

          {data && (
            <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
              {/* Overall Risk */}
              <div style={{ 
                background: "var(--surface)", 
                borderRadius: 18, 
                padding: 16, 
                border: "1px solid var(--border)", 
                boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ 
                    padding: "8px 16px", 
                    borderRadius: 10, 
                    background: getSeverityBg(data.overall_risk_level),
                    color: getSeverityColor(data.overall_risk_level),
                    fontWeight: 900,
                    fontSize: 16,
                  }}>
                    Overall Risk: {data.overall_risk_level || "Not assessed"}
                  </div>
                  <div style={{ color: "var(--muted)" }}>
                    {data.drugs?.length || 0} drugs checked
                  </div>
                </div>
                {data.summary && (
                  <div style={{ marginTop: 12, color: "var(--ink)", lineHeight: 1.6 }}>
                    {data.summary}
                  </div>
                )}
              </div>

              {/* Pairwise Interactions */}
              {(data.interactions || []).length > 0 && (
                <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 900, color: "var(--ink)", marginBottom: 12 }}>
                    🔗 Pairwise Interactions
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {(data.interactions || []).map((i: any, idx: number) => (
                      <div 
                        key={idx} 
                        style={{ 
                          border: `1px solid ${getSeverityColor(i.severity)}40`,
                          background: getSeverityBg(i.severity),
                          borderRadius: 12, 
                          padding: 12,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                          <div style={{ fontWeight: 800, color: "var(--ink)" }}>
                            {i.pair?.join(" + ") || "Unknown pair"}
                          </div>
                          <span style={{ 
                            padding: "4px 10px",
                            borderRadius: 999,
                            background: getSeverityColor(i.severity),
                            color: "#fff",
                            fontSize: 12,
                            fontWeight: 700,
                          }}>
                            {i.severity || "Unknown"}
                          </span>
                        </div>
                        
                        {i.mechanism && i.mechanism !== "Not found in sources" && (
                          <div style={{ marginTop: 8, color: "var(--muted)" }}>
                            <strong>Mechanism:</strong> {i.mechanism}
                          </div>
                        )}
                        
                        {i.clinical_effect && (
                          <div style={{ marginTop: 4, color: "var(--muted)" }}>
                            <strong>Effect:</strong> {i.clinical_effect}
                          </div>
                        )}
                        
                        {i.management && (
                          <div style={{ marginTop: 4, color: "var(--muted)" }}>
                            <strong>Management:</strong> {i.management}
                          </div>
                        )}
                        
                        {i.monitoring && (
                          <div style={{ marginTop: 4, color: "var(--muted)" }}>
                            <strong>Monitoring:</strong> {i.monitoring}
                          </div>
                        )}
                        
                        <div style={{ marginTop: 6, color: "var(--muted-2)", fontSize: 12 }}>
                          {i.rule_based ? "Rule-based detection" : "Evidence-based"}
                          {i.citations?.length > 0 && ` • Citations: ${i.citations.join(", ")}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Combined Risk Clusters */}
              {(data.combined_risks || []).length > 0 && (
                <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 900, color: "var(--ink)", marginBottom: 12 }}>
                    Combined Risk Clusters
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {(data.combined_risks || []).map((r: any, idx: number) => (
                      <div 
                        key={idx} 
                        style={{ 
                          border: "1px solid rgba(180,83,9,0.3)",
                          background: "rgba(180,83,9,0.08)",
                          borderRadius: 12, 
                          padding: 12,
                        }}
                      >
                        <div style={{ fontWeight: 800, color: "#b45309" }}>
                          {r.risk_type}
                        </div>
                        <div style={{ marginTop: 6, color: "var(--muted)" }}>
                          {r.explanation}
                        </div>
                        <div style={{ marginTop: 4, color: "var(--muted)" }}>
                          <strong>Drugs involved:</strong> {(r.implicated_drugs || []).join(", ")}
                        </div>
                        {r.monitoring && (
                          <div style={{ marginTop: 4, color: "var(--muted)" }}>
                            <strong>Monitoring:</strong> {r.monitoring}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Monitoring Recommendations */}
              {(data.monitoring || []).length > 0 && (
                <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 900, color: "var(--ink)" }}>📋 Monitoring Recommendations</div>
                  <ul style={{ margin: "8px 0 0 18px", color: "var(--muted)" }}>
                    {(data.monitoring || []).map((m: string, idx: number) => (
                      <li key={idx}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Safer Alternatives */}
              {(data.safer_alternatives || []).length > 0 && (
                <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 900, color: "var(--ink)" }}>💡 Safer Alternatives</div>
                  <ul style={{ margin: "8px 0 0 18px", color: "var(--muted)" }}>
                    {(data.safer_alternatives || []).map((a: string, idx: number) => (
                      <li key={idx}>{a}</li>
                    ))}
                  </ul>
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
                    <div style={{ color: "var(--muted)" }}>No evidence chunks retrieved (rule-based detection only).</div>
                  )}
                </div>
              </details>

              {/* No Interactions Found */}
              {(data.interactions || []).length === 0 && (data.combined_risks || []).length === 0 && (
                <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid rgba(16,185,129,0.3)" }}>
                  <div style={{ fontWeight: 900, color: "#059669" }}>✓ No Significant Interactions Found</div>
                  <div style={{ marginTop: 6, color: "var(--muted)" }}>
                    No major interactions were detected between these drugs in the available sources.
                    However, always verify with current drug references and clinical judgment.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {!data && !busy && (
            <div style={{ marginTop: 24, padding: 24, textAlign: "center", color: "var(--muted)" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🔀</div>
              <div style={{ fontWeight: 700 }}>Check Drug Interactions</div>
              <div style={{ marginTop: 8 }}>
                Enter 2 or more drug names above to check for potential interactions.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
