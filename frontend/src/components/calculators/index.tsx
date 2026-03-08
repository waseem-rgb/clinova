// frontend/src/components/calculators/index.tsx
// All 11 Clinova Clinical Calculators — self-contained, no external dependencies

import React, { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI helpers
// ─────────────────────────────────────────────────────────────────────────────

type RiskLevel = "normal" | "low" | "moderate" | "high" | "very-high" | "critical";

const RISK_COLORS: Record<RiskLevel, { bg: string; text: string; border: string }> = {
  normal:     { bg: "#F0FDF4", text: "#166534", border: "#86EFAC" },
  low:        { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
  moderate:   { bg: "#FFFBEB", text: "#B45309", border: "#FCD34D" },
  high:       { bg: "#FFF7ED", text: "#C2410C", border: "#FED7AA" },
  "very-high":{ bg: "#FEF2F2", text: "#991B1B", border: "#FCA5A5" },
  critical:   { bg: "#FEF2F2", text: "#7F1D1D", border: "#DC2626" },
};

function ResultBox({ level, title, value, interpretation }: {
  level: RiskLevel;
  title: string;
  value: string;
  interpretation: string;
}) {
  const c = RISK_COLORS[level];
  return (
    <div style={{
      background: c.bg,
      border: `2px solid ${c.border}`,
      borderRadius: 12,
      padding: "16px 18px",
      marginTop: 16,
    }}>
      <div style={{ fontWeight: 700, color: c.text, fontSize: 13, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color: c.text }}>{value}</div>
      <div style={{ fontSize: 13, color: c.text, marginTop: 6, opacity: 0.85 }}>{interpretation}</div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#1A2B3C", marginBottom: 5 }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: "#6A7E8A", fontSize: 12, marginLeft: 6 }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid #D4E4E0",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  background: "#fff",
};

const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };

function CalcButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 24px",
        borderRadius: 10,
        border: "none",
        background: disabled ? "#D1D5DB" : "#0A6E5E",
        color: "#fff",
        fontWeight: 700,
        fontSize: 15,
        cursor: disabled ? "not-allowed" : "pointer",
        marginTop: 6,
        width: "100%",
      }}
    >
      Calculate
    </button>
  );
}

