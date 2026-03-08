// frontend/src/pages/EmergencyProtocolDetail.tsx
// Clinova — Emergency Protocol Detail with checklist, timers, and dose calculator
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { DoseCalc, EmergencyProtocol, EmergencyTimer, ProtocolStep } from "../api/emergency";
import { fetchProtocol } from "../api/emergency";

// ─────────────────────────────────────────────────────────────────────────────
// Countdown Timer Component
// ─────────────────────────────────────────────────────────────────────────────

function CountdownTimer({ timer }: { timer: EmergencyTimer }) {
  const [totalSeconds, setTotalSeconds] = useState(timer.minutes * 60);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setElapsed((e) => {
          if (e + 1 >= totalSeconds) {
            setRunning(false);
            clearInterval(intervalRef.current!);
            return totalSeconds;
          }
          return e + 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, totalSeconds]);

  const remaining = totalSeconds - elapsed;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const pct = totalSeconds > 0 ? ((elapsed / totalSeconds) * 100) : 0;
  const expired = elapsed >= totalSeconds && totalSeconds > 0;
  const borderColor = expired ? "#DC2626" : timer.critical ? "#F59E0B" : "#0A6E5E";

  const reset = () => { setElapsed(0); setRunning(false); };

  return (
    <div style={{
      border: `2px solid ${borderColor}`,
      borderRadius: 12,
      padding: "12px 16px",
      background: expired ? "#FEF2F2" : "#FFFBEB",
      marginBottom: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#1A2B3C" }}>
            {timer.critical ? "⚠️ " : "⏱ "}{timer.label}
          </div>
          <div style={{ fontSize: 12, color: "#6A7E8A", marginTop: 2 }}>{timer.description}</div>
        </div>
        <div style={{
          fontSize: 28,
          fontWeight: 900,
          fontFamily: "monospace",
          color: expired ? "#DC2626" : "#1A2B3C",
          minWidth: 80,
          textAlign: "right",
        }}>
          {expired ? "DONE" : `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: "#E5E7EB", borderRadius: 2, marginBottom: 10, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: expired ? "#DC2626" : borderColor,
          transition: "width 1s linear",
          borderRadius: 2,
        }} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => setRunning((r) => !r)}
          style={{
            padding: "6px 16px",
            borderRadius: 8,
            border: "none",
            background: running ? "#F59E0B" : "#0A6E5E",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {running ? "⏸ Pause" : elapsed > 0 ? "▶ Resume" : "▶ Start"}
        </button>
        <button
          onClick={reset}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid #D4E4E0",
            background: "#fff",
            color: "#4A5C6A",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          ↺ Reset
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dose Calculator Component
// ─────────────────────────────────────────────────────────────────────────────

function DoseCalculator({ calc }: { calc: DoseCalc }) {
  const [weight, setWeight] = useState<string>("");
  const [result, setResult] = useState<string | null>(null);

  const calculate = () => {
    const w = parseFloat(weight);
    if (!w || w <= 0) return;

    if (calc.fixed_dose_mg !== undefined) {
      const vol = calc.concentration_mg_per_mL
        ? (calc.fixed_dose_mg / calc.concentration_mg_per_mL).toFixed(2)
        : null;
      setResult(
        `${calc.drug}: ${calc.fixed_dose_mg}mg` +
        (vol ? ` → ${vol}mL of ${calc.concentration_mg_per_mL}mg/mL solution` : "") +
        ` (${calc.route})`
      );
    } else if (calc.mg_per_kg !== undefined) {
      let dose = w * calc.mg_per_kg;
      const capped = calc.max_mg !== undefined && dose > calc.max_mg;
      if (capped) dose = calc.max_mg!;
      const vol = calc.concentration_mg_per_mL
        ? (dose / calc.concentration_mg_per_mL).toFixed(2)
        : null;
      setResult(
        `${calc.drug}: ${dose.toFixed(1)}mg${capped ? " (MAX DOSE)" : ` for ${w}kg`}` +
        (vol ? ` → ${vol}mL` : "") +
        ` | Route: ${calc.route}`
      );
    } else if (calc.mL_per_kg !== undefined) {
      let vol = w * calc.mL_per_kg;
      const capped = calc.max_mL !== undefined && vol > calc.max_mL;
      if (capped) vol = calc.max_mL!;
      setResult(
        `${calc.drug}: ${vol.toFixed(0)}mL${capped ? " (MAX)" : ` for ${w}kg`} | Route: ${calc.route}`
      );
    }
  };

  return (
    <div style={{
      background: "#F0FDF4",
      border: "1px solid #86EFAC",
      borderRadius: 10,
      padding: "12px 14px",
      marginTop: 8,
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#166534", marginBottom: 8 }}>
        💊 Dose Calculator: {calc.drug}
      </div>
      {calc.note && (
        <div style={{ fontSize: 12, color: "#4A5C6A", marginBottom: 8, fontStyle: "italic" }}>
          {calc.note}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="number"
          min={1}
          max={200}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="Weight (kg)"
          style={{
            width: 130,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #D4E4E0",
            fontSize: 14,
            outline: "none",
          }}
        />
        <button
          onClick={calculate}
          disabled={!weight}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: weight ? "#166534" : "#D1D5DB",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            cursor: weight ? "pointer" : "not-allowed",
          }}
        >
          Calculate
        </button>
      </div>
      {result && (
        <div style={{
          marginTop: 10,
          padding: "8px 12px",
          background: "#DCFCE7",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          color: "#14532D",
          borderLeft: "4px solid #16A34A",
        }}>
          {result}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step Card
// ─────────────────────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  immediate: "🔴 Immediate",
  assessment: "🟡 Assessment",
  treatment: "🟢 Treatment",
  monitoring: "🔵 Monitoring",
  referral: "🟣 Referral",
};

const PHASE_BG: Record<string, string> = {
  immediate: "#FEF2F2",
  assessment: "#FFFBEB",
  treatment: "#F0FDF4",
  monitoring: "#EFF6FF",
  referral: "#FAF5FF",
};

function StepCard({
  step,
  checked,
  onToggle,
  timer,
}: {
  step: ProtocolStep;
  checked: boolean;
  onToggle: () => void;
  timer?: EmergencyTimer;
}) {
  const [expanded, setExpanded] = useState(step.critical);

  return (
    <div style={{
      border: step.critical ? "2px solid #DC262640" : "1px solid #E5E7EB",
      borderRadius: 12,
      background: checked ? "#F0FDF4" : PHASE_BG[step.phase] ?? "#fff",
      marginBottom: 10,
      overflow: "hidden",
      opacity: checked ? 0.75 : 1,
      transition: "opacity 0.2s ease",
    }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: "14px 16px",
          cursor: "pointer",
        }}
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          aria-label={checked ? "Mark incomplete" : "Mark complete"}
          style={{
            width: 24,
            height: 24,
            minWidth: 24,
            borderRadius: 6,
            border: `2px solid ${checked ? "#16A34A" : step.critical ? "#DC2626" : "#D4E4E0"}`,
            background: checked ? "#16A34A" : "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 14,
            fontWeight: 900,
          }}
        >
          {checked ? "✓" : ""}
        </button>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "#6A7E8A", minWidth: 110 }}>
              {PHASE_LABELS[step.phase]}
            </span>
            {step.critical && !checked && (
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 999,
                background: "#FEE2E2",
                color: "#DC2626",
                letterSpacing: 0.5,
              }}>
                CRITICAL
              </span>
            )}
          </div>
          <div style={{
            marginTop: 4,
            fontWeight: step.critical ? 700 : 600,
            fontSize: 15,
            color: checked ? "#4A5C6A" : "#1A2B3C",
            textDecoration: checked ? "line-through" : "none",
            lineHeight: 1.4,
          }}>
            {step.id}. {step.text}
          </div>
        </div>

        <span style={{ fontSize: 12, color: "#9CA3AF", userSelect: "none" }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: "0 16px 16px 52px" }}>
          <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, marginBottom: 8 }}>
            {step.details}
          </div>

          {timer && <CountdownTimer timer={timer} />}
          {step.dose_calc && <DoseCalculator calc={step.dose_calc} />}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function EmergencyProtocolDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [protocol, setProtocol] = useState<EmergencyProtocol | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [drillMode, setDrillMode] = useState(false);
  const [activeTab, setActiveTab] = useState<"steps" | "meds" | "flags" | "referral">("steps");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProtocol(id);
      setProtocol(data);
    } catch {
      setError("Protocol not found or unavailable.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const toggleStep = (stepId: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  const completedCount = checked.size;
  const totalSteps = protocol?.steps.length ?? 0;
  const pct = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px", background: "#FFF5F5", minHeight: "100vh" }}>
        <div style={{ fontSize: 36 }}>⏳</div>
        <div style={{ marginTop: 12, color: "#4A5C6A" }}>Loading protocol…</div>
      </div>
    );
  }

  if (error || !protocol) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px", background: "#FFF5F5", minHeight: "100vh" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
        <div style={{ color: "#DC2626", fontWeight: 700, marginBottom: 16 }}>{error}</div>
        <button onClick={() => navigate("/emergency")}
          style={{ padding: "10px 20px", background: "#DC2626", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>
          ← Back to Protocols
        </button>
      </div>
    );
  }

  const timerMap = Object.fromEntries(protocol.timers.map((t) => [t.id, t]));

  const tabs: { key: typeof activeTab; label: string }[] = [
    { key: "steps", label: `Steps (${totalSteps})` },
    { key: "meds", label: `Medications (${protocol.medications.length})` },
    { key: "flags", label: `Red Flags (${protocol.red_flags.length})` },
    { key: "referral", label: "Referral" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#FFF5F5", paddingBottom: 100 }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #7F1D1D 0%, #DC2626 80%)",
        padding: "20px 24px",
        color: "#fff",
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <button
              onClick={() => navigate("/emergency")}
              style={{
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 8,
                color: "#fff",
                padding: "6px 14px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              ← Protocols
            </button>
            {drillMode && (
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                background: "#F59E0B",
                color: "#1A2B3C",
                padding: "3px 10px",
                borderRadius: 999,
                letterSpacing: 0.5,
              }}>
                🎓 DRILL MODE
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 52 }}>{protocol.icon}</span>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>{protocol.name}</h1>
              <p style={{ margin: "6px 0 0", fontSize: 14, opacity: 0.85, maxWidth: 600, lineHeight: 1.4 }}>
                {protocol.summary}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>Protocol progress</span>
              <span style={{ fontSize: 12, fontWeight: 700 }}>
                {completedCount}/{totalSteps} steps ({pct}%)
              </span>
            </div>
            <div style={{ height: 6, background: "rgba(255,255,255,0.2)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${pct}%`,
                background: pct === 100 ? "#22C55E" : "#F59E0B",
                borderRadius: 3,
                transition: "width 0.3s ease",
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div style={{
        background: "#fff",
        borderBottom: "1px solid #E5E7EB",
        padding: "10px 24px",
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={() => setChecked(new Set())}
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              border: "1px solid #D4E4E0",
              background: "#fff",
              color: "#4A5C6A",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            ↺ Reset Checklist
          </button>

          <button
            onClick={() => setDrillMode((d) => !d)}
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              border: `1px solid ${drillMode ? "#F59E0B" : "#D4E4E0"}`,
              background: drillMode ? "#FFFBEB" : "#fff",
              color: drillMode ? "#B45309" : "#4A5C6A",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            🎓 {drillMode ? "Exit Drill Mode" : "Simulation / Drill Mode"}
          </button>

          <a
            href="tel:108"
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              border: "none",
              background: "#DC2626",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
              marginLeft: "auto",
            }}
          >
            📞 Call Ambulance (108)
          </a>
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 24px" }}>
        {/* Timers panel */}
        {protocol.timers.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#1A2B3C", marginBottom: 10 }}>
              ⏱ Time-Critical Timers
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
              {protocol.timers.map((t) => (
                <CountdownTimer key={t.id} timer={t} />
              ))}
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div style={{
          display: "flex",
          gap: 4,
          marginBottom: 16,
          background: "#F3F4F6",
          borderRadius: 10,
          padding: 4,
        }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 8,
                border: "none",
                background: activeTab === tab.key ? "#DC2626" : "transparent",
                color: activeTab === tab.key ? "#fff" : "#4A5C6A",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Steps Tab */}
        {activeTab === "steps" && (
          <div>
            {protocol.steps.map((step) => (
              <StepCard
                key={step.id}
                step={step}
                checked={checked.has(step.id)}
                onToggle={() => toggleStep(step.id)}
                timer={step.timer_id ? timerMap[step.timer_id] : undefined}
              />
            ))}
          </div>
        )}

        {/* Medications Tab */}
        {activeTab === "meds" && (
          <div>
            {protocol.medications.map((med, i) => (
              <div key={i} style={{
                border: "1px solid #E5E7EB",
                borderRadius: 12,
                padding: "14px 16px",
                marginBottom: 10,
                background: "#fff",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#1A2B3C" }}>{med.name}</div>
                    <div style={{ fontSize: 14, color: "#DC2626", marginTop: 4, fontWeight: 600 }}>{med.dose}</div>
                  </div>
                  <span style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: "#EBF5F3",
                    color: "#0A6E5E",
                    fontSize: 12,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}>
                    {med.route}
                  </span>
                </div>
                {med.note && (
                  <div style={{ marginTop: 8, fontSize: 13, color: "#6A7E8A", borderTop: "1px solid #F3F4F6", paddingTop: 8 }}>
                    {med.note}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Red Flags Tab */}
        {activeTab === "flags" && (
          <div>
            <div style={{
              background: "#FEF2F2",
              border: "1px solid #FCA5A5",
              borderRadius: 12,
              padding: "16px 18px",
              marginBottom: 16,
            }}>
              <div style={{ fontWeight: 700, color: "#DC2626", marginBottom: 12 }}>
                🔴 Red Flags — Escalate Immediately
              </div>
              {protocol.red_flags.map((flag, i) => (
                <div key={i} style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  marginBottom: 10,
                  fontSize: 14,
                  color: "#1A2B3C",
                  lineHeight: 1.5,
                }}>
                  <span style={{ color: "#DC2626", fontWeight: 900, minWidth: 16 }}>!</span>
                  {flag}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Referral Tab */}
        {activeTab === "referral" && (
          <div>
            <div style={{
              background: "#F0FDF4",
              border: "1px solid #86EFAC",
              borderRadius: 12,
              padding: "16px 18px",
              marginBottom: 16,
            }}>
              <div style={{ fontWeight: 700, color: "#166534", marginBottom: 12 }}>
                ✅ Pre-Referral Stabilization Checklist
              </div>
              {protocol.pre_referral.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8, fontSize: 14, color: "#1A2B3C" }}>
                  <span style={{ color: "#16A34A", fontWeight: 700 }}>☐</span>
                  {item}
                </div>
              ))}
            </div>

            <div style={{
              background: "#EFF6FF",
              border: "1px solid #BFDBFE",
              borderRadius: 12,
              padding: "16px 18px",
            }}>
              <div style={{ fontWeight: 700, color: "#1D4ED8", marginBottom: 12 }}>
                🚑 Indications for Referral
              </div>
              {protocol.referral_indications.map((ind, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8, fontSize: 14, color: "#1A2B3C" }}>
                  <span style={{ color: "#1D4ED8", fontWeight: 700 }}>→</span>
                  {ind}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
