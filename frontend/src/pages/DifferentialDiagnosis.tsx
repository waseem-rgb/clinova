import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API_BASE } from "../services/api";
import SidebarNav from "../components/SidebarNav";
import InlineSuggestInput from "../components/InlineSuggestInput";
import {
  loadDDxState,
  saveDDxState,
  clearSearchState,
} from "../app/lib/searchMemory";
import type { DDxInput } from "../app/lib/searchMemory";

const INITIAL_INPUT: DDxInput = {
  symptoms: "",
  duration: "",
  age: "",
  sex: "unknown",
  pregnancy: "unknown",
  comorbidities: "",
  meds: "",
};

export default function DifferentialDiagnosis() {
  const nav = useNavigate();
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  
  const [input, setInput] = useState<DDxInput>(INITIAL_INPUT);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [data, setData] = useState<any>(null);
  const [handoffSource, setHandoffSource] = useState<string | null>(null);

  // Restore state on mount or handle URL query params from handoff
  useEffect(() => {
    const conditionFromUrl = params.get("condition") || params.get("symptoms") || "";
    const source = params.get("source") || null;
    
    if (conditionFromUrl) {
      // Handoff from another page (e.g., Lab) - pre-fill symptoms
      setInput((prev) => ({ ...prev, symptoms: conditionFromUrl }));
      setHandoffSource(source);
      // Clear URL params without navigation
      window.history.replaceState({}, "", "/ddx");
    } else {
      // No handoff - restore from saved state
      const saved = loadDDxState();
      if (saved) {
        setInput(saved.input);
        setData(saved.output);
      }
    }
  }, [params]);

  const updateField = <K extends keyof DDxInput>(key: K, value: DDxInput[K]) => {
    setInput((prev) => ({ ...prev, [key]: value }));
  };

  async function runDDx() {
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/ddx/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symptoms: input.symptoms,
          duration: input.duration || null,
          age: input.age ? Number(input.age) : null,
          sex: input.sex,
          pregnancy: input.pregnancy,
          comorbidities: input.comorbidities ? input.comorbidities.split(",").map((s) => s.trim()).filter(Boolean) : [],
          meds: input.meds ? input.meds.split(",").map((s) => s.trim()).filter(Boolean) : [],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      setData(result);
      // Save to memory
      saveDDxState(input, result);
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to run DDx");
    } finally {
      setBusy(false);
    }
  }

  function handleNewSearch() {
    setInput(INITIAL_INPUT);
    setData(null);
    setErrorMsg("");
    clearSearchState("ddx");
  }

  const mustNotMiss = data?.must_not_miss || [];
  const ranked = data?.ranked_ddx || [];
  const systemWise = data?.system_wise || [];
  const algorithm = data?.rapid_algorithm || { step_1: [], step_2: [], step_3: [] };
  const investigations = data?.suggested_investigations || { urgent: [], soon: [], routine: [] };
  const redFlags = data?.red_flags || [];
  const coverage = data?.coverage_gate || { passed: true, missing_evidence_ids: [] };

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
            Differential Diagnosis
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
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 800, color: "var(--ink)" }}>Symptoms *</span>
                <InlineSuggestInput
                  value={input.symptoms}
                  onChange={(v) => updateField("symptoms", v)}
                  placeholder="e.g., chest pain, shortness of breath, fever"
                  suggestionType="symptom"
                  multiValue={true}
                  minChars={2}
                />
              </label>
              
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 800, color: "var(--ink)" }}>Duration</span>
                <InlineSuggestInput
                  value={input.duration}
                  onChange={(v) => updateField("duration", v)}
                  placeholder="e.g., 3 days, 2 weeks"
                  suggestionType="duration"
                  minChars={1}
                />
              </label>
              
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 800, color: "var(--ink)" }}>Age</span>
                <input
                  value={input.age}
                  onChange={(e) => updateField("age", e.target.value)}
                  placeholder="e.g., 50"
                  type="number"
                  style={inputStyle}
                />
              </label>
              
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 800, color: "var(--ink)" }}>Sex</span>
                <select
                  value={input.sex}
                  onChange={(e) => updateField("sex", e.target.value)}
                  style={inputStyle}
                >
                  <option value="unknown">Unknown</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>
              
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 800, color: "var(--ink)" }}>Pregnancy</span>
                <select
                  value={input.pregnancy}
                  onChange={(e) => updateField("pregnancy", e.target.value)}
                  style={inputStyle}
                >
                  <option value="unknown">Unknown</option>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
              
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 800, color: "var(--ink)" }}>Comorbidities (comma-separated)</span>
                <InlineSuggestInput
                  value={input.comorbidities}
                  onChange={(v) => updateField("comorbidities", v)}
                  placeholder="e.g., diabetes mellitus, hypertension"
                  suggestionType="comorbidity"
                  multiValue={true}
                  minChars={2}
                />
              </label>
              
              <label style={{ display: "grid", gap: 6, gridColumn: "span 2" }}>
                <span style={{ fontWeight: 800, color: "var(--ink)" }}>Current Medications (comma-separated)</span>
                <InlineSuggestInput
                  value={input.meds}
                  onChange={(v) => updateField("meds", v)}
                  placeholder="e.g., metformin, lisinopril"
                  suggestionType="drug"
                  multiValue={true}
                  minChars={2}
                />
              </label>
            </div>

            <button
              onClick={runDDx}
              disabled={!input.symptoms.trim() || busy}
              style={{
                marginTop: 14,
                padding: "12px 20px",
                borderRadius: 12,
                border: "1px solid rgba(14,165,164,0.35)",
                background: busy ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), var(--accent-2))",
                color: busy ? "var(--muted)" : "#fff",
                fontWeight: 800,
                cursor: busy ? "not-allowed" : "pointer",
                boxShadow: busy ? "none" : "0 12px 28px rgba(14,165,164,0.3)",
              }}
            >
              {busy ? "Running DDx…" : "🔍 Run Differential Diagnosis"}
            </button>

            {errorMsg && <div style={{ marginTop: 10, color: "#b91c1c" }}>{errorMsg}</div>}
          </div>

          {data && (
            <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
              {/* Must-not-miss */}
              <div
                style={{
                  background: "var(--surface)",
                  borderRadius: 18,
                  padding: 16,
                  border: "1px solid rgba(185,28,28,0.2)",
                  boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
                }}
              >
                <div style={{ fontWeight: 900, color: "#b91c1c", fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  🚨 Must-not-miss (Immediate Action Required)
                </div>
                <div style={{ marginTop: 10, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "var(--ink)" }}>
                        <th style={th}>Diagnosis</th>
                        <th style={th}>Key Clues</th>
                        <th style={th}>Immediate Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mustNotMiss.map((row: any, idx: number) => (
                        <tr key={idx} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={tdStrong}>{row.diagnosis}</td>
                          <td style={tdMuted}>{(row.key_clues || row.clues || []).join("; ")}</td>
                          <td style={tdMuted}>{(row.immediate_actions || []).join("; ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!mustNotMiss.length && <div style={{ marginTop: 8, color: "var(--muted)" }}>No critical diagnoses flagged for this symptom cluster.</div>}
                </div>
              </div>

              {/* Ranked DDx */}
              <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16 }}>📊 Ranked Working Differential</div>
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {ranked.map((row: any, idx: number) => (
                    <div key={idx} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "var(--surface-2)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontWeight: 800, color: "var(--ink)", fontSize: 15 }}>
                          {idx + 1}. {row.diagnosis}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ 
                            fontSize: 12, 
                            fontWeight: 800, 
                            color: row.likelihood === "high" ? "#059669" : row.likelihood === "medium" ? "#d97706" : "var(--muted)",
                            textTransform: "uppercase",
                          }}>
                            {row.likelihood}
                          </span>
                          <button
                            onClick={() => nav(`/treatment?topic=${encodeURIComponent(row.diagnosis)}&source=ddx`)}
                            style={{
                              padding: "4px 10px",
                              borderRadius: 999,
                              border: "1px solid var(--accent)",
                              background: "var(--surface)",
                              cursor: "pointer",
                              fontWeight: 700,
                              color: "var(--accent)",
                              fontSize: 12,
                            }}
                          >
                            → Treatment
                          </button>
                        </div>
                      </div>
                      {!!(row.for?.length) && (
                        <div style={{ color: "#059669", marginTop: 8, fontSize: 13 }}>
                          <b>✓ For:</b> {row.for.join("; ")}
                        </div>
                      )}
                      {!!(row.against?.length) && (
                        <div style={{ color: "#b91c1c", marginTop: 4, fontSize: 13 }}>
                          <b>✗ Against:</b> {row.against.join("; ")}
                        </div>
                      )}
                      {!!(row.discriminating_tests?.length) && (
                        <div style={{ color: "var(--muted)", marginTop: 4, fontSize: 13 }}>
                          <b>Tests:</b> {row.discriminating_tests.join("; ")}
                        </div>
                      )}
                    </div>
                  ))}
                  {!ranked.length && <div style={{ color: "var(--muted)" }}>No ranked differentials extracted.</div>}
                </div>
              </div>

              {/* Red Flags */}
              {redFlags.length > 0 && (
                <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid rgba(180,83,9,0.2)" }}>
                  <div style={{ fontWeight: 900, color: "#b45309", fontSize: 16 }}>Red Flags / When to Escalate</div>
                  <ul style={{ margin: "8px 0 0 18px", color: "var(--muted)" }}>
                    {redFlags.map((s: string, idx: number) => (
                      <li key={`rf-${idx}`}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Rapid Algorithm */}
              <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16 }}>Rapid Diagnostic Algorithm</div>
                <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, color: "#b91c1c" }}>Step 1 — Immediate (within 1 hour)</div>
                    <ul style={{ margin: "6px 0 0 18px", color: "var(--muted)" }}>
                      {algorithm.step_1.map((s: string, idx: number) => (
                        <li key={`s1-${idx}`}>{s}</li>
                      ))}
                      {algorithm.step_1.length === 0 && <li>No specific actions listed</li>}
                    </ul>
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: "#d97706" }}>Step 2 — Next hours (1–4 hours)</div>
                    <ul style={{ margin: "6px 0 0 18px", color: "var(--muted)" }}>
                      {algorithm.step_2.map((s: string, idx: number) => (
                        <li key={`s2-${idx}`}>{s}</li>
                      ))}
                      {algorithm.step_2.length === 0 && <li>Based on initial results</li>}
                    </ul>
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: "var(--ink)" }}>Step 3 — If still unclear</div>
                    <ul style={{ margin: "6px 0 0 18px", color: "var(--muted)" }}>
                      {algorithm.step_3.map((s: string, idx: number) => (
                        <li key={`s3-${idx}`}>{s}</li>
                      ))}
                      {algorithm.step_3.length === 0 && <li>Consider specialist consultation</li>}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Investigations */}
              <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16 }}>Suggested Investigations</div>
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, color: "#b91c1c", fontSize: 12, textTransform: "uppercase" }}>Urgent</div>
                    <ul style={{ margin: "6px 0 0 18px", color: "var(--muted)", fontSize: 13 }}>
                      {investigations.urgent.map((s: string, idx: number) => (
                        <li key={`inv-u-${idx}`}>{s}</li>
                      ))}
                      {investigations.urgent.length === 0 && <li>—</li>}
                    </ul>
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: "#d97706", fontSize: 12, textTransform: "uppercase" }}>Soon</div>
                    <ul style={{ margin: "6px 0 0 18px", color: "var(--muted)", fontSize: 13 }}>
                      {investigations.soon.map((s: string, idx: number) => (
                        <li key={`inv-s-${idx}`}>{s}</li>
                      ))}
                      {investigations.soon.length === 0 && <li>—</li>}
                    </ul>
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: "var(--muted)", fontSize: 12, textTransform: "uppercase" }}>Routine</div>
                    <ul style={{ margin: "6px 0 0 18px", color: "var(--muted)", fontSize: 13 }}>
                      {investigations.routine.map((s: string, idx: number) => (
                        <li key={`inv-r-${idx}`}>{s}</li>
                      ))}
                      {investigations.routine.length === 0 && <li>—</li>}
                    </ul>
                  </div>
                </div>
              </div>

              {/* System-wise DDx */}
              {systemWise.length > 0 && (
                <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16 }}>🏥 System-wise Differential</div>
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {systemWise.map((group: any, idx: number) => (
                      <details key={`${group.system}-${idx}`} open={idx < 2}>
                        <summary style={{ fontWeight: 800, cursor: "pointer", color: "var(--ink)" }}>{group.system}</summary>
                        <div style={{ marginTop: 8, display: "grid", gap: 6, paddingLeft: 12 }}>
                          {group.items.map((row: any, rIdx: number) => (
                            <div key={`${group.system}-${rIdx}`} style={{ fontSize: 13, color: "var(--muted)" }}>
                              • <b style={{ color: "var(--ink)" }}>{row.diagnosis}</b>
                              {row.key_points?.length > 0 && `: ${row.key_points.join("; ")}`}
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )}

              {/* Evidence (Collapsible) */}
              <details style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                <summary style={{ fontWeight: 900, cursor: "pointer", color: "var(--ink)" }}>📚 Evidence Sources</summary>
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {(data.evidence || []).map((e: any, idx: number) => (
                    <div key={idx} style={{ fontSize: 12, color: "var(--muted)", padding: 8, background: "var(--surface-2)", borderRadius: 8 }}>
                      <div style={{ fontWeight: 700 }}>{e.source?.title} {e.source?.page_start ? `p${e.source.page_start}` : ""}</div>
                      <div style={{ marginTop: 4 }}>{e.snippet}</div>
                      <div style={{ color: "var(--muted-2)", marginTop: 2 }}>evidence_id: {e.id}</div>
                    </div>
                  ))}
                </div>
              </details>

              {/* Coverage Gate */}
              <div style={{ 
                background: "var(--surface)", 
                borderRadius: 18, 
                padding: 16, 
                border: coverage.passed ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(234,88,12,0.3)",
              }}>
                <div style={{ fontWeight: 900, color: coverage.passed ? "#059669" : "#b45309" }}>
                  {coverage.passed ? "Coverage Gate Passed" : "Coverage Gate Issues"}
                </div>
                {!coverage.passed && coverage.missing_evidence_ids?.length > 0 && (
                  <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 12 }}>
                    Some diagnoses may lack supporting evidence. Missing: {coverage.missing_evidence_ids.join(", ")}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!data && !busy && (
            <div style={{ marginTop: 24, padding: 24, textAlign: "center", color: "var(--muted)" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}></div>
              <div style={{ fontWeight: 700 }}>Enter patient symptoms to generate differential diagnosis</div>
              <div style={{ marginTop: 8 }}>
                Provide symptoms, duration, and patient details for a comprehensive differential.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--ink)",
};

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
