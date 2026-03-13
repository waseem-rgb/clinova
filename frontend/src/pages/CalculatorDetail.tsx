// frontend/src/pages/CalculatorDetail.tsx
import React, { useState, useCallback } from "react";
import type { Calculator, CalcInput, CalcResult } from "../data/calculators_part1";

const TEAL = "var(--teal-700, #0f766e)";
const GREEN = "#16a34a";
const YELLOW = "#ca8a04";
const RED = "#dc2626";

function riskColor(risk: CalcResult["risk"]): string {
  switch (risk) {
    case "low":
    case "normal":
      return GREEN;
    case "moderate":
      return YELLOW;
    case "high":
      return RED;
    case "critical":
      return RED;
    case "info":
      return TEAL;
    default:
      return TEAL;
  }
}

function riskBg(risk: CalcResult["risk"]): string {
  switch (risk) {
    case "low":
    case "normal":
      return "#f0fdf4";
    case "moderate":
      return "#fffbeb";
    case "high":
      return "#fef2f2";
    case "critical":
      return "#fef2f2";
    case "info":
      return "#f0fdfa";
    default:
      return "#f0fdfa";
  }
}

function riskLabel(risk: CalcResult["risk"]): string {
  switch (risk) {
    case "low":
      return "Low Risk";
    case "normal":
      return "Normal";
    case "moderate":
      return "Moderate";
    case "high":
      return "High Risk";
    case "critical":
      return "Critical";
    case "info":
      return "Result";
    default:
      return risk;
  }
}

function InputField({
  input,
  value,
  onChange,
}: {
  input: CalcInput;
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  if (input.type === "select" && input.options) {
    return (
      <div style={{ marginBottom: 14 }}>
        <label
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 600,
            color: "#374151",
            marginBottom: 5,
          }}
        >
          {input.label}
          {input.unit && (
            <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 4 }}>
              ({input.unit})
            </span>
          )}
        </label>
        <select
          value={value ?? ""}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1.5px solid #e5e7eb",
            background: "#fff",
            fontSize: 14,
            color: "#111827",
            outline: "none",
            cursor: "pointer",
            appearance: "auto",
          }}
        >
          <option value="" disabled>
            Select...
          </option>
          {input.options.map((opt) => (
            <option key={`${opt.label}-${opt.value}`} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 600,
          color: "#374151",
          marginBottom: 5,
        }}
      >
        {input.label}
        {input.unit && (
          <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 4 }}>
            ({input.unit})
          </span>
        )}
      </label>
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return;
          onChange(Number(raw));
        }}
        placeholder={input.placeholder || `Enter ${input.label.toLowerCase()}`}
        min={input.min}
        max={input.max}
        step={input.step || "any"}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1.5px solid #e5e7eb",
          background: "#fff",
          fontSize: 14,
          color: "#111827",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {input.min !== undefined && input.max !== undefined && (
        <div
          style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}
        >
          Range: {input.min} - {input.max}
        </div>
      )}
    </div>
  );
}

export default function CalculatorDetail({ calc }: { calc: Calculator }) {
  const [values, setValues] = useState<Record<string, number>>({});
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback(
    (id: string, v: number) => {
      setValues((prev) => ({ ...prev, [id]: v }));
      setResult(null);
      setError(null);
    },
    []
  );

  const handleCalculate = useCallback(() => {
    // Validate all required inputs have values
    const missing = calc.inputs.filter(
      (inp) => values[inp.id] === undefined || values[inp.id] === null
    );
    if (missing.length > 0) {
      setError(`Please fill in: ${missing.map((m) => m.label).join(", ")}`);
      return;
    }
    // Validate ranges
    for (const inp of calc.inputs) {
      const v = values[inp.id];
      if (inp.min !== undefined && v < inp.min) {
        setError(`${inp.label} must be at least ${inp.min}`);
        return;
      }
      if (inp.max !== undefined && v > inp.max) {
        setError(`${inp.label} must be at most ${inp.max}`);
        return;
      }
    }
    try {
      const res = calc.calculate(values);
      setResult(res);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Calculation error");
    }
  }, [calc, values]);

  const handleReset = useCallback(() => {
    setValues({});
    setResult(null);
    setError(null);
  }, []);

  // Split inputs into columns if > 4
  const midpoint = Math.ceil(calc.inputs.length / 2);
  const useColumns = calc.inputs.length > 4;

  return (
    <div>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 18px", lineHeight: 1.5 }}>
        {calc.description}
      </p>

      {/* Input form */}
      {useColumns ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
          <div>
            {calc.inputs.slice(0, midpoint).map((inp) => (
              <InputField
                key={inp.id}
                input={inp}
                value={values[inp.id]}
                onChange={(v) => handleChange(inp.id, v)}
              />
            ))}
          </div>
          <div>
            {calc.inputs.slice(midpoint).map((inp) => (
              <InputField
                key={inp.id}
                input={inp}
                value={values[inp.id]}
                onChange={(v) => handleChange(inp.id, v)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 380 }}>
          {calc.inputs.map((inp) => (
            <InputField
              key={inp.id}
              input={inp}
              value={values[inp.id]}
              onChange={(v) => handleChange(inp.id, v)}
            />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 14px",
            borderRadius: 8,
            background: "#fef2f2",
            color: RED,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      {/* Buttons */}
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button
          onClick={handleCalculate}
          style={{
            padding: "12px 32px",
            borderRadius: 8,
            border: "none",
            background: "var(--teal-700)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            letterSpacing: 0.3,
            width: "100%",
          }}
        >
          Calculate
        </button>
        <button
          onClick={handleReset}
          style={{
            padding: "12px 20px",
            borderRadius: 8,
            border: "1.5px solid var(--border)",
            background: "#fff",
            color: "var(--text-muted)",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Reset
        </button>
      </div>

      {/* Result */}
      {result && (
        <div
          style={{
            marginTop: 22,
            padding: "20px 22px",
            borderRadius: 12,
            background: riskBg(result.risk),
            border: `1px solid ${riskColor(result.risk)}22`,
            borderLeft: `4px solid ${riskColor(result.risk)}`,
          }}
        >
          {/* Score row */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
            <div
              style={{
                fontSize: 36,
                fontWeight: 800,
                color: riskColor(result.risk),
                lineHeight: 1,
                fontFamily: "var(--font-mono)",
              }}
            >
              {String(result.score)}
            </div>
            <span
              style={{
                display: "inline-block",
                padding: "4px 14px",
                borderRadius: 999,
                background: riskColor(result.risk),
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              {riskLabel(result.risk)}
            </span>
          </div>

          {/* Interpretation */}
          <div
            style={{
              fontSize: 14,
              color: "#374151",
              lineHeight: 1.6,
              marginBottom: 10,
              fontWeight: 500,
            }}
          >
            {result.interpretation}
          </div>

          {/* Action */}
          <div
            style={{
              fontSize: 13,
              color: riskColor(result.risk),
              fontWeight: 700,
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
              lineHeight: 1.5,
            }}
          >
            <span style={{ flexShrink: 0, marginTop: 1 }}>Recommended:</span>
            <span style={{ fontWeight: 600 }}>{result.action}</span>
          </div>
        </div>
      )}

      {/* Reference */}
      <div
        style={{
          marginTop: 16,
          fontSize: 11,
          color: "#9ca3af",
          fontStyle: "italic",
          lineHeight: 1.4,
        }}
      >
        Reference: {calc.reference}
      </div>
    </div>
  );
}
