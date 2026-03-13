import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { SYMPTOM_LIST, CONTEXTUAL_CHIPS, SPELLING_CORRECTIONS } from "../data/symptoms";

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
  const [quickBusy, setQuickBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [data, setData] = useState<any>(null);
  const [quickData, setQuickData] = useState<any>(null);
  const [handoffSource, setHandoffSource] = useState<string | null>(null);

  // Symptom autocomplete state
  const [symptomQuery, setSymptomQuery] = useState("");
  const [symptomSuggestions, setSymptomSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggIdx, setSelectedSuggIdx] = useState(-1);
  const symptomInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Restore state on mount or handle URL query params from handoff
  useEffect(() => {
    const conditionFromUrl = params.get("condition") || params.get("symptoms") || "";
    const source = params.get("source") || null;

    if (conditionFromUrl) {
      setInput((prev) => ({ ...prev, symptoms: conditionFromUrl }));
      setHandoffSource(source);
      window.history.replaceState({}, "", "/ddx");
    } else {
      const saved = loadDDxState();
      if (saved) {
        setInput(saved.input);
        setData(saved.output);
      }
    }
  }, [params]);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
          symptomInputRef.current && !symptomInputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const updateField = <K extends keyof DDxInput>(key: K, value: DDxInput[K]) => {
    setInput((prev) => ({ ...prev, [key]: value }));
  };

  // Parse current symptoms into array
  const currentSymptoms = useMemo(() => {
    return input.symptoms
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }, [input.symptoms]);

  // Get contextual chip suggestions based on last added symptom
  const chipSuggestions = useMemo(() => {
    if (currentSymptoms.length === 0) return [];
    const lastSymptom = currentSymptoms[currentSymptoms.length - 1];
    const chips = CONTEXTUAL_CHIPS[lastSymptom] || [];
    // Filter out symptoms already added
    return chips.filter((c) => !currentSymptoms.includes(c.toLowerCase()));
  }, [currentSymptoms]);

  // Handle symptom input change with autocomplete
  const handleSymptomInputChange = useCallback((rawValue: string) => {
    // Apply client-side spelling corrections
    const corrected = SPELLING_CORRECTIONS[rawValue.toLowerCase()] || rawValue;

    // Get the last token after last comma for autocomplete
    const parts = corrected.split(",");
    const lastPart = (parts[parts.length - 1] || "").trim().toLowerCase();
    setSymptomQuery(lastPart);

    if (lastPart.length >= 2) {
      const matches = SYMPTOM_LIST.filter(
        (s) => s.toLowerCase().includes(lastPart) && !currentSymptoms.includes(s.toLowerCase())
      ).slice(0, 8);
      setSymptomSuggestions(matches);
      setShowSuggestions(matches.length > 0);
      setSelectedSuggIdx(-1);
    } else {
      setShowSuggestions(false);
    }

    updateField("symptoms", corrected);
  }, [currentSymptoms, updateField]);

  // Select a symptom from autocomplete dropdown
  const selectSymptom = useCallback((symptom: string) => {
    const parts = input.symptoms.split(",");
    parts[parts.length - 1] = " " + symptom;
    const newValue = parts.join(",").replace(/^[\s,]+/, "");
    updateField("symptoms", newValue + ", ");
    setShowSuggestions(false);
    setSymptomQuery("");
    symptomInputRef.current?.focus();
  }, [input.symptoms, updateField]);

  // Add a chip suggestion
  const addChipSymptom = useCallback((symptom: string) => {
    const current = input.symptoms.trim();
    const separator = current && !current.endsWith(",") ? ", " : current.endsWith(",") ? " " : "";
    updateField("symptoms", current + separator + symptom + ", ");
    symptomInputRef.current?.focus();
  }, [input.symptoms, updateField]);

  // Keyboard navigation for autocomplete
  const handleSymptomKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showSuggestions) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSuggIdx((prev) => Math.min(prev + 1, symptomSuggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSuggIdx((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter" && selectedSuggIdx >= 0) {
      e.preventDefault();
      selectSymptom(symptomSuggestions[selectedSuggIdx]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  }, [showSuggestions, symptomSuggestions, selectedSuggIdx, selectSymptom]);

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
      saveDDxState(input, result);
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to run DDx");
    } finally {
      setBusy(false);
    }
  }

  async function runQuickDDx() {
    setQuickBusy(true);
    setErrorMsg("");
    try {
      const qp = new URLSearchParams({ symptoms: input.symptoms });
      if (input.age) qp.set("age", input.age);
      if (input.sex && input.sex !== "unknown") qp.set("sex", input.sex);
      const res = await fetch(`${API_BASE}/ddx/quick?${qp.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      setQuickData(result);
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to run quick DDx");
    } finally {
      setQuickBusy(false);
    }
  }

  function handleNewSearch() {
    setInput(INITIAL_INPUT);
    setData(null);
    setQuickData(null);
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
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", display: "flex" }}>
      <div className="sidebar-collapse" style={{ width: 240, minWidth: 240, minHeight: "100vh" }}>
        <SidebarNav />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Hero header */}
        <div className="hero-section" style={{ padding: "0 32px" }}>
          <div style={{ position: "relative", zIndex: 1, padding: "24px 0 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <button
                onClick={() => nav("/")}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 6,
                  color: "rgba(255,255,255,0.7)",
                  padding: "5px 12px",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
              >
                Home
              </button>
              {data && (
                <>
                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>·</span>
                  <button
                    onClick={handleNewSearch}
                    style={{
                      background: "rgba(255,255,255,0.12)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      borderRadius: 6,
                      color: "#fff",
                      padding: "5px 14px",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    + New Search
                  </button>
                </>
              )}
            </div>
            <h1 style={{
              margin: 0,
              fontSize: 32,
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              color: "#fff",
              letterSpacing: -0.6,
            }}>
              Differential Diagnosis
            </h1>
          </div>
        </div>

        <div style={{ padding: "24px 32px 80px" }}>

          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid var(--border)",
              padding: 20,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
              {/* Symptom input with local autocomplete */}
              <label style={{ display: "grid", gap: 6, position: "relative" }}>
                <span style={{ fontWeight: 800, color: "var(--ink)" }}>Symptoms *</span>
                <input
                  ref={symptomInputRef}
                  value={input.symptoms}
                  onChange={(e) => handleSymptomInputChange(e.target.value)}
                  onKeyDown={handleSymptomKeyDown}
                  onFocus={() => {
                    if (symptomSuggestions.length > 0) setShowSuggestions(true);
                  }}
                  placeholder="e.g., chest pain, shortness of breath, fever"
                  style={inputStyle}
                  autoComplete="off"
                />
                {/* Autocomplete dropdown */}
                {showSuggestions && symptomSuggestions.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      boxShadow: "0 8px 24px rgba(15,23,42,0.15)",
                      zIndex: 50,
                      maxHeight: 220,
                      overflowY: "auto",
                    }}
                  >
                    {symptomSuggestions.map((s, idx) => (
                      <div
                        key={s}
                        onClick={() => selectSymptom(s)}
                        style={{
                          padding: "8px 12px",
                          cursor: "pointer",
                          fontSize: 14,
                          color: "var(--ink)",
                          background: idx === selectedSuggIdx ? "var(--surface-2)" : "transparent",
                          borderBottom: idx < symptomSuggestions.length - 1 ? "1px solid var(--border)" : "none",
                        }}
                        onMouseEnter={() => setSelectedSuggIdx(idx)}
                      >
                        {s}
                      </div>
                    ))}
                  </div>
                )}
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
                  onChange={(e) => {
                    updateField("sex", e.target.value);
                    // Reset pregnancy if not female
                    if (e.target.value !== "female") {
                      updateField("pregnancy", "unknown");
                    }
                  }}
                  style={inputStyle}
                >
                  <option value="unknown">Unknown</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>

              {/* Pregnancy: only show for female */}
              {input.sex === "female" && (
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
              )}

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

            {/* Contextual chip suggestions */}
            {chipSuggestions.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>Related:</span>
                {chipSuggestions.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => addChipSymptom(chip)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: "1px solid var(--brand-border)",
                      background: "var(--brand-light)",
                      cursor: "pointer",
                      fontWeight: 600,
                      color: "var(--accent)",
                      fontSize: 12,
                    }}
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button
                onClick={runQuickDDx}
                disabled={!input.symptoms.trim() || quickBusy}
                style={{
                  padding: "12px 22px",
                  borderRadius: 8,
                  border: "1.5px solid var(--teal-700)",
                  background: quickBusy ? "var(--bg-raised)" : "#fff",
                  color: quickBusy ? "var(--text-muted)" : "var(--teal-700)",
                  fontWeight: 700,
                  cursor: quickBusy ? "not-allowed" : "pointer",
                  fontSize: 14,
                }}
              >
                {quickBusy ? "Searching..." : "Quick DDx (6 conditions)"}
              </button>
              <button
                onClick={runDDx}
                disabled={!input.symptoms.trim() || busy}
                style={{
                  padding: "12px 22px",
                  borderRadius: 8,
                  border: "none",
                  background: busy ? "var(--bg-raised)" : "var(--teal-700)",
                  color: busy ? "var(--text-muted)" : "#fff",
                  fontWeight: 700,
                  cursor: busy ? "not-allowed" : "pointer",
                  fontSize: 14,
                }}
              >
                {busy ? "Running DDx..." : "Full Differential Diagnosis"}
              </button>
            </div>

            {errorMsg && <div style={{ marginTop: 10, color: "#b91c1c" }}>{errorMsg}</div>}
          </div>

          {/* Quick DDx Results */}
          {quickData && quickData.differentials?.length > 0 && (
            <div style={{
              marginTop: 16,
              background: "var(--surface)",
              borderRadius: 12,
              padding: 18,
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-sm)",
            }}>
              {/* Spelling correction notice */}
              {quickData.corrected_symptoms && (
                <div style={{
                  marginBottom: 12,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "rgba(14,165,164,0.08)",
                  border: "1px solid rgba(14,165,164,0.2)",
                  fontSize: 13,
                  color: "var(--ink)",
                }}>
                  Corrected: <b>{quickData.corrected_symptoms}</b>
                </div>
              )}

              <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16, marginBottom: 12 }}>
                Quick Differential — Top {quickData.differentials.length} Conditions
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {quickData.differentials.map((d: any, idx: number) => (
                  <div key={idx} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface-2)",
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 900, fontSize: 13,
                      background: d.urgency === "high" ? "#fef2f2" : d.urgency === "medium" ? "#fffbeb" : "#f0fdf4",
                      color: d.urgency === "high" ? "#dc2626" : d.urgency === "medium" ? "#d97706" : "#16a34a",
                      border: `1px solid ${d.urgency === "high" ? "#fecaca" : d.urgency === "medium" ? "#fed7aa" : "#bbf7d0"}`,
                      flexShrink: 0,
                    }}>
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, color: "var(--ink)", fontSize: 14 }}>{d.condition}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{d.distinguishing_feature}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
                        padding: "3px 8px", borderRadius: 4,
                        background: d.urgency === "high" ? "#fef2f2" : d.urgency === "medium" ? "#fffbeb" : "#f0fdf4",
                        color: d.urgency === "high" ? "#dc2626" : d.urgency === "medium" ? "#d97706" : "#16a34a",
                      }}>
                        {d.urgency}
                      </span>
                      <button
                        onClick={() => nav(`/treatment?topic=${encodeURIComponent(d.condition)}&source=ddx&autosubmit=true`)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 999,
                          border: "1px solid var(--accent)",
                          background: "var(--surface)",
                          cursor: "pointer",
                          fontWeight: 700,
                          color: "var(--accent)",
                          fontSize: 11,
                        }}
                      >
                        → Treatment
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Investigations to Order */}
              {quickData.investigations?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 15, marginBottom: 10 }}>
                    Investigations to Order
                  </div>
                  <div style={{ display: "grid", gap: 8, gridTemplateColumns: quickData.investigations.length > 1 ? "repeat(auto-fit, minmax(250px, 1fr))" : "1fr" }}>
                    {quickData.investigations.map((inv: any, idx: number) => (
                      <div key={idx} style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "var(--surface-2)",
                      }}>
                        <div style={{ fontWeight: 800, color: "var(--ink)", fontSize: 13, marginBottom: 6 }}>
                          {inv.condition}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {(inv.tests || []).map((test: string, tIdx: number) => (
                            <span key={tIdx} style={{
                              padding: "3px 8px",
                              borderRadius: 6,
                              background: "rgba(14,165,164,0.1)",
                              border: "1px solid rgba(14,165,164,0.2)",
                              fontSize: 12,
                              color: "var(--ink)",
                              fontWeight: 600,
                            }}>
                              {test}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {data && (
            <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
              {/* Must-not-miss */}
              <div
                style={{
                  background: "var(--surface)",
                  borderRadius: 12,
                  padding: 16,
                  border: "1px solid rgba(185,28,28,0.2)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div style={{ fontWeight: 900, color: "#b91c1c", fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  Must-not-miss (Immediate Action Required)
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
              <div style={{ background: "var(--surface)", borderRadius: 12, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16 }}>Ranked Working Differential</div>
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
                            onClick={() => nav(`/treatment?topic=${encodeURIComponent(row.diagnosis)}&source=ddx&autosubmit=true`)}
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
                          <b>For:</b> {row.for.join("; ")}
                        </div>
                      )}
                      {!!(row.against?.length) && (
                        <div style={{ color: "#b91c1c", marginTop: 4, fontSize: 13 }}>
                          <b>Against:</b> {row.against.join("; ")}
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
                <div style={{ background: "var(--surface)", borderRadius: 12, padding: 16, border: "1px solid rgba(180,83,9,0.2)" }}>
                  <div style={{ fontWeight: 900, color: "#b45309", fontSize: 16 }}>Red Flags / When to Escalate</div>
                  <ul style={{ margin: "8px 0 0 18px", color: "var(--muted)" }}>
                    {redFlags.map((s: string, idx: number) => (
                      <li key={`rf-${idx}`}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Rapid Algorithm */}
              <div style={{ background: "var(--surface)", borderRadius: 12, padding: 16, border: "1px solid var(--border)" }}>
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
              <div style={{ background: "var(--surface)", borderRadius: 12, padding: 16, border: "1px solid var(--border)" }}>
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
                <div style={{ background: "var(--surface)", borderRadius: 12, padding: 16, border: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16 }}>System-wise Differential</div>
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {systemWise.map((group: any, idx: number) => (
                      <details key={`${group.system}-${idx}`} open={idx < 2}>
                        <summary style={{ fontWeight: 800, cursor: "pointer", color: "var(--ink)" }}>{group.system}</summary>
                        <div style={{ marginTop: 8, display: "grid", gap: 6, paddingLeft: 12 }}>
                          {group.items.map((row: any, rIdx: number) => (
                            <div key={`${group.system}-${rIdx}`} style={{ fontSize: 13, color: "var(--muted)" }}>
                              <b style={{ color: "var(--ink)" }}>{row.diagnosis}</b>
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
              <details style={{ background: "var(--surface)", borderRadius: 12, padding: 16, border: "1px solid var(--border)" }}>
                <summary style={{ fontWeight: 900, cursor: "pointer", color: "var(--ink)" }}>Evidence Sources</summary>
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
                borderRadius: 12,
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
          {!data && !busy && !quickData && (
            <div style={{ marginTop: 32, padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>🔍</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Enter patient symptoms to generate differential diagnosis</div>
              <div style={{ marginTop: 8, fontSize: 14 }}>
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
