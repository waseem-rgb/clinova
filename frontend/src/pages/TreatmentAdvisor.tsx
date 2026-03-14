import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { API_BASE } from "../services/api";
import SidebarNav from "../components/SidebarNav";
import InlineSuggestInput from "../components/InlineSuggestInput";
import {
  loadTreatmentState,
  saveTreatmentState,
  clearSearchState,
} from "../app/lib/searchMemory";
import type { TreatmentInput } from "../app/lib/searchMemory";

const INITIAL_INPUT: TreatmentInput = {
  topic: "",
  age: "",
  sex: "unknown",
  pregnancy: "unknown",
  severity: "",
  setting: "",
  comorbidities: "",
  allergies: "",
  renal: "",
  hepatic: "",
  currentMeds: "",
};

export default function TreatmentAdvisor() {
  const nav = useNavigate();
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const [input, setInput] = useState<TreatmentInput>(INITIAL_INPUT);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [data, setData] = useState<any>(null);

  // Restore state on mount
  useEffect(() => {
    const saved = loadTreatmentState();
    if (saved) {
      setInput(saved.input);
      setData(saved.output);
    }
  }, []);

  // Handle topic from URL query params (from DDx) + auto-submit
  const [pendingAutoSubmit, setPendingAutoSubmit] = useState(false);
  useEffect(() => {
    const fromQuery = params.get("topic") || params.get("diagnosis") || "";
    const shouldAutoSubmit = params.get("autosubmit") === "true";
    if (fromQuery && !input.topic) {
      setInput((prev) => ({ ...prev, topic: fromQuery }));
      if (shouldAutoSubmit) setPendingAutoSubmit(true);
    }
  }, [params, input.topic]);

  // Auto-submit once topic is set from URL
  useEffect(() => {
    if (pendingAutoSubmit && input.topic.trim() && !busy && !data) {
      setPendingAutoSubmit(false);
      runTx();
    }
  }, [pendingAutoSubmit, input.topic]);

  const updateField = <K extends keyof TreatmentInput>(key: K, value: TreatmentInput[K]) => {
    setInput((prev) => ({ ...prev, [key]: value }));
  };

  async function runTx() {
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/treatment/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic_or_diagnosis: input.topic,
          context: {
            age: input.age ? Number(input.age) : null,
            sex: input.sex,
            pregnancy: input.pregnancy,
            severity: input.severity || null,
            setting: input.setting || null,
            comorbidities: input.comorbidities ? input.comorbidities.split(",").map((s) => s.trim()).filter(Boolean) : [],
            allergies: input.allergies ? input.allergies.split(",").map((s) => s.trim()).filter(Boolean) : [],
            renal_status: input.renal || null,
            hepatic_status: input.hepatic || null,
            current_meds: input.currentMeds ? input.currentMeds.split(",").map((s) => s.trim()).filter(Boolean) : [],
          },
          confirmed_diagnosis: true,
          source: params.get("source") || "direct",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      setData(result);
      // Save to memory
      saveTreatmentState(input, result);
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to fetch treatment");
    } finally {
      setBusy(false);
    }
  }

  function handleNewSearch() {
    setInput(INITIAL_INPUT);
    setData(null);
    setErrorMsg("");
    clearSearchState("treatment");
  }

  // Handoff: Navigate to Drug Details for a specific drug
  function handleDrugDetails(drug: string) {
    nav(`/drug?q=${encodeURIComponent(drug)}&source=treatment`);
  }

  // Handoff: Navigate to Interactions for a specific drug
  function handleCheckInteractions(drug: string) {
    nav(`/interactions?drug=${encodeURIComponent(drug)}&source=treatment`);
  }

  // Handoff: Batch check all drugs from the treatment plan
  function handleCheckAllInteractions() {
    const allDrugs: string[] = [];
    
    // Collect all drugs from first-line and second-line regimens
    const firstLine = data?.first_line_regimens || [];
    const secondLine = data?.second_line_regimens || [];
    
    [...firstLine, ...secondLine].forEach((plan: any) => {
      (plan.drugs || []).forEach((drug: any) => {
        if (drug.generic && !allDrugs.includes(drug.generic)) {
          allDrugs.push(drug.generic);
        }
      });
    });
    
    // Also add current meds from input if any
    if (input.currentMeds) {
      input.currentMeds.split(",").forEach((med) => {
        const trimmed = med.trim();
        if (trimmed && !allDrugs.includes(trimmed)) {
          allDrugs.push(trimmed);
        }
      });
    }
    
    if (allDrugs.length > 0) {
      nav(`/interactions?drugs=${encodeURIComponent(allDrugs.join(","))}&source=treatment`);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg)", padding: "24px 16px" }}>
      <div style={{ maxWidth: "100%", margin: 0, display: "grid", gridTemplateColumns: "260px 1fr", gap: 24 }}>
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
            Treatment Advisor
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
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 800, color: "var(--ink)" }}>Condition / Topic *</span>
              <InlineSuggestInput
                value={input.topic}
                onChange={(v) => updateField("topic", v)}
                placeholder="e.g., community acquired pneumonia"
                suggestionType="disease"
                minChars={2}
              />
            </label>

            <div style={{ marginTop: 12, display: "grid", gap: 10, gridTemplateColumns: "repeat(3, 1fr)" }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 800, color: "var(--ink)" }}>Age</span>
                <input
                  value={input.age}
                  onChange={(e) => updateField("age", e.target.value)}
                  placeholder="e.g., 54"
                  type="number"
                  style={inputStyle}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 800, color: "var(--ink)" }}>Sex</span>
                <select value={input.sex} onChange={(e) => updateField("sex", e.target.value)} style={inputStyle}>
                  <option value="unknown">Unknown</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 800, color: "var(--ink)" }}>Pregnancy</span>
                <select value={input.pregnancy} onChange={(e) => updateField("pregnancy", e.target.value)} style={inputStyle}>
                  <option value="unknown">Unknown</option>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 800, color: "var(--ink)" }}>Severity</span>
                <InlineSuggestInput
                  value={input.severity}
                  onChange={(v) => updateField("severity", v)}
                  placeholder="mild/moderate/severe"
                  suggestionType="severity"
                  minChars={1}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 800, color: "var(--ink)" }}>Setting</span>
                <InlineSuggestInput
                  value={input.setting}
                  onChange={(v) => updateField("setting", v)}
                  placeholder="OPD/ER/ICU"
                  suggestionType="setting"
                  minChars={1}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 800, color: "var(--ink)" }}>Comorbidities (comma)</span>
                <InlineSuggestInput
                  value={input.comorbidities}
                  onChange={(v) => updateField("comorbidities", v)}
                  placeholder="e.g., diabetes mellitus, CKD"
                  suggestionType="comorbidity"
                  multiValue={true}
                  minChars={2}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 800, color: "var(--ink)" }}>Allergies (comma)</span>
                <InlineSuggestInput
                  value={input.allergies}
                  onChange={(v) => updateField("allergies", v)}
                  placeholder="e.g., penicillin, sulfa"
                  suggestionType="drug"
                  multiValue={true}
                  minChars={2}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 800, color: "var(--ink)" }}>Renal status</span>
                <InlineSuggestInput
                  value={input.renal}
                  onChange={(v) => updateField("renal", v)}
                  placeholder="e.g., CKD stage 3"
                  suggestionType="renal"
                  minChars={2}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 800, color: "var(--ink)" }}>Hepatic status</span>
                <InlineSuggestInput
                  value={input.hepatic}
                  onChange={(v) => updateField("hepatic", v)}
                  placeholder="e.g., cirrhosis Child-Pugh B"
                  suggestionType="hepatic"
                  minChars={2}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 800, color: "var(--ink)" }}>Current meds (comma)</span>
                <InlineSuggestInput
                  value={input.currentMeds}
                  onChange={(v) => updateField("currentMeds", v)}
                  placeholder="e.g., lisinopril, metformin"
                  suggestionType="drug"
                  multiValue={true}
                  minChars={2}
                />
              </label>
            </div>

            <button
              id="treatment-submit-btn"
              onClick={runTx}
              disabled={!input.topic.trim() || busy}
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
              {busy ? "Loading..." : "Get Treatment Plan"}
            </button>
            {errorMsg && <div style={{ marginTop: 10, color: "#b91c1c" }}>{errorMsg}</div>}
          </div>

          {data && (
            <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
              <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16 }}>Summary Plan</div>
                <ul style={{ margin: "8px 0 0 18px", color: "var(--muted)" }}>
                  {(data.summary_plan || []).map((s: string, idx: number) => (
                    <li key={`sum-${idx}`}>{s}</li>
                  ))}
                </ul>
              </div>

              <SectionPlan
                title="First-line Regimen"
                plans={data.first_line_regimens || []}
                onDrugDetails={handleDrugDetails}
                onCheckInteractions={handleCheckInteractions}
              />
              <SectionPlan
                title="Second-line / Alternatives"
                plans={data.second_line_regimens || []}
                onDrugDetails={handleDrugDetails}
                onCheckInteractions={handleCheckInteractions}
              />

              {/* Batch Interaction Check Button */}
              <div style={{
                background: "linear-gradient(135deg, rgba(234,88,12,0.08), rgba(234,88,12,0.04))",
                borderRadius: 18,
                padding: 16,
                border: "1px solid rgba(234,88,12,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}>
                <div>
                  <div style={{ fontWeight: 900, color: "#ea580c", fontSize: 15 }}>Check All Drug Interactions</div>
                  <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                    Verify interactions between all recommended drugs and current medications
                  </div>
                </div>
                <button
                  onClick={handleCheckAllInteractions}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 12,
                    border: "1px solid #ea580c",
                    background: "linear-gradient(135deg, #ea580c, #dc2626)",
                    color: "#fff",
                    fontWeight: 800,
                    cursor: "pointer",
                    boxShadow: "0 8px 20px rgba(234,88,12,0.25)",
                    whiteSpace: "nowrap",
                  }}
                >
                  Check Interactions →
                </button>
              </div>

              <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16 }}>Supportive Care</div>
                <ul style={{ margin: "8px 0 0 18px", color: "var(--muted)" }}>
                  {(data.supportive_care || []).map((s: string, idx: number) => (
                    <li key={`sup-${idx}`}>{s}</li>
                  ))}
                </ul>
              </div>

              <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid rgba(185,28,28,0.2)" }}>
                <div style={{ fontWeight: 900, color: "#b91c1c", fontSize: 16 }}>Contraindications & Cautions</div>
                <ul style={{ margin: "8px 0 0 18px", color: "var(--muted)" }}>
                  {(data.contraindications_and_cautions || []).map((s: string, idx: number) => (
                    <li key={`ci-${idx}`}>{s}</li>
                  ))}
                </ul>
              </div>

              <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16 }}>Monitoring</div>
                <ul style={{ margin: "8px 0 0 18px", color: "var(--muted)" }}>
                  {(data.monitoring || []).map((s: string, idx: number) => (
                    <li key={`mon-${idx}`}>{s}</li>
                  ))}
                </ul>
              </div>

              {!!(data.drug_interactions_flags || []).length && (
                <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid rgba(234,88,12,0.3)" }}>
                  <div style={{ fontWeight: 900, color: "#ea580c", fontSize: 16 }}>Drug Interaction Flags</div>
                  <ul style={{ margin: "8px 0 0 18px", color: "var(--muted)" }}>
                    {(data.drug_interactions_flags || []).map((s: any, idx: number) => (
                      <li key={`int-${idx}`}>{s.message || s}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16 }}>Follow-up</div>
                <ul style={{ margin: "8px 0 0 18px", color: "var(--muted)" }}>
                  {(data.follow_up || []).map((s: string, idx: number) => (
                    <li key={`fup-${idx}`}>{s}</li>
                  ))}
                </ul>
              </div>

              <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid rgba(185,28,28,0.2)" }}>
                <div style={{ fontWeight: 900, color: "#b91c1c", fontSize: 16 }}>Red Flags / Urgent Referral</div>
                <ul style={{ margin: "8px 0 0 18px", color: "var(--muted)" }}>
                  {(data.red_flags_urgent_referral || []).map((s: string, idx: number) => (
                    <li key={`rf-${idx}`}>{s}</li>
                  ))}
                </ul>
              </div>

              <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16 }}>India Brand Suggestions</div>
                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  {(data.brands_india || []).map((b: any, idx: number) => (
                    <div key={idx} style={{ padding: 10, background: "var(--surface-2)", borderRadius: 10, border: "1px solid var(--border)" }}>
                      <div style={{ fontWeight: 800, color: "var(--ink)" }}>{b.generic}</div>
                      <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                        {(b.brand_names || []).length > 0 
                          ? (b.brand_names || []).join(", ")
                          : b.price_notes || "Brands not available in sources"}
                      </div>
                      {!!(b.strengths || []).length && (
                        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>
                          Strengths: {b.strengths.join("; ")}
                        </div>
                      )}
                      {!!(b.forms || []).length && (
                        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>
                          Forms: {b.forms.join("; ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <details style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                <summary style={{ fontWeight: 900, cursor: "pointer", color: "var(--ink)" }}>Evidence Sources</summary>
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {(data.evidence?.chunks || []).map((e: any, idx: number) => (
                    <div key={idx} style={{ fontSize: 12, color: "var(--muted)", padding: 8, background: "var(--surface-2)", borderRadius: 8 }}>
                      <div style={{ marginBottom: 4 }}>{e.excerpt}</div>
                      {e.book_id && (
                        <div style={{ color: "var(--muted-2)", fontWeight: 600 }}>
                          {e.book_id} • {e.section_path} • p{e.page_start}
                        </div>
                      )}
                      <div style={{ color: "var(--muted-2)" }}>chunk_id: {e.chunk_id}</div>
                    </div>
                  ))}
                </div>
              </details>

              <div
                style={{
                  background: "var(--surface)",
                  borderRadius: 18,
                  padding: 16,
                  border: data.evidence?.coverage?.pass
                    ? "1px solid rgba(16,185,129,0.3)"
                    : "1px solid rgba(234,88,12,0.3)",
                }}
              >
                <div
                  style={{
                    fontWeight: 900,
                    color: data.evidence?.coverage?.pass ? "#059669" : "#b45309",
                  }}
                >
                  {data.evidence?.coverage?.pass ? "Coverage Gate Passed" : "Coverage Gate Issues"}
                </div>
                {!data.evidence?.coverage?.pass && (data.evidence?.coverage?.missing || []).length > 0 && (
                  <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 12 }}>
                    Missing evidence for: {(data.evidence?.coverage?.missing || []).join(", ")}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!data && !busy && (
            <div style={{ marginTop: 24, padding: 24, textAlign: "center", color: "var(--muted)" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}></div>
              <div style={{ fontWeight: 700 }}>Enter a condition to get treatment recommendations</div>
              <div style={{ marginTop: 8 }}>
                Provide patient details for personalized drug regimens with doses, monitoring, and India brand options.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function addToRx(drugName: string, dose?: string, route?: string, frequency?: string) {
  try {
    const raw = localStorage.getItem("clinova_current_rx");
    const rx = raw ? JSON.parse(raw) : { drugs: [], created: new Date().toISOString() };
    if (rx.drugs.some((d: any) => d.name.toLowerCase() === drugName.toLowerCase())) return;
    rx.drugs.push({ name: drugName, dose: dose || "", route: route || "", frequency: frequency || "", addedAt: new Date().toISOString() });
    localStorage.setItem("clinova_current_rx", JSON.stringify(rx));
    window.dispatchEvent(new Event("rx-updated"));
  } catch {}
}

function SectionPlan({ title, plans, onDrugDetails, onCheckInteractions }: {
  title: string;
  plans: any[];
  onDrugDetails?: (drug: string) => void;
  onCheckInteractions?: (drug: string) => void;
}) {
  return (
    <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
      <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16 }}>{title}</div>
      {(plans || []).map((plan, idx) => (
        <div key={idx} style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "var(--surface-2)" }}>
          <div style={{ fontWeight: 800, color: "var(--ink)" }}>{plan.label}</div>
          <div style={{ marginTop: 8, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--ink)" }}>
                  <th style={th}>Drug</th>
                  <th style={th}>Dose</th>
                  <th style={th}>Route</th>
                  <th style={th}>Frequency</th>
                  <th style={th}>Duration</th>
                  <th style={th}>Renal/Hepatic</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(plan.drugs || []).map((row: any, rIdx: number) => (
                  <tr key={rIdx} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={tdStrong}>{row.generic || "—"}</td>
                    <td style={tdMuted}>{row.dose || "—"}</td>
                    <td style={tdMuted}>{row.route || "—"}</td>
                    <td style={tdMuted}>{row.frequency || "—"}</td>
                    <td style={tdMuted}>{row.duration || "—"}</td>
                    <td style={tdMuted}>{[row.renal_adjustment, row.hepatic_adjustment].filter(Boolean).join(" / ") || "—"}</td>
                    <td style={tdMuted}>
                      {row.generic && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            onClick={() => onDrugDetails?.(row.generic)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: "1px solid var(--accent)",
                              background: "var(--surface)",
                              cursor: "pointer",
                              fontWeight: 700,
                              color: "var(--accent)",
                              fontSize: 11,
                              whiteSpace: "nowrap",
                            }}
                            title={`View details for ${row.generic}`}
                          >
                            📋 Details
                          </button>
                          <button
                            onClick={() => onCheckInteractions?.(row.generic)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: "1px solid #ea580c",
                              background: "var(--surface)",
                              cursor: "pointer",
                              fontWeight: 700,
                              color: "#ea580c",
                              fontSize: 11,
                              whiteSpace: "nowrap",
                            }}
                            title={`Check interactions for ${row.generic}`}
                          >
                            Check
                          </button>
                          <button
                            onClick={() => addToRx(row.generic, row.dose, row.route, row.frequency)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: "1px solid var(--teal-700)",
                              background: "var(--teal-700)",
                              cursor: "pointer",
                              fontWeight: 700,
                              color: "#fff",
                              fontSize: 11,
                              whiteSpace: "nowrap",
                            }}
                            title={`Add ${row.generic} to prescription`}
                          >
                            +Rx
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!!plan.indication_notes && <div style={{ marginTop: 8, color: "var(--muted)", fontSize: 13 }}>{plan.indication_notes}</div>}
        </div>
      ))}
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
