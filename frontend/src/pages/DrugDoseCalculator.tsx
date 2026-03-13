// frontend/src/pages/DrugDoseCalculator.tsx
// Drug Dose Calculator — search drug, enter patient params, get calculated doses
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../services/api";
import SidebarNav from "../components/SidebarNav";

// ── Types ────────────────────────────────────────────────────────

interface DrugSuggestion {
  display: string;
  input: string;
  canonical: string;
  type: string;
}

interface DrugData {
  generic_name: string;
  drug_class: string;
  brands_india: string[];
  forms: string[];
  mechanism: string;
  indications: string[];
  contraindications: string[];
  dosing: {
    adult: string;
    pediatric: string;
    renal: string;
    hepatic: string;
  };
  adverse_effects: string[];
  monitoring: string[];
  pregnancy_lactation: string;
  quick_flags: string[];
  nlem?: boolean;
}

interface PedDoseResult {
  daily_range?: string;
  per_dose_range?: string;
  daily?: string;
  per_dose?: string;
  frequency?: string;
  text?: string;
}

// ── Pediatric Dose Calculation ───────────────────────────────────

function calculatePediatricDose(doseText: string, weightKg: number): PedDoseResult {
  const rangeMatch = doseText.match(/(\d+\.?\d*)\s*[-–to]+\s*(\d+\.?\d*)\s*mg\/kg/i);
  const singleMatch = doseText.match(/(\d+\.?\d*)\s*mg\/kg/i);

  const freqMap: Record<string, number> = {
    "OD": 1, "daily": 1, "once": 1, "QD": 1,
    "BD": 2, "BID": 2, "twice": 2, "Q12H": 2, "q12h": 2,
    "TDS": 3, "TID": 3, "three": 3, "Q8H": 3, "q8h": 3,
    "QID": 4, "four": 4, "Q6H": 4, "q6h": 4,
  };

  let dosesPerDay = 3;
  for (const [key, val] of Object.entries(freqMap)) {
    if (doseText.includes(key) || doseText.toLowerCase().includes(key.toLowerCase())) {
      dosesPerDay = val;
      break;
    }
  }

  const isPerDay = /\/day|daily|\/d\b/i.test(doseText);

  if (rangeMatch) {
    const lowPerKg = parseFloat(rangeMatch[1]);
    const highPerKg = parseFloat(rangeMatch[2]);

    if (isPerDay) {
      const dailyLow = lowPerKg * weightKg;
      const dailyHigh = highPerKg * weightKg;
      return {
        daily_range: `${dailyLow.toFixed(0)} – ${dailyHigh.toFixed(0)} mg/day`,
        per_dose_range: `${(dailyLow / dosesPerDay).toFixed(0)} – ${(dailyHigh / dosesPerDay).toFixed(0)} mg per dose`,
        frequency: `${dosesPerDay}x daily`,
      };
    } else {
      const perDoseLow = lowPerKg * weightKg;
      const perDoseHigh = highPerKg * weightKg;
      return {
        per_dose_range: `${perDoseLow.toFixed(0)} – ${perDoseHigh.toFixed(0)} mg per dose`,
        daily_range: `${(perDoseLow * dosesPerDay).toFixed(0)} – ${(perDoseHigh * dosesPerDay).toFixed(0)} mg/day`,
        frequency: `${dosesPerDay}x daily`,
      };
    }
  }

  if (singleMatch) {
    const perKg = parseFloat(singleMatch[1]);
    const dose = perKg * weightKg;

    if (isPerDay) {
      return {
        daily: `${dose.toFixed(0)} mg/day`,
        per_dose: `${(dose / dosesPerDay).toFixed(0)} mg per dose`,
        frequency: `${dosesPerDay}x daily`,
      };
    } else {
      return {
        per_dose: `${dose.toFixed(0)} mg per dose`,
        daily: `${(dose * dosesPerDay).toFixed(0)} mg/day`,
        frequency: `${dosesPerDay}x daily`,
      };
    }
  }

  return { text: doseText };
}

// ── Form Suggestion ──────────────────────────────────────────────