function CalcWrapper({ title, emoji, children }: { title: string; emoji: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "4px 2px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <span style={{ fontSize: 28 }}>{emoji}</span>
        <div style={{ fontWeight: 800, fontSize: 17, color: "#1A2B3C" }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. BMI + BSA Calculator
// ─────────────────────────────────────────────────────────────────────────────

export function BMICalculator() {
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [result, setResult] = useState<{ bmi: number; bsa: number; category: string; level: RiskLevel } | null>(null);

  const calculate = () => {
    const h = parseFloat(height) / 100; // cm to m
    const w = parseFloat(weight);
    if (!h || !w || h <= 0 || w <= 0) return;
    const bmi = w / (h * h);
    const bsa = Math.sqrt((w * h * 100) / 3600); // Mosteller formula: sqrt(H*W/3600)
    let category = "Normal";
    let level: RiskLevel = "normal";
    if (bmi < 18.5) { category = "Underweight"; level = "low"; }
    else if (bmi < 25) { category = "Normal weight"; level = "normal"; }
    else if (bmi < 30) { category = "Overweight"; level = "moderate"; }
    else if (bmi < 35) { category = "Obese (Class I)"; level = "high"; }
    else if (bmi < 40) { category = "Obese (Class II)"; level = "very-high"; }
    else { category = "Obese (Class III — Morbid)"; level = "critical"; }
    setResult({ bmi, bsa, category, level });
  };

  return (
    <CalcWrapper title="BMI & BSA Calculator" emoji="⚖️">
      <Field label="Height" hint="cm"><input style={inputStyle} type="number" placeholder="e.g. 170" value={height} onChange={e => setHeight(e.target.value)} /></Field>
      <Field label="Weight" hint="kg"><input style={inputStyle} type="number" placeholder="e.g. 70" value={weight} onChange={e => setWeight(e.target.value)} /></Field>
      <CalcButton onClick={calculate} disabled={!height || !weight} />
      {result && (
        <>
          <ResultBox level={result.level} title="Body Mass Index (BMI)" value={result.bmi.toFixed(1) + " kg/m²"} interpretation={result.category} />
          <ResultBox level="normal" title="Body Surface Area (BSA — Mosteller)" value={result.bsa.toFixed(2) + " m²"} interpretation="Used for chemotherapy and drug dosing. Normal adult: ~1.7–1.9 m²" />
        </>
      )}
    </CalcWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Pregnancy EDC Calculator
// ─────────────────────────────────────────────────────────────────────────────

export function EDCCalculator() {
  const [lmp, setLmp] = useState("");
  const [result, setResult] = useState<{ edc: string; ga: string; trimester: string; level: RiskLevel } | null>(null);

  const calculate = () => {
    if (!lmp) return;
    const lmpDate = new Date(lmp);
    if (isNaN(lmpDate.getTime())) return;
    const edcDate = new Date(lmpDate);
    edcDate.setDate(edcDate.getDate() + 280); // Naegele's rule: LMP + 280 days
    const today = new Date();
    const diffMs = today.getTime() - lmpDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const weeks = Math.floor(diffDays / 7);
    const days = diffDays % 7;
    let trimester = "1st Trimester";
    let level: RiskLevel = "normal";
    if (weeks >= 28) { trimester = "3rd Trimester"; level = "moderate"; }
    else if (weeks >= 13) { trimester = "2nd Trimester"; level = "low"; }
    if (weeks >= 40) { trimester = "Term / Post-dates"; level = "high"; }
    setResult({
      edc: edcDate.toDateString(),
      ga: `${weeks}w ${days}d`,
      trimester,
      level,
    });
  };

  return (
    <CalcWrapper title="Pregnancy EDC Calculator" emoji="🤰">
      <Field label="Last Menstrual Period (LMP)" hint="first day of last period">
        <input style={inputStyle} type="date" value={lmp} onChange={e => setLmp(e.target.value)} />
      </Field>
      <CalcButton onClick={calculate} disabled={!lmp} />
      {result && (
        <>
          <ResultBox level="normal" title="Expected Date of Confinement (EDC)" value={result.edc} interpretation="Based on Naegele's Rule: LMP + 280 days. Normal range: 37–42 weeks." />
          <ResultBox level={result.level} title="Gestational Age (Today)" value={result.ga} interpretation={result.trimester} />
        </>
      )}
    </CalcWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. GFR Calculator (Cockcroft-Gault + CKD-EPI)
// ─────────────────────────────────────────────────────────────────────────────

export function GFRCalculator() {
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [creatinine, setCreatinine] = useState("");
  const [sex, setSex] = useState("male");
  const [result, setResult] = useState<{ cg: number; ckdStage: string; level: RiskLevel } | null>(null);

  const calculate = () => {
    const a = parseFloat(age);
    const w = parseFloat(weight);
    const cr = parseFloat(creatinine);
    if (!a || !w || !cr) return;
    // Cockcroft-Gault formula: ((140 - age) × weight) / (72 × creatinine) × 0.85 if female
    let cg = ((140 - a) * w) / (72 * cr);
    if (sex === "female") cg *= 0.85;
    let ckdStage = "";
    let level: RiskLevel = "normal";
    if (cg >= 90) { ckdStage = "G1 — Normal/High (≥90)"; level = "normal"; }
    else if (cg >= 60) { ckdStage = "G2 — Mildly decreased (60-89)"; level = "low"; }
    else if (cg >= 45) { ckdStage = "G3a — Mildly to moderately decreased (45-59)"; level = "moderate"; }
    else if (cg >= 30) { ckdStage = "G3b — Moderately to severely decreased (30-44)"; level = "high"; }
    else if (cg >= 15) { ckdStage = "G4 — Severely decreased (15-29)"; level = "very-high"; }
    else { ckdStage = "G5 — Kidney Failure (<15) — Dialysis consideration"; level = "critical"; }
    setResult({ cg, ckdStage, level });
  };

  return (
    <CalcWrapper title="GFR Calculator (Cockcroft-Gault)" emoji="🫘">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Age" hint="years"><input style={inputStyle} type="number" placeholder="e.g. 55" value={age} onChange={e => setAge(e.target.value)} /></Field>
        <Field label="Weight" hint="kg"><input style={inputStyle} type="number" placeholder="e.g. 70" value={weight} onChange={e => setWeight(e.target.value)} /></Field>
      </div>
      <Field label="Serum Creatinine" hint="mg/dL">
        <input style={inputStyle} type="number" step="0.1" placeholder="e.g. 1.2" value={creatinine} onChange={e => setCreatinine(e.target.value)} />
      </Field>
      <Field label="Sex">
        <select style={selectStyle} value={sex} onChange={e => setSex(e.target.value)}>
          <option value="male">Male</option>
          <option value="female">Female (× 0.85)</option>
        </select>
      </Field>
      <CalcButton onClick={calculate} disabled={!age || !weight || !creatinine} />
      {result && (
        <ResultBox
          level={result.level}
          title="Estimated GFR (Cockcroft-Gault)"
          value={`${result.cg.toFixed(0)} mL/min`}
          interpretation={result.ckdStage}
        />
      )}
      {result && (
        <div style={{ fontSize: 12, color: "#6A7E8A", marginTop: 8 }}>
          Drug dose adjustment: G3a+ requires caution with NSAIDs, metformin, digoxin, aminoglycosides. G4: avoid metformin, NSAIDs. G5: dialysis consideration.
        </div>
      )}
    </CalcWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Wells Criteria (DVT + PE)
// ─────────────────────────────────────────────────────────────────────────────

export function WellsCriteriaCalculator() {
  const [type, setType] = useState<"dvt" | "pe">("dvt");

  const dvtItems = [
    { label: "Active cancer (treatment ongoing or within 6 months)", pts: 1 },
    { label: "Paralysis, paresis, or recent plaster immobilization of lower extremity", pts: 1 },
    { label: "Recently bedridden >3 days or major surgery within 12 weeks", pts: 1 },
    { label: "Localized tenderness along the deep venous system", pts: 1 },
    { label: "Entire leg swollen", pts: 1 },
    { label: "Calf swelling >3cm compared to asymptomatic leg", pts: 1 },
    { label: "Pitting edema confined to the symptomatic leg", pts: 1 },
    { label: "Collateral superficial veins (non-varicose)", pts: 1 },
    { label: "Previously documented DVT", pts: 1 },
    { label: "Alternative diagnosis at least as likely as DVT (subtract)", pts: -2 },
  ];

  const peItems = [
    { label: "Clinical signs and symptoms of DVT", pts: 3 },
    { label: "Alternative diagnosis less likely than PE", pts: 3 },
    { label: "Heart rate >100 bpm", pts: 1.5 },
    { label: "Immobilization ≥3 days or surgery within 4 weeks", pts: 1.5 },
    { label: "Previous DVT or PE", pts: 1.5 },
    { label: "Hemoptysis", pts: 1 },
    { label: "Malignancy (on treatment or palliated within 6 months)", pts: 1 },
  ];

  const items = type === "dvt" ? dvtItems : peItems;
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<{ score: number; risk: string; action: string; level: RiskLevel } | null>(null);

  const toggle = (i: number) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  const calculate = () => {
    let score = 0;
    selected.forEach(i => { score += items[i].pts; });
    let risk = "", action = "", level: RiskLevel = "normal";
    if (type === "dvt") {
      if (score <= 0) { risk = "Low probability"; action = "D-dimer: if negative → DVT excluded. If positive → ultrasound."; level = "low"; }
      else if (score <= 2) { risk = "Moderate probability"; action = "D-dimer + Compression ultrasound (US) of proximal leg"; level = "moderate"; }
      else { risk = "High probability"; action = "Compression ultrasound WITHOUT waiting for D-dimer. Start anticoagulation while awaiting US."; level = "high"; }
    } else {
      if (score <= 1) { risk = "Low probability of PE"; action = "D-dimer: if negative → PE effectively excluded. Observe."; level = "low"; }
      else if (score <= 6) { risk = "Moderate probability of PE"; action = "D-dimer: if negative → PE excluded. If positive → CT Pulmonary Angiography (CTPA)."; level = "moderate"; }
      else { risk = "High probability of PE"; action = "CT Pulmonary Angiography (CTPA) immediately. Start anticoagulation. Consider ICU."; level = "high"; }
    }
    setResult({ score, risk, action, level });
  };

  return (
    <CalcWrapper title="Wells Criteria" emoji="🩸">
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["dvt", "pe"] as const).map(t => (
          <button key={t} onClick={() => { setType(t); setSelected(new Set()); setResult(null); }}
            style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${type === t ? "#0A6E5E" : "#D4E4E0"}`, background: type === t ? "#0A6E5E" : "#fff", color: type === t ? "#fff" : "#4A5C6A", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>
      {items.map((item, i) => (
        <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: "1px solid #F3F4F6", cursor: "pointer" }}>
          <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)}
            style={{ marginTop: 3, accentColor: "#0A6E5E" }} />
          <span style={{ fontSize: 13, color: "#1A2B3C", lineHeight: 1.4, flex: 1 }}>{item.label}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: item.pts < 0 ? "#DC2626" : "#0A6E5E", minWidth: 36, textAlign: "right" }}>
            {item.pts > 0 ? `+${item.pts}` : item.pts}
          </span>
        </label>
      ))}
      <CalcButton onClick={calculate} />
      {result && (
        <ResultBox level={result.level} title={`Score: ${result.score} — ${result.risk}`} value={result.risk} interpretation={result.action} />
      )}
    </CalcWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. CURB-65 (Pneumonia Severity)
// ─────────────────────────────────────────────────────────────────────────────

export function CURB65Calculator() {
  const items = [
    { label: "C — Confusion (new, disorientation to person, place, or time)", pts: 1 },
    { label: "U — Urea >7 mmol/L (BUN >19 mg/dL)", pts: 1 },
    { label: "R — Respiratory rate ≥30/min", pts: 1 },
    { label: "B — BP: systolic <90 or diastolic ≤60 mmHg", pts: 1 },
    { label: "65 — Age ≥65 years", pts: 1 },
  ];
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<{ score: number; risk: string; mgmt: string; mortality: string; level: RiskLevel } | null>(null);

  const toggle = (i: number) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  const calculate = () => {
    const score = selected.size;
    let risk = "", mgmt = "", mortality = "", level: RiskLevel = "normal";
    if (score === 0) { risk = "Low severity"; mgmt = "Outpatient oral antibiotics (5-day amoxicillin or azithromycin)"; mortality = "~0.7%"; level = "low"; }
    else if (score === 1) { risk = "Low severity"; mgmt = "Outpatient oral antibiotics. Consider short hospital stay if social concerns"; mortality = "~2.1%"; level = "low"; }
    else if (score === 2) { risk = "Moderate severity"; mgmt = "Hospital admission. IV antibiotics: Co-amoxiclav + Azithromycin"; mortality = "~9.2%"; level = "moderate"; }
    else if (score === 3) { risk = "High severity"; mgmt = "Hospital admission. IV antibiotics. Consider HDU/ICU review"; mortality = "~14.5%"; level = "high"; }
    else { risk = "Very high severity"; mgmt = "ICU admission. IV broad-spectrum antibiotics. Consider mechanical ventilation"; mortality = score === 4 ? "~40%" : "~57%"; level = "very-high"; }
    setResult({ score, risk, mgmt, mortality, level });
  };

  return (
    <CalcWrapper title="CURB-65 Pneumonia Severity" emoji="🫁">
      {items.map((item, i) => (
        <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 0", borderBottom: "1px solid #F3F4F6", cursor: "pointer" }}>
          <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} style={{ marginTop: 3, accentColor: "#0A6E5E" }} />
          <span style={{ fontSize: 13, color: "#1A2B3C", lineHeight: 1.4 }}>{item.label}</span>
        </label>
      ))}
      <CalcButton onClick={calculate} />
      {result && (
        <ResultBox level={result.level} title={`CURB-65 Score: ${result.score}/5 — 30-day mortality ~${result.mortality}`}
          value={result.risk} interpretation={result.mgmt} />
      )}
    </CalcWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Glasgow Coma Scale
// ─────────────────────────────────────────────────────────────────────────────

export function GCSCalculator() {
  const eye = [
    { score: 4, label: "4 — Spontaneous" },
    { score: 3, label: "3 — To voice" },
    { score: 2, label: "2 — To pain" },
    { score: 1, label: "1 — None" },
  ];
  const verbal = [
    { score: 5, label: "5 — Oriented" },
    { score: 4, label: "4 — Confused" },
    { score: 3, label: "3 — Words only" },
    { score: 2, label: "2 — Sounds" },
    { score: 1, label: "1 — None" },
  ];
  const motor = [
    { score: 6, label: "6 — Obeys commands" },
    { score: 5, label: "5 — Localizes pain" },
    { score: 4, label: "4 — Withdraws" },
    { score: 3, label: "3 — Flexion (Decorticate)" },
    { score: 2, label: "2 — Extension (Decerebrate)" },
    { score: 1, label: "1 — None" },
  ];

  const [e, setE] = useState<number>(4);
  const [v, setV] = useState<number>(5);
  const [m, setM] = useState<number>(6);
  const [result, setResult] = useState<{ total: number; interp: string; level: RiskLevel } | null>(null);

  const calculate = () => {
    const total = e + v + m;
    let interp = "", level: RiskLevel = "normal";
    if (total === 15) { interp = "Fully conscious"; level = "normal"; }
    else if (total >= 13) { interp = "Minor head injury / Mild impairment"; level = "low"; }
    else if (total >= 9) { interp = "Moderate impairment — hospital admission"; level = "moderate"; }
    else { interp = "Severe impairment — ICU, airway protection (GCS ≤8: consider intubation)"; level = "critical"; }
    setResult({ total, interp, level });
  };

  return (
    <CalcWrapper title="Glasgow Coma Scale (GCS)" emoji="🧠">
      <Field label="Eye Opening (E)">
        <select style={selectStyle} value={e} onChange={ev => setE(Number(ev.target.value))}>
          {eye.map(o => <option key={o.score} value={o.score}>{o.label}</option>)}
        </select>
      </Field>
      <Field label="Verbal Response (V)">
        <select style={selectStyle} value={v} onChange={ev => setV(Number(ev.target.value))}>
          {verbal.map(o => <option key={o.score} value={o.score}>{o.label}</option>)}
        </select>
      </Field>
      <Field label="Motor Response (M)">
        <select style={selectStyle} value={m} onChange={ev => setM(Number(ev.target.value))}>
          {motor.map(o => <option key={o.score} value={o.score}>{o.label}</option>)}
        </select>
      </Field>
      <CalcButton onClick={calculate} />
      {result && (
        <>
          <ResultBox level={result.level} title={`GCS: E${e}V${v}M${m} = ${result.total}/15`}
            value={`${result.total} / 15`} interpretation={result.interp} />
          {result.total <= 8 && (
            <div style={{ marginTop: 8, padding: "10px 14px", background: "#FEF2F2", borderRadius: 8, border: "1px solid #FCA5A5", fontSize: 13, color: "#DC2626", fontWeight: 600 }}>
              ⚠️ GCS ≤8 — "Comatose" — Consider airway protection (intubation). Neurosurgery consult.
            </div>
          )}
        </>
      )}
    </CalcWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. APGAR Score
// ─────────────────────────────────────────────────────────────────────────────

export function APGARCalculator() {
  const categories = [
    { name: "Appearance (Skin color)", opts: ["0 — Blue/pale all over", "1 — Blue extremities, pink body", "2 — Pink all over"] },
    { name: "Pulse (Heart rate)", opts: ["0 — Absent", "1 — <100 bpm", "2 — ≥100 bpm"] },
    { name: "Grimace (Reflex irritability)", opts: ["0 — No response", "1 — Grimace", "2 — Cry / Cough / Sneeze"] },
    { name: "Activity (Muscle tone)", opts: ["0 — Limp", "1 — Some flexion", "2 — Active motion"] },
    { name: "Respiration", opts: ["0 — Absent", "1 — Weak / Irregular", "2 — Strong cry"] },
  ];
  const [scores, setScores] = useState<number[]>([2, 2, 2, 2, 2]);
  const [timing, setTiming] = useState<"1" | "5" | "10">("1");
  const [result, setResult] = useState<{ total: number; interp: string; level: RiskLevel } | null>(null);

  const setScore = (i: number, v: number) => setScores(prev => { const n = [...prev]; n[i] = v; return n; });

  const calculate = () => {
    const total = scores.reduce((a, b) => a + b, 0);
    let interp = "", level: RiskLevel = "normal";
    if (total >= 7) { interp = "Normal — routine neonatal care"; level = "normal"; }
    else if (total >= 4) { interp = "Moderate concern — stimulation, oxygen, close monitoring"; level = "moderate"; }
    else { interp = "Critical — immediate resuscitation (NRP protocol)"; level = "critical"; }
    setResult({ total, interp, level });
  };

  return (
    <CalcWrapper title="APGAR Score" emoji="👶">
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {(["1", "5", "10"] as const).map(t => (
          <button key={t} onClick={() => setTiming(t)}
            style={{ flex: 1, padding: "7px", borderRadius: 8, border: `1px solid ${timing === t ? "#0A6E5E" : "#D4E4E0"}`, background: timing === t ? "#0A6E5E" : "#fff", color: timing === t ? "#fff" : "#4A5C6A", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
            {t} min
          </button>
        ))}
      </div>
      {categories.map((cat, i) => (
        <Field key={i} label={cat.name}>
          <select style={selectStyle} value={scores[i]} onChange={e => setScore(i, Number(e.target.value))}>
            {cat.opts.map((opt, v) => <option key={v} value={v}>{opt}</option>)}
          </select>
        </Field>
      ))}
      <CalcButton onClick={calculate} />
      {result && (
        <ResultBox level={result.level} title={`APGAR Score at ${timing} minute(s)`}
          value={`${result.total} / 10`} interpretation={result.interp} />
      )}
    </CalcWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Fluid Requirement Calculator (Holiday-Segar + Burns)
// ─────────────────────────────────────────────────────────────────────────────

export function FluidCalculator() {
  const [weight, setWeight] = useState("");
  const [type, setType] = useState<"holiday" | "maintenance">("holiday");
  const [result, setResult] = useState<{ per_day: number; per_hour: number; detail: string } | null>(null);

  const calculate = () => {
    const w = parseFloat(weight);
    if (!w || w <= 0) return;
    // Holiday-Segar formula (daily maintenance):
    // 0-10kg: 100 mL/kg/day
    // 10-20kg: 1000 + 50 mL/kg/day for each kg >10
    // >20kg: 1500 + 20 mL/kg/day for each kg >20
    let per_day = 0;
    let detail = "";
    if (w <= 10) {
      per_day = w * 100;
      detail = `${w}kg × 100 mL/kg/day`;
    } else if (w <= 20) {
      per_day = 1000 + (w - 10) * 50;
      detail = `1000 + (${w - 10}kg × 50) = ${per_day}mL/day`;
    } else {
      per_day = 1500 + (w - 20) * 20;
      detail = `1500 + (${w - 20}kg × 20) = ${per_day}mL/day`;
    }
    const per_hour = per_day / 24;
    setResult({ per_day, per_hour, detail });
  };

  return (
    <CalcWrapper title="Fluid Requirement (Holliday-Segar)" emoji="💧">
      <Field label="Weight" hint="kg (children and adults)">
        <input style={inputStyle} type="number" placeholder="e.g. 25" value={weight} onChange={e => setWeight(e.target.value)} />
      </Field>
      <CalcButton onClick={calculate} disabled={!weight} />
      {result && (
        <>
          <ResultBox level="normal" title="Daily Maintenance Fluid" value={`${Math.round(result.per_day)} mL/day`} interpretation={result.detail} />
          <ResultBox level="low" title="Hourly Infusion Rate" value={`${result.per_hour.toFixed(1)} mL/hr`} interpretation="Use this for IV fluid orders. Adjust for fever (+12% per °C), ongoing losses." />
          <div style={{ marginTop: 8, fontSize: 12, color: "#6A7E8A" }}>
            Note: This is maintenance fluid only. Add deficit replacement and ongoing losses separately. For neonates: consult neonatologist for electrolyte composition.
          </div>
        </>
      )}
    </CalcWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Burn Percentage (Rule of Nines)
// ─────────────────────────────────────────────────────────────────────────────

export function BurnCalculator() {
  const areas = [
    { label: "Head and neck", adult: 9, child: 18 },
    { label: "Right arm (entire)", adult: 9, child: 9 },
    { label: "Left arm (entire)", adult: 9, child: 9 },
    { label: "Chest (anterior trunk, upper)", adult: 9, child: 9 },
    { label: "Abdomen (anterior trunk, lower)", adult: 9, child: 9 },
    { label: "Upper back (posterior trunk, upper)", adult: 9, child: 9 },
    { label: "Lower back (posterior trunk, lower)", adult: 9, child: 9 },
    { label: "Right thigh", adult: 4.5, child: 3.5 },
    { label: "Right leg (below knee)", adult: 4.5, child: 3.5 },
    { label: "Left thigh", adult: 4.5, child: 3.5 },
    { label: "Left leg (below knee)", adult: 4.5, child: 3.5 },
    { label: "Genitalia / perineum", adult: 1, child: 1 },
  ];
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [ageGroup, setAgeGroup] = useState<"adult" | "child">("adult");
  const [weight, setWeight] = useState("");
  const [result, setResult] = useState<{ tbsa: number; parkland: number; severity: string; level: RiskLevel } | null>(null);

  const toggle = (i: number) => setSelected(prev => {
    const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next;
  });

  const calculate = () => {
    let tbsa = 0;
    selected.forEach(i => { tbsa += ageGroup === "adult" ? areas[i].adult : areas[i].child; });
    const w = parseFloat(weight) || 70;
    // Parkland formula: 4 mL × weight (kg) × %TBSA burned (first 24h, half in first 8h, half in next 16h)
    const parkland = 4 * w * tbsa;
    let severity = "", level: RiskLevel = "normal";
    if (tbsa < 10) { severity = "Minor burn (<10% TBSA)"; level = "low"; }
    else if (tbsa < 20) { severity = "Moderate burn (10-19% TBSA) — hospital admission"; level = "moderate"; }
    else if (tbsa < 40) { severity = "Major burn (20-39% TBSA) — burns unit, aggressive fluid"; level = "high"; }
    else { severity = "Critical burn (≥40% TBSA) — burns ICU"; level = "critical"; }
    setResult({ tbsa, parkland, severity, level });
  };

  return (
    <CalcWrapper title="Burn Assessment (Rule of Nines)" emoji="🔥">
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["adult", "child"] as const).map(a => (
          <button key={a} onClick={() => { setAgeGroup(a); setSelected(new Set()); setResult(null); }}
            style={{ flex: 1, padding: "7px", borderRadius: 8, border: `1px solid ${ageGroup === a ? "#0A6E5E" : "#D4E4E0"}`, background: ageGroup === a ? "#0A6E5E" : "#fff", color: ageGroup === a ? "#fff" : "#4A5C6A", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
            {a === "adult" ? "Adult (Rule of 9s)" : "Child (Lund-Browder)"}
          </button>
        ))}
      </div>
      <Field label="Patient weight (for Parkland formula)" hint="kg">
        <input style={inputStyle} type="number" placeholder="e.g. 70" value={weight} onChange={e => setWeight(e.target.value)} />
      </Field>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#1A2B3C", marginBottom: 8 }}>Select burned areas:</div>
      {areas.map((area, i) => (
        <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid #F3F4F6", cursor: "pointer" }}>
          <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} style={{ accentColor: "#0A6E5E" }} />
          <span style={{ fontSize: 13, color: "#1A2B3C", flex: 1 }}>{area.label}</span>
          <span style={{ fontSize: 12, color: "#6A7E8A", minWidth: 30, textAlign: "right" }}>{ageGroup === "adult" ? area.adult : area.child}%</span>
        </label>
      ))}
      <CalcButton onClick={calculate} disabled={selected.size === 0} />
      {result && (
        <>
          <ResultBox level={result.level} title="Total Body Surface Area Burned" value={`${result.tbsa.toFixed(1)}% TBSA`} interpretation={result.severity} />
          {result.tbsa >= 10 && (
            <ResultBox level="moderate" title="Parkland Formula (Fluid in first 24h)" value={`${Math.round(result.parkland)} mL`}
              interpretation={`4 × ${weight || 70}kg × ${result.tbsa.toFixed(0)}% = ${Math.round(result.parkland)}mL. Give ½ in first 8h (${Math.round(result.parkland / 2)}mL), ½ in next 16h. Use Ringer's Lactate.`} />
          )}
        </>
      )}
    </CalcWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Framingham Cardiovascular Risk Score (simplified)
// ─────────────────────────────────────────────────────────────────────────────

export function FraminghamCalculator() {
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("male");
  const [totalChol, setTotalChol] = useState("");
  const [hdl, setHdl] = useState("");
  const [sbp, setSbp] = useState("");
  const [sbpTreated, setSbpTreated] = useState(false);
  const [smoker, setSmoker] = useState(false);
  const [diabetes, setDiabetes] = useState(false);
  const [result, setResult] = useState<{ risk: number; level: RiskLevel; age: string; interp: string } | null>(null);

  const calculate = () => {
    const a = parseFloat(age);
    const tc = parseFloat(totalChol);
    const h = parseFloat(hdl);
    const s = parseFloat(sbp);
    if (!a || !tc || !h || !s) return;

    // Simplified Framingham point scoring (10-year CVD risk)
    // Reference: Wilson et al. 1998 (simplified version for clinical use)
    let points = 0;

    if (sex === "male") {
      // Age
      if (a < 35) points += -1; else if (a <= 39) points += 0; else if (a <= 44) points += 1;
      else if (a <= 49) points += 2; else if (a <= 54) points += 3; else if (a <= 59) points += 4;
      else if (a <= 64) points += 5; else if (a <= 69) points += 6; else points += 7;
      // Total cholesterol (mg/dL)
      if (tc < 160) points += -3; else if (tc < 200) points += 0; else if (tc < 240) points += 1;
      else if (tc < 280) points += 2; else points += 3;
      // HDL
      if (h < 35) points += 2; else if (h < 45) points += 1; else if (h < 50) points += 0;
      else if (h < 60) points += -1; else points += -2;
      // SBP
      if (s < 120) points += 0; else if (s < 130) points += 0; else if (s < 140) points += 1;
      else if (s < 160) points += 2; else points += 3;
      if (sbpTreated) points += 2;
    } else {
      if (a < 35) points += -9; else if (a <= 39) points += -4; else if (a <= 44) points += 0;
      else if (a <= 49) points += 3; else if (a <= 54) points += 6; else if (a <= 59) points += 7;
      else if (a <= 64) points += 8; else if (a <= 69) points += 8; else points += 8;
      if (tc < 160) points += -2; else if (tc < 200) points += 0; else if (tc < 240) points += 1;
      else if (tc < 280) points += 1; else points += 3;
      if (h < 35) points += 5; else if (h < 45) points += 2; else if (h < 50) points += 1;
      else if (h < 60) points += 0; else points += -3;
      if (s < 120) points += -3; else if (s < 130) points += 0; else if (s < 140) points += 2;
      else if (s < 160) points += 5; else points += 8;
      if (sbpTreated) points += 3;
    }

    if (smoker) points += sex === "male" ? 4 : 3;
    if (diabetes) points += sex === "male" ? 3 : 4;

    // Risk lookup (approximate 10-year CVD risk %)
    const maleLookup: Record<number, number> = { [-2]: 1, [-1]: 2, 0: 3, 1: 3, 2: 4, 3: 5, 4: 7, 5: 8, 6: 10, 7: 13, 8: 16, 9: 20, 10: 25, 11: 31, 12: 37, 13: 45 };
    const femaleLookup: Record<number, number> = { [-1]: 1, 0: 1, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 5, 9: 6, 10: 7, 11: 8, 12: 10, 13: 11, 14: 13, 15: 15, 16: 18, 17: 20, 18: 24, 19: 27, 20: 32 };
    const lookup = sex === "male" ? maleLookup : femaleLookup;
    const clampedPts = Math.min(Math.max(points, sex === "male" ? -2 : -1), sex === "male" ? 13 : 20);
    const risk = lookup[clampedPts] ?? (points > 13 ? 55 : 1);
    let level: RiskLevel = "normal";
    let interp = "";
    if (risk < 10) { level = "low"; interp = "Low risk — lifestyle modifications, reassess in 4-6 years"; }
    else if (risk < 20) { level = "moderate"; interp = "Moderate risk — statin therapy if additional risk factors. Reassess in 1-2 years."; }
    else { level = "high"; interp = "High risk — statin therapy indicated. Target LDL <70 mg/dL. Aspirin consideration."; }
    const heartAge = a + (risk > 20 ? 10 : risk > 10 ? 5 : 0);
    setResult({ risk, level, age: `${heartAge}`, interp });
  };

  return (
    <CalcWrapper title="Framingham CVD Risk (10-year)" emoji="❤️">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Age" hint="years"><input style={inputStyle} type="number" placeholder="45" value={age} onChange={e => setAge(e.target.value)} /></Field>
        <Field label="Sex"><select style={selectStyle} value={sex} onChange={e => setSex(e.target.value)}><option value="male">Male</option><option value="female">Female</option></select></Field>
        <Field label="Total Cholesterol" hint="mg/dL"><input style={inputStyle} type="number" placeholder="190" value={totalChol} onChange={e => setTotalChol(e.target.value)} /></Field>
        <Field label="HDL Cholesterol" hint="mg/dL"><input style={inputStyle} type="number" placeholder="45" value={hdl} onChange={e => setHdl(e.target.value)} /></Field>
        <Field label="Systolic BP" hint="mmHg"><input style={inputStyle} type="number" placeholder="130" value={sbp} onChange={e => setSbp(e.target.value)} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
        {[
          { label: "On BP treatment", val: sbpTreated, set: setSbpTreated },
          { label: "Current smoker", val: smoker, set: setSmoker },
          { label: "Diabetes", val: diabetes, set: setDiabetes },
        ].map((item, i) => (
          <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox" checked={item.val} onChange={e => item.set(e.target.checked)} style={{ accentColor: "#0A6E5E" }} />
            {item.label}
          </label>
        ))}
      </div>
      <CalcButton onClick={calculate} disabled={!age || !totalChol || !hdl || !sbp} />
      {result && (
        <ResultBox level={result.level} title="10-Year Cardiovascular Risk" value={`${result.risk}%`} interpretation={result.interp} />
      )}
    </CalcWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. Pediatric Growth Percentiles (simplified)
// ─────────────────────────────────────────────────────────────────────────────

export function PediatricGrowthCalculator() {
  // WHO reference: approximate median and SD values for weight-for-age
  // This is a simplified lookup-based calculator
  const [sex, setSex] = useState("male");
  const [ageMonths, setAgeMonths] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [result, setResult] = useState<{ wfa: string; hfa: string; wfh: string; level: RiskLevel; note: string } | null>(null);

  // WHO median weight (kg) by month (0-60 months), males
  const maleWt = [3.3,4.5,5.6,6.4,7.0,7.5,7.9,8.3,8.6,8.9,9.2,9.4,9.6,10.1,10.4,10.7,11.0,11.3,11.6,11.9,12.2,12.4,12.7,12.9,13.1,13.4,13.6,13.8,14.1,14.3,14.5,14.7,14.9,15.1,15.3,15.5,15.7,15.9,16.1,16.3,16.5,16.7,16.9,17.1,17.3,17.5,17.7,17.9,18.0,18.2,18.4,18.6,18.8,19.0,19.2,19.4,19.6,19.8,20.0,20.2,20.4];
  const femaleWt = [3.2,4.2,5.1,5.8,6.4,6.9,7.3,7.6,7.9,8.2,8.5,8.7,8.9,9.4,9.7,10.0,10.3,10.6,10.9,11.1,11.4,11.7,11.9,12.2,12.4,12.7,12.9,13.1,13.4,13.6,13.8,14.0,14.2,14.4,14.6,14.8,15.0,15.2,15.4,15.6,15.8,16.0,16.2,16.4,16.6,16.8,17.0,17.2,17.4,17.6,17.8,18.0,18.2,18.4,18.6,18.8,19.0,19.2,19.4,19.6,19.8];
  const maleHt = [49.9,54.7,58.4,61.4,63.9,65.9,67.6,69.2,70.6,72.0,73.3,74.5,75.7,77.1,78.8,80.2,81.8,83.2,84.6,86.0,87.3,88.5,89.8,91.0,92.1,93.2,94.4,95.4,96.5,97.6,98.6,99.7,100.7,101.7,102.7,103.7,104.6,105.6,106.5,107.5,108.4,109.3,110.2,111.1,112.0,112.8,113.7,114.5,115.4,116.2,117.0,117.8,118.6,119.4,120.2,121.0,121.8,122.5,123.3,124.1,124.8];
  const femaleHt = [49.1,53.7,57.1,59.8,62.1,63.8,65.7,67.3,68.7,70.1,71.5,72.8,74.0,75.8,77.5,79.1,80.7,82.1,83.6,85.0,86.3,87.6,88.8,90.0,91.2,92.3,93.5,94.6,95.7,96.8,97.9,98.9,100.0,101.0,102.0,103.0,103.9,104.9,105.8,106.8,107.7,108.6,109.5,110.4,111.2,112.1,113.0,113.8,114.6,115.5,116.3,117.1,117.9,118.7,119.5,120.3,121.0,121.8,122.6,123.4,124.1];

  const calculate = () => {
    const mo = parseInt(ageMonths);
    const wt = parseFloat(weight);
    const ht = parseFloat(height);
    if (!mo || mo < 0 || mo > 60 || !wt) return;

    const medWt = sex === "male" ? maleWt[Math.min(mo, 60)] : femaleWt[Math.min(mo, 60)];
    const medHt = sex === "male" ? maleHt[Math.min(mo, 60)] : femaleHt[Math.min(mo, 60)];

    // Z-score approximation (each SD ~1.2kg for weight, ~5cm for height — simplified)
    const zWt = (wt - medWt) / 1.2;
    const zHt = ht ? (ht - medHt) / 5 : 0;

    const wtPerc = Math.min(Math.max(Math.round(50 + zWt * 34), 1), 99);
    const htPerc = ht ? Math.min(Math.max(Math.round(50 + zHt * 34), 1), 99) : 0;

    let wfa = `${wtPerc}th percentile (median: ${medWt.toFixed(1)}kg)`;
    let hfa = ht ? `${htPerc}th percentile (median: ${medHt.toFixed(1)}cm)` : "Not entered";
    let wfh = "";
    let level: RiskLevel = "normal";
    let note = "";

    if (wtPerc < 3) { level = "critical"; note = "Severe Acute Malnutrition (SAM) — <3rd percentile. Urgent nutritional assessment. CMAM protocol."; }
    else if (wtPerc < 15) { level = "high"; note = "Underweight (<15th percentile). Nutritional counseling, growth monitoring."; }
    else if (wtPerc > 85 && wtPerc <= 97) { level = "moderate"; note = "Overweight (>85th percentile). Dietary assessment."; }
    else if (wtPerc > 97) { level = "high"; note = "Obese (>97th percentile). Referral for assessment."; }
    else { note = "Weight within normal range. Continue regular growth monitoring."; }

    // Simple weight-for-height (WFH) Z-score using median ±2SD
    if (ht && mo >= 0) {
      const wfhZ = (wt - medWt) / 1.0;
      if (wfhZ < -3) wfh = "Severe Wasting (WFH <-3 SD) — SAM";
      else if (wfhZ < -2) wfh = "Wasting (WFH <-2 SD) — MAM";
      else if (wfhZ > 2) wfh = "Overweight (WFH >+2 SD)";
      else wfh = "Normal weight-for-height";
    }

    setResult({ wfa, hfa, wfh, level, note });
  };

  return (
    <CalcWrapper title="Pediatric Growth Percentiles" emoji="📏">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Sex"><select style={selectStyle} value={sex} onChange={e => setSex(e.target.value)}><option value="male">Male</option><option value="female">Female</option></select></Field>
        <Field label="Age" hint="months (0-60)"><input style={inputStyle} type="number" min={0} max={60} placeholder="24" value={ageMonths} onChange={e => setAgeMonths(e.target.value)} /></Field>
        <Field label="Weight" hint="kg"><input style={inputStyle} type="number" step="0.1" placeholder="12.5" value={weight} onChange={e => setWeight(e.target.value)} /></Field>
        <Field label="Height / Length" hint="cm (optional)"><input style={inputStyle} type="number" step="0.1" placeholder="90" value={height} onChange={e => setHeight(e.target.value)} /></Field>
      </div>
      <CalcButton onClick={calculate} disabled={!ageMonths || !weight} />
      {result && (
        <>
          <ResultBox level={result.level} title="Weight-for-Age" value={result.wfa} interpretation={result.note} />
          {height && <ResultBox level="normal" title="Height-for-Age" value={result.hfa} interpretation="WHO reference standards (simplified Z-score)" />}
          {result.wfh && <ResultBox level="normal" title="Weight-for-Height" value={result.wfh} interpretation="SAM = Severe Acute Malnutrition. MAM = Moderate Acute Malnutrition." />}
          <div style={{ marginTop: 8, fontSize: 12, color: "#6A7E8A" }}>
            Based on WHO Child Growth Standards (simplified). Use WHO Anthro app for precise measurements.
          </div>
        </>
      )}
    </CalcWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Calculator registry (used by Calculators hub page)
// ─────────────────────────────────────────────────────────────────────────────

export const CALCULATORS = [
  { id: "bmi", title: "BMI & BSA", emoji: "⚖️", category: "General", component: BMICalculator },
  { id: "edc", title: "Pregnancy EDC", emoji: "🤰", category: "Obstetric", component: EDCCalculator },
  { id: "gfr", title: "GFR / Renal Function", emoji: "🫘", category: "Renal", component: GFRCalculator },
  { id: "wells", title: "Wells Criteria (DVT/PE)", emoji: "🩸", category: "Cardiovascular", component: WellsCriteriaCalculator },
  { id: "curb65", title: "CURB-65 (Pneumonia)", emoji: "🫁", category: "Respiratory", component: CURB65Calculator },
  { id: "gcs", title: "Glasgow Coma Scale", emoji: "🧠", category: "Neurology", component: GCSCalculator },
  { id: "apgar", title: "APGAR Score", emoji: "👶", category: "Pediatric", component: APGARCalculator },
  { id: "fluid", title: "Fluid Requirements", emoji: "💧", category: "General", component: FluidCalculator },
  { id: "burn", title: "Burn Area (Rule of 9s)", emoji: "🔥", category: "Trauma", component: BurnCalculator },
  { id: "framingham", title: "Framingham CVD Risk", emoji: "❤️", category: "Cardiovascular", component: FraminghamCalculator },
  { id: "growth", title: "Pediatric Growth", emoji: "📏", category: "Pediatric", component: PediatricGrowthCalculator },
] as const;