function suggestForm(dosePerDoseMg: number, forms: string[]): string[] {
  const suggestions: string[] = [];

  for (const form of forms) {
    const tabMatch = form.match(/(tablet|capsule|cap)\s*(\d+)\s*mg/i) || form.match(/(\d+)\s*mg\s*(tablet|capsule|cap)/i);
    if (tabMatch) {
      const strength = parseInt(tabMatch[1]) > 10 ? parseInt(tabMatch[1]) : parseInt(tabMatch[2]);
      const count = dosePerDoseMg / strength;
      if (count >= 0.5 && count <= 4) {
        const formType = form.match(/capsule|cap/i) ? "Capsule" : "Tablet";
        suggestions.push(`${formType} ${strength}mg x ${count % 1 === 0 ? count : count.toFixed(1)}`);
      }
    }

    const suspMatch = form.match(/(\d+)\s*mg\s*\/\s*(\d+)\s*ml/i);
    if (suspMatch) {
      const mgPer = parseInt(suspMatch[1]);
      const mlPer = parseInt(suspMatch[2]);
      const mgPerMl = mgPer / mlPer;
      const mlNeeded = dosePerDoseMg / mgPerMl;
      if (mlNeeded > 0 && mlNeeded <= 30) {
        suggestions.push(`Suspension ${mgPer}mg/${mlPer}mL — give ${mlNeeded.toFixed(1)} mL`);
      }
    }
  }

  return suggestions;
}

// ── CrCl Calculation (Cockcroft-Gault) ───────────────────────────

function calculateCrCl(age: number, weight: number, creatinine: number, sex: "male" | "female"): number {
  const base = ((140 - age) * weight) / (72 * creatinine);
  return sex === "female" ? base * 0.85 : base;
}

// ── Parse per-dose number from PedDoseResult ─────────────────────

function extractPerDoseMg(result: PedDoseResult): number | null {
  const text = result.per_dose_range || result.per_dose || "";
  const rangeMatch = text.match(/(\d+)\s*–\s*(\d+)/);
  if (rangeMatch) {
    return (parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2;
  }
  const singleMatch = text.match(/(\d+)\s*mg/);
  if (singleMatch) return parseInt(singleMatch[1]);
  return null;
}

// ── Component ────────────────────────────────────────────────────

export default function DrugDoseCalculator() {
  const nav = useNavigate();

  // Drug search state
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<DrugSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [drug, setDrug] = useState<DrugData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Patient params
  const [mode, setMode] = useState<"adult" | "pediatric">("adult");
  const [weight, setWeight] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"male" | "female">("male");
  const [creatinine, setCreatinine] = useState("");

  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Drug Search (debounced) ─────────────────────────────────
  const searchDrugs = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return; }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch(`${API_BASE}/drugs/search?q=${encodeURIComponent(q)}`, { signal: ac.signal });
      if (!res.ok) return;
      const data = await res.json();
      const items: DrugSuggestion[] = (data.suggestions || []).map((s: any) => ({
        display: s.display || s.label || String(s),
        input: s.input || s.label || String(s),
        canonical: s.canonical || s.generic || s.label || String(s),
        type: s.type || "",
      }));
      setSuggestions(items);
      if (items.length > 0) setShowDropdown(true);
    } catch (e: any) {
      if (e?.name !== "AbortError") setSuggestions([]);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => searchDrugs(query), 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, searchDrugs]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Load Drug Details ───────────────────────────────────────
  async function loadDrug(name: string) {
    setLoading(true);
    setError("");
    setShowDropdown(false);
    try {
      // Use quick endpoint for dose-relevant fields
      const res = await fetch(`${API_BASE}/drugs/${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error("Drug not found");
      const result = await res.json();

      // Map from monograph response to our flat DrugData
      const header = result.header || {};
      const sections = result.sections || [];
      const dosingSection = sections.find((s: any) => s.key === "dosing");
      const dosing: any = { adult: "", pediatric: "", renal: "", hepatic: "" };
      if (dosingSection) {
        for (const b of dosingSection.bullets || []) {
          if (b.startsWith("**Adult**")) dosing.adult = b.replace("**Adult**: ", "").replace("**Adult**:", "").trim();
          else if (b.startsWith("**Pediatric**")) dosing.pediatric = b.replace("**Pediatric**: ", "").replace("**Pediatric**:", "").trim();
          else if (b.startsWith("**Renal**")) dosing.renal = b.replace("**Renal**: ", "").replace("**Renal**:", "").trim();
          else if (b.startsWith("**Hepatic**")) dosing.hepatic = b.replace("**Hepatic**: ", "").replace("**Hepatic**:", "").trim();
        }
      }

      const warningsSection = sections.find((s: any) => s.key === "contraindications");
      const adverseSection = sections.find((s: any) => s.key === "adverse_effects");

      setDrug({
        generic_name: header.canonical_generic_name || name,
        drug_class: header.drug_class || "",
        brands_india: header.common_brand_names || [],
        forms: header.forms || [],
        mechanism: "",
        indications: [],
        contraindications: warningsSection?.bullets || [],
        dosing,
        adverse_effects: adverseSection?.bullets || [],
        monitoring: [],
        pregnancy_lactation: header.pregnancy_category || "",
        quick_flags: header.quick_flags || [],
        nlem: header.nlem,
      });
    } catch (e: any) {
      setError(e?.message || "Failed to load drug");
      setDrug(null);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectDrug(s: DrugSuggestion) {
    setQuery(s.input);
    setSuggestions([]);
    setShowDropdown(false);
    loadDrug(s.canonical);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(p => p < suggestions.length - 1 ? p + 1 : 0); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(p => p > 0 ? p - 1 : suggestions.length - 1); }
    else if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); handleSelectDrug(suggestions[activeIdx]); }
    else if (e.key === "Escape") { setShowDropdown(false); }
  }

  // ── Computed Values ─────────────────────────────────────────
  const weightNum = parseFloat(weight) || 0;
  const ageNum = parseFloat(age) || 0;
  const creatinineNum = parseFloat(creatinine) || 0;

  const crcl = (creatinineNum > 0 && ageNum > 0 && weightNum > 0)
    ? calculateCrCl(ageNum, weightNum, creatinineNum, sex)
    : null;

  const pedDose = (drug && mode === "pediatric" && weightNum > 0 && drug.dosing.pediatric)
    ? calculatePediatricDose(drug.dosing.pediatric, weightNum)
    : null;

  const perDoseMg = pedDose ? extractPerDoseMg(pedDose) : null;
  const formSuggestions = (perDoseMg && drug) ? suggestForm(perDoseMg, drug.forms) : [];

  // Renal status
  let renalStatus: { label: string; color: string } | null = null;
  if (crcl !== null) {
    if (crcl >= 60) renalStatus = { label: "Normal renal function", color: "#16a34a" };
    else if (crcl >= 30) renalStatus = { label: "Moderate impairment (CKD 3)", color: "#d97706" };
    else if (crcl >= 15) renalStatus = { label: "Severe impairment (CKD 4)", color: "#dc2626" };
    else renalStatus = { label: "Kidney failure (CKD 5)", color: "#991b1b" };
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", display: "flex" }}>
      <div className="sidebar-collapse" style={{ width: 240, minWidth: 240, minHeight: "100vh" }}>
        <SidebarNav />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Hero header */}
        <div className="hero-section" style={{ padding: "0 32px" }}>
          <div style={{ position: "relative", zIndex: 1, padding: "24px 0 20px" }}>
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
                marginBottom: 14,
              }}
            >
              Home
            </button>
            <h1 style={{
              margin: 0, fontSize: 32, fontFamily: "var(--font-display)",
              fontStyle: "italic", color: "#fff", letterSpacing: -0.6,
            }}>
              Drug Dose Calculator
            </h1>
            <p style={{ color: "rgba(255,255,255,0.5)", marginTop: 6, fontSize: 14 }}>
              Search a drug, enter patient details, get calculated doses instantly.
            </p>
          </div>
        </div>

        <div style={{ padding: "24px 32px 80px", maxWidth: 900 }}>

          {/* ── Drug Search ─────────────────────────────────── */}
          <div ref={containerRef} style={{ position: "relative", marginTop: 16 }}>
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setActiveIdx(-1); }}
              onKeyDown={handleKeyDown}
              onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
              placeholder="Search drug by name or brand (e.g., amoxicillin, Dolo, Augmentin)..."
              autoComplete="off"
              style={{
                width: "100%", padding: "14px 18px", borderRadius: 14,
                border: "1px solid var(--border)", background: "var(--surface)",
                color: "var(--ink)", fontSize: 16, fontWeight: 600,
                boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
              }}
            />
            {showDropdown && suggestions.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 12, boxShadow: "0 12px 32px rgba(15,23,42,0.14)",
                zIndex: 1000, maxHeight: 320, overflowY: "auto",
              }}>
                {suggestions.map((s, i) => (
                  <div
                    key={`${s.canonical}-${i}`}
                    onClick={() => handleSelectDrug(s)}
                    onMouseEnter={() => setActiveIdx(i)}
                    style={{
                      padding: "12px 16px", cursor: "pointer",
                      background: i === activeIdx ? "var(--surface-2)" : "transparent",
                      borderBottom: i < suggestions.length - 1 ? "1px solid var(--border)" : "none",
                    }}
                  >
                    <div style={{ fontWeight: 700, color: "var(--ink)" }}>{s.display}</div>
                    {s.type && (
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                        {s.type === "brand" ? "Brand name" : "Generic"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {loading && <div style={{ marginTop: 16, color: "var(--muted)" }}>Loading drug data...</div>}
          {error && <div style={{ marginTop: 16, color: "#b91c1c", fontWeight: 600 }}>{error}</div>}

          {drug && (
            <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
              {/* ── Drug Header ────────────────────────────── */}
              <div style={{
                background: "var(--surface)", borderRadius: 16, padding: 18,
                border: "1px solid var(--border)", boxShadow: "0 12px 32px rgba(15,23,42,0.06)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: "var(--ink)" }}>
                      {drug.generic_name}
                      {drug.nlem && (
                        <span style={{
                          marginLeft: 10, fontSize: 11, fontWeight: 700,
                          background: "rgba(14,165,164,0.12)", color: "#0ea5a4",
                          padding: "2px 8px", borderRadius: 6, verticalAlign: "middle",
                        }}>NLEM 2022</span>
                      )}
                    </div>
                    <div style={{ color: "var(--muted)", fontWeight: 600, marginTop: 4 }}>{drug.drug_class}</div>
                    {drug.brands_india.length > 0 && (
                      <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                        Brands: {drug.brands_india.slice(0, 5).join(", ")}
                      </div>
                    )}
                  </div>
                </div>

                {/* Available Forms */}
                {drug.forms.length > 0 && (
                  <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {drug.forms.map((f, i) => (
                      <span key={i} style={{
                        padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: "rgba(59,130,246,0.08)", color: "#2563eb",
                        border: "1px solid rgba(59,130,246,0.2)",
                      }}>{f}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Patient Parameters ─────────────────────── */}
              <div style={{
                background: "var(--surface)", borderRadius: 16, padding: 18,
                border: "1px solid var(--border)",
              }}>
                <div style={{ fontWeight: 800, color: "var(--ink)", marginBottom: 12 }}>Patient Parameters</div>

                {/* Adult / Pediatric Toggle */}
                <div style={{ display: "flex", gap: 0, marginBottom: 16, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)", width: "fit-content" }}>
                  {(["adult", "pediatric"] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      style={{
                        padding: "8px 20px", border: "none", cursor: "pointer",
                        fontWeight: 700, fontSize: 13, textTransform: "capitalize",
                        background: mode === m
                          ? (m === "adult" ? "linear-gradient(135deg, #0ea5a4, #0d9488)" : "linear-gradient(135deg, #7c3aed, #6d28d9)")
                          : "var(--surface-2)",
                        color: mode === m ? "#fff" : "var(--muted)",
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: mode === "pediatric" ? "1.5fr 1fr 1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 12 }}>
                  {/* Weight - prominent for pediatric */}
                  <div>
                    <label style={labelStyle}>Weight (kg) {mode === "pediatric" && <span style={{ color: "#7c3aed" }}>*</span>}</label>
                    <input
                      type="number"
                      value={weight}
                      onChange={e => setWeight(e.target.value)}
                      placeholder={mode === "pediatric" ? "e.g., 12" : "e.g., 70"}
                      style={{
                        ...inputStyle,
                        ...(mode === "pediatric" ? { borderColor: "#7c3aed", boxShadow: "0 0 0 2px rgba(124,58,237,0.1)" } : {}),
                      }}
                    />
                  </div>

                  {/* Age */}
                  <div>
                    <label style={labelStyle}>Age (years)</label>
                    <input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="e.g., 45" style={inputStyle} />
                  </div>

                  {/* Sex */}
                  <div>
                    <label style={labelStyle}>Sex</label>
                    <select value={sex} onChange={e => setSex(e.target.value as "male" | "female")} style={{ ...inputStyle, cursor: "pointer" }}>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>

                  {/* Creatinine */}
                  <div>
                    <label style={labelStyle}>Serum Creatinine (mg/dL)</label>
                    <input type="number" step="0.1" value={creatinine} onChange={e => setCreatinine(e.target.value)} placeholder="e.g., 1.2" style={inputStyle} />
                  </div>
                </div>

                {/* CrCl result */}
                {crcl !== null && (
                  <div style={{
                    marginTop: 12, padding: "10px 14px", borderRadius: 10,
                    background: "rgba(59,130,246,0.06)", borderLeft: `3px solid ${renalStatus?.color || "#3b82f6"}`,
                  }}>
                    <span style={{ fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", fontSize: 16 }}>
                      CrCl: {crcl.toFixed(1)} mL/min
                    </span>
                    <span style={{ marginLeft: 10, fontSize: 13, color: renalStatus?.color, fontWeight: 700 }}>
                      {renalStatus?.label}
                    </span>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Cockcroft-Gault formula</div>
                  </div>
                )}
              </div>

              {/* ── Dose Results ────────────────────────────── */}
              <div style={{ display: "grid", gap: 12 }}>
                {/* Adult Dose Card */}
                <DoseCard
                  title="Adult Dose"
                  color="#16a34a"
                  highlighted={mode === "adult"}
                  content={drug.dosing.adult || "Not available"}
                />

                {/* Pediatric Dose Card */}
                <div style={{
                  background: "var(--surface)", borderRadius: 16, padding: 16,
                  border: "1px solid var(--border)",
                  borderLeft: `4px solid ${mode === "pediatric" ? "#7c3aed" : "var(--border)"}`,
                  opacity: mode === "pediatric" ? 1 : 0.7,
                }}>
                  <div style={{ fontWeight: 800, color: "#7c3aed", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Pediatric Dose
                  </div>
                  <div style={{ marginTop: 6, color: "var(--ink)", fontWeight: 600 }}>
                    {drug.dosing.pediatric || "Not available"}
                  </div>

                  {/* Calculated pediatric dose */}
                  {pedDose && !pedDose.text && (
                    <div style={{
                      marginTop: 10, padding: 12, borderRadius: 10,
                      background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.15)",
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", marginBottom: 6 }}>
                        Calculated for {weight} kg
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                        {(pedDose.daily_range || pedDose.daily) && (
                          <div>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>Total Daily</div>
                            <div style={{ fontWeight: 900, fontSize: 18, fontFamily: "'JetBrains Mono', monospace", color: "#7c3aed" }}>
                              {pedDose.daily_range || pedDose.daily}
                            </div>
                          </div>
                        )}
                        {(pedDose.per_dose_range || pedDose.per_dose) && (
                          <div>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>Per Dose</div>
                            <div style={{ fontWeight: 900, fontSize: 18, fontFamily: "'JetBrains Mono', monospace", color: "#7c3aed" }}>
                              {pedDose.per_dose_range || pedDose.per_dose}
                            </div>
                          </div>
                        )}
                        {pedDose.frequency && (
                          <div>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>Frequency</div>
                            <div style={{ fontWeight: 900, fontSize: 18, fontFamily: "'JetBrains Mono', monospace", color: "#7c3aed" }}>
                              {pedDose.frequency}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Form suggestions */}
                      {formSuggestions.length > 0 && (
                        <div style={{
                          marginTop: 10, padding: 10, borderRadius: 8,
                          background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.12)",
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", textTransform: "uppercase", marginBottom: 4 }}>
                            Suggested Formulation
                          </div>
                          {formSuggestions.map((fs, i) => (
                            <div key={i} style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginTop: 2 }}>
                              {fs}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Renal Adjustment Card */}
                {(drug.dosing.renal || crcl !== null) && (
                  <DoseCard
                    title="Renal Dose Adjustment"
                    color={crcl !== null && crcl < 30 ? "#dc2626" : "#3b82f6"}
                    highlighted={crcl !== null}
                    content={drug.dosing.renal || "No specific renal adjustment listed"}
                    extra={crcl !== null ? `Patient CrCl: ${crcl.toFixed(1)} mL/min` : undefined}
                  />
                )}

                {/* Hepatic */}
                {drug.dosing.hepatic && (
                  <DoseCard title="Hepatic Adjustment" color="#d97706" highlighted={false} content={drug.dosing.hepatic} />
                )}
              </div>

              {/* ── Warnings Section ───────────────────────── */}
              <div style={{
                background: "rgba(245,158,11,0.06)", borderRadius: 16, padding: 16,
                border: "1px solid rgba(245,158,11,0.2)", borderLeft: "4px solid #f59e0b",
              }}>
                <div style={{ fontWeight: 800, color: "#b45309", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Warnings & Safety
                </div>

                {/* Quick flags */}
                {drug.quick_flags.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {drug.quick_flags.map((f, i) => (
                      <span key={i} style={{
                        padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                        background: "rgba(234,88,12,0.08)", color: "#b45309",
                        border: "1px solid rgba(234,88,12,0.2)",
                      }}>{f}</span>
                    ))}
                  </div>
                )}

                {/* Contraindications */}
                {drug.contraindications.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", marginBottom: 4 }}>Contraindications</div>
                    <ul style={{ margin: 0, paddingLeft: 18, color: "var(--ink)", fontSize: 13 }}>
                      {drug.contraindications.map((c, i) => <li key={i} style={{ marginBottom: 2 }}>{c}</li>)}
                    </ul>
                  </div>
                )}

                {/* Pregnancy */}
                {drug.pregnancy_lactation && (
                  <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(234,88,12,0.06)" }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: "#b45309" }}>Pregnancy/Lactation: </span>
                    <span style={{ fontSize: 13, color: "var(--ink)" }}>{drug.pregnancy_lactation}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!drug && !loading && (
            <div style={{ marginTop: 40, padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>💊</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Search for a drug to calculate doses</div>
              <div style={{ marginTop: 8, maxWidth: 400, margin: "8px auto 0", fontSize: 14 }}>
                Enter a generic name (amoxicillin) or Indian brand (Mox, Dolo, Augmentin) to get adult, pediatric, and renal-adjusted dosing.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Reusable Dose Card ───────────────────────────────────────────

function DoseCard({ title, color, highlighted, content, extra }: {
  title: string; color: string; highlighted: boolean; content: string; extra?: string;
}) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12, padding: 16,
      border: "1px solid var(--border)", borderLeft: `4px solid ${highlighted ? color : "var(--border)"}`,
      opacity: highlighted ? 1 : 0.7,
    }}>
      <div style={{ fontWeight: 700, color, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {title}
      </div>
      <div style={{
        marginTop: 6, color: "var(--text-primary)", fontWeight: 700,
        fontSize: 16, fontFamily: "var(--font-mono)",
      }}>
        {content}
      </div>
      {extra && (
        <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{extra}</div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)",
  marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.3,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1px solid var(--border)", background: "var(--surface-2)",
  color: "var(--ink)", fontSize: 14, fontWeight: 600,
};
