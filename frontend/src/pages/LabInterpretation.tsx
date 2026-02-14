// frontend/src/pages/LabInterpretation.tsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../services/api";
import SidebarNav from "../components/SidebarNav";

type Severity = "mild" | "borderline" | "moderate" | "severe" | "critical" | "normal";

type Abnormality = {
  panel: string;
  test: string;
  result: string;
  unit?: string;
  range?: string;
  flag?: string;
  severity: Severity;
  notes?: string;
};

type NextInvestigation = {
  test: string;
  why: string;
  whatItHelps: string;
};

type PatternCard = {
  title: string;
  summary: string;
  likely_conditions: string[];
  red_flags: string[];
  next_investigations: NextInvestigation[];
};

type ExecutiveKeyAbn = {
  test: string;
  panel: string;
  value: string;
  unit?: string;
  severity: Severity;
  note?: string;
};

type Coverage = {
  all_addressed: boolean;
  missing: string[];
};

function severityRank(s: Severity) {
  return s === "critical" ? 5 : s === "severe" ? 4 : s === "moderate" ? 3 : s === "borderline" ? 2 : s === "mild" ? 1 : 0;
}

function badgeStyles(sev: Severity): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--ink)",
  };

  // keep it subtle (doctor-grade, not flashy)
  if (sev === "critical") return { ...base, borderColor: "rgba(220,38,38,0.35)" };
  if (sev === "severe") return { ...base, borderColor: "rgba(245,158,11,0.35)" };
  if (sev === "moderate") return { ...base, borderColor: "rgba(59,130,246,0.35)" };
  return base;
}

export default function LabInterpretation() {
  const nav = useNavigate();

  const [files, setFiles] = useState<File[]>([]);
  const [ctxAge, setCtxAge] = useState<string>("");
  const [ctxSex, setCtxSex] = useState<"unknown" | "male" | "female">("unknown");
  const [ctxPreg, setCtxPreg] = useState<"unknown" | "yes" | "no">("unknown");
  const [ctxDx, setCtxDx] = useState<string>("");
  const [ctxMeds, setCtxMeds] = useState<string>("");
  const [ctxChief, setCtxChief] = useState<string>("");

  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const [abnorm, setAbnorm] = useState<Abnormality[]>([]);
  const [patterns, setPatterns] = useState<PatternCard[]>([]);
  const [summaryAbn, setSummaryAbn] = useState<ExecutiveKeyAbn[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [counts, setCounts] = useState<{ tests: number; abnormalities: number }>({ tests: 0, abnormalities: 0 });
  const [errorMsg, setErrorMsg] = useState<string>("");

  // filters
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [panelFilter, setPanelFilter] = useState<string>("All");
  const [query, setQuery] = useState<string>("");

  const panels = useMemo(() => {
    const set = new Set<string>();
    for (const a of abnorm) set.add(a.panel);
    return ["All", ...Array.from(set).sort()];
  }, [abnorm]);

  const filteredAbnorm = useMemo(() => {
    let list = [...abnorm];

    if (onlyCritical) list = list.filter((a) => a.severity === "critical" || (a.flag ?? "").toLowerCase() === "critical");
    if (panelFilter !== "All") list = list.filter((a) => a.panel === panelFilter);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => {
        return (
          a.test.toLowerCase().includes(q) ||
          a.panel.toLowerCase().includes(q) ||
          (a.notes ?? "").toLowerCase().includes(q)
        );
      });
    }

    // sort: highest severity first, then panel/test
    list.sort((a, b) => {
      const d = severityRank(b.severity) - severityRank(a.severity);
      if (d !== 0) return d;
      if (a.panel !== b.panel) return a.panel.localeCompare(b.panel);
      return a.test.localeCompare(b.test);
    });

    return list;
  }, [abnorm, onlyCritical, panelFilter, query]);

  const keyAbnorm = useMemo(() => {
    if (summaryAbn.length) return summaryAbn;
    return [...abnorm]
      .slice()
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
      .slice(0, 5)
      .map((a) => ({
        test: a.test,
        panel: a.panel,
        value: a.result,
        unit: a.unit,
        severity: a.severity,
        note: a.notes,
      }));
  }, [abnorm, summaryAbn]);

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (!picked.length) return;
    // append and dedupe by name+size
    const merged = [...files, ...picked];
    const seen = new Set<string>();
    const deduped: File[] = [];
    for (const f of merged) {
      const k = `${f.name}__${f.size}`;
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(f);
    }
    setFiles(deduped);
    e.target.value = "";
  }

  function removeFile(idx: number) {
    const next = files.slice();
    next.splice(idx, 1);
    setFiles(next);
  }

  async function runAnalyze() {
    console.log("[Lab] runAnalyze called with files:", files.length, files.map(f => f.name));
    setBusy(true);
    setReady(false);
    setErrorMsg("");

    try {
      const form = new FormData();
      files.forEach((f) => {
        console.log("[Lab] Appending file:", f.name, f.size);
        form.append("files", f);
      });
      if (ctxAge) form.append("age", ctxAge);
      if (ctxSex) form.append("sex", ctxSex);
      if (ctxPreg) form.append("pregnancy", ctxPreg);
      if (ctxDx) form.append("known_dx", ctxDx);
      if (ctxMeds) form.append("current_meds", ctxMeds);
      if (ctxChief) form.append("chief_complaint", ctxChief);

      console.log("[Lab] Sending request to:", `${API_BASE}/lab/analyze?include_evidence=false`);
      const res = await fetch(`${API_BASE}/lab/analyze?include_evidence=false`, {
        method: "POST",
        body: form,
      });

      console.log("[Lab] Response status:", res.status, res.statusText);
      if (!res.ok) {
        const text = await res.text();
        console.error("[Lab] Error response:", text);
        throw new Error(text || `HTTP ${res.status}`);
      }

      const data = await res.json();
      console.log("[Lab] Response data:", data);
      console.log("[Lab] Extracted tests count:", data.extracted_tests_count);
      console.log("[Lab] Abnormalities count:", data.abnormalities_count);

      const mappedAbn: Abnormality[] = (data.abnormalities ?? []).map((a: any) => ({
        panel: a.panel,
        test: a.test,
        result: String(a.result ?? ""),
        unit: a.unit ?? undefined,
        range: a.range ?? undefined,
        flag: a.flag ?? undefined,
        severity: (a.severity || "normal").toLowerCase(),
        notes: a.notes ?? "",
      }));

      const mappedPatterns: PatternCard[] = (data.patterns ?? []).map((p: any) => ({
        title: p.title,
        summary: p.summary,
        likely_conditions: p.likely_conditions ?? [],
        red_flags: p.red_flags ?? [],
        next_investigations: (p.next_investigations ?? []).map((n: any) => ({
          test: n.test,
          why: n.why,
          whatItHelps: n.what_it_helps,
        })),
      }));

      const mappedSummary = (data.executive_summary?.key_abnormalities ?? []).map((a: any) => ({
        test: a.test,
        panel: a.panel,
        value: String(a.value ?? ""),
        unit: a.unit ?? undefined,
        severity: (a.severity || "normal").toLowerCase(),
        note: a.note ?? "",
      }));

      setAbnorm(mappedAbn);
      setPatterns(mappedPatterns);
      setSummaryAbn(mappedSummary);
      setCoverage(data.coverage ?? null);
      setCounts({ tests: data.extracted_tests_count ?? 0, abnormalities: data.abnormalities_count ?? 0 });
      setReady(true);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to analyze lab report.");
    } finally {
      setBusy(false);
    }
  }

  function clearAll() {
    setFiles([]);
    setCtxAge("");
    setCtxSex("unknown");
    setCtxPreg("unknown");
    setCtxDx("");
    setCtxMeds("");
    setCtxChief("");
    setAbnorm([]);
    setPatterns([]);
    setSummaryAbn([]);
    setCoverage(null);
    setCounts({ tests: 0, abnormalities: 0 });
    setErrorMsg("");
    setReady(false);
    setOnlyCritical(false);
    setPanelFilter("All");
    setQuery("");
  }

  const ctxLine = useMemo(() => {
    const bits: string[] = [];
    if (ctxAge.trim()) bits.push(`Age ${ctxAge.trim()}`);
    if (ctxSex !== "unknown") bits.push(ctxSex === "male" ? "Male" : "Female");
    if (ctxPreg !== "unknown") bits.push(ctxPreg === "yes" ? "Pregnant" : "Not pregnant");
    if (ctxDx.trim()) bits.push(`Known Dx: ${ctxDx.trim()}`);
    if (ctxMeds.trim()) bits.push(`Meds: ${ctxMeds.trim()}`);
    if (ctxChief.trim()) bits.push(`Complaint: ${ctxChief.trim()}`);
    return bits.join(" • ");
  }, [ctxAge, ctxSex, ctxPreg, ctxDx, ctxMeds, ctxChief]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg)", padding: "24px 24px 24px 0" }}>
      <div style={{ maxWidth: "100%", minWidth: 1200, margin: 0, display: "grid", gridTemplateColumns: "260px 1fr", gap: 24 }}>
        <SidebarNav />

        <div>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
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

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={clearAll}
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
              Clear
            </button>

            <button
              onClick={runAnalyze}
              disabled={busy || files.length === 0}
              style={{
                border: "1px solid rgba(14,165,164,0.35)",
                background:
                  busy || files.length === 0
                    ? "var(--surface-2)"
                    : "linear-gradient(135deg, var(--accent), var(--accent-2))",
                padding: "8px 12px",
                borderRadius: 12,
                cursor: busy || files.length === 0 ? "not-allowed" : "pointer",
                fontWeight: 900,
                color: busy || files.length === 0 ? "var(--muted)" : "#fff",
                boxShadow: busy || files.length === 0 ? "none" : "0 12px 28px rgba(14,165,164,0.3)",
              }}
              title={files.length === 0 ? "Upload at least one PDF first" : "Parse and interpret"}
            >
              {busy ? "Processing…" : "Interpret"}
            </button>
          </div>
        </div>

        {/* Title */}
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: "var(--ink)",
              letterSpacing: -0.6,
              fontFamily: "var(--font-display)",
            }}
          >
            Lab Interpretation
          </div>
          <div style={{ color: "var(--muted)", marginTop: 4 }}>
            Upload medical report PDFs → identify abnormalities → doctor-friendly interpretation & next steps.
          </div>
        </div>

        {/* Upload + Context */}
        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "1.2fr 0.8fr",
            gap: 14,
          }}
        >
          {/* Upload card */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 18,
              padding: 16,
              boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16 }}>Upload PDFs</div>
              <div style={{ color: "var(--muted-2)", fontSize: 12 }}>Multiple files supported • 30+ pages OK</div>
            </div>

            <div
              style={{
                marginTop: 12,
                borderRadius: 14,
                border: "1px dashed rgba(15,23,42,0.2)",
                background: "var(--surface-2)",
                padding: 14,
              }}
            >
              <input
                type="file"
                accept="application/pdf"
                multiple
                onChange={onPickFiles}
                style={{ width: "100%" }}
              />
              <div style={{ marginTop: 8, color: "var(--muted-2)", fontSize: 12 }}>
                Tip: Upload all PDFs for the same patient visit together for a combined interpretation.
              </div>
            </div>

            {/* File list */}
            <div style={{ marginTop: 12 }}>
              {files.length === 0 ? (
                <div style={{ color: "var(--muted)" }}>No files uploaded yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {files.map((f, idx) => (
                    <div
                      key={`${f.name}-${f.size}-${idx}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        padding: "10px 10px",
                        background: "var(--surface-2)",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 800,
                            color: "var(--ink)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {f.name}
                        </div>
                        <div style={{ color: "var(--muted-2)", fontSize: 12 }}>
                          {(f.size / (1024 * 1024)).toFixed(2)} MB
                        </div>
                      </div>
                      <button
                        onClick={() => removeFile(idx)}
                        style={{
                          border: "1px solid var(--border)",
                          background: "var(--surface)",
                          borderRadius: 10,
                          padding: "6px 10px",
                          cursor: "pointer",
                          fontWeight: 800,
                          color: "var(--ink)",
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Context card */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 18,
              padding: 16,
              boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
            }}
          >
            <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16 }}>Clinical context (optional)</div>
            <div style={{ color: "var(--muted-2)", fontSize: 12, marginTop: 4 }}>
              Adds relevance (e.g., CKD/DM/pregnancy affects interpretation).
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Age" value={ctxAge} onChange={setCtxAge} placeholder="e.g., 54" />
              <SelectField
                label="Sex"
                value={ctxSex}
                onChange={(v) => setCtxSex(v as any)}
                options={[
                  { value: "unknown", label: "Unknown" },
                  { value: "male", label: "Male" },
                  { value: "female", label: "Female" },
                ]}
              />
              <SelectField
                label="Pregnancy"
                value={ctxPreg}
                onChange={(v) => setCtxPreg(v as any)}
                options={[
                  { value: "unknown", label: "Unknown" },
                  { value: "no", label: "No" },
                  { value: "yes", label: "Yes" },
                ]}
              />
              <Field label="Known Dx" value={ctxDx} onChange={setCtxDx} placeholder="e.g., DM, CKD" />
            </div>

            <div style={{ marginTop: 10 }}>
              <Field label="Current meds" value={ctxMeds} onChange={setCtxMeds} placeholder="e.g., ACE inhibitor, diuretics" />
            </div>

            <div style={{ marginTop: 10 }}>
              <Field label="Chief complaint" value={ctxChief} onChange={setCtxChief} placeholder="e.g., fever, vomiting, jaundice" />
            </div>

            <div style={{ marginTop: 10, color: "var(--muted-2)", fontSize: 12 }}>
              {ctxLine ? (
                <span>
                  <b>Context:</b> {ctxLine}
                </span>
              ) : (
                "No context added."
              )}
            </div>
          </div>
        </div>

        {/* Results */}
        <div style={{ marginTop: 16 }}>
          {!ready ? (
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 18,
                padding: 16,
                color: "var(--muted)",
              }}
            >
              {busy
                ? "Processing…"
                : "Upload PDFs and click “Interpret” to generate the doctor-grade output."}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
              {counts.tests === 0 && (
                <div
                  style={{
                    background: "var(--surface)",
                    border: "1px solid rgba(234,88,12,0.35)",
                    borderRadius: 18,
                    padding: 16,
                    color: "#b45309",
                    fontWeight: 800,
                  }}
                >
                  No lab values detected—try another PDF or check if scanned image PDF requires OCR (not enabled).
                </div>
              )}
              {errorMsg && (
                <div
                  style={{
                    background: "var(--surface)",
                    border: "1px solid rgba(220,38,38,0.35)",
                    borderRadius: 18,
                    padding: 16,
                    color: "#b91c1c",
                    fontWeight: 800,
                  }}
                >
                  {errorMsg}
                </div>
              )}
              {/* Summary */}
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 18,
                  padding: 16,
                  boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16 }}>Executive summary</div>
                  <div style={{ color: "var(--muted-2)", fontSize: 12 }}>
                    {counts.tests} tests • {counts.abnormalities} abnormalities
                  </div>
                </div>

                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      padding: 12,
                      background: "var(--surface-2)",
                    }}
                  >
                    <div style={{ fontWeight: 900, color: "var(--ink)" }}>Key abnormalities</div>
                    <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                      {keyAbnorm.map((a, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ color: "var(--ink)", fontWeight: 800 }}>
                            {a.test}
                            <span style={{ color: "var(--muted)", fontWeight: 700 }}> • {a.panel}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ fontWeight: 900, color: "var(--ink)" }}>
                            {a.value} {a.unit ?? ""}
                          </div>
                          <span style={badgeStyles(a.severity)}>{a.severity.toUpperCase()}</span>
                        </div>
                      </div>
                    ))}
                    </div>
                  </div>

                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      padding: 12,
                      background: "var(--surface-2)",
                    }}
                  >
                    <div style={{ fontWeight: 900, color: "var(--ink)" }}>Likely patterns</div>
                    <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                      {patterns.slice(0, 3).map((p, i) => (
                        <div key={i} style={{ color: "var(--ink)", fontWeight: 800 }}>
                          • {p.title}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Abnormalities table */}
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 18,
                  padding: 16,
                  boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16 }}>Abnormalities</div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink)", fontWeight: 800 }}>
                      <input
                        type="checkbox"
                        checked={onlyCritical}
                        onChange={(e) => setOnlyCritical(e.target.checked)}
                      />
                      Critical only
                    </label>

                    <select
                      value={panelFilter}
                      onChange={(e) => setPanelFilter(e.target.value)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        fontWeight: 800,
                        color: "var(--ink)",
                      }}
                    >
                      {panels.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>

                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search tests/panels…"
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        fontWeight: 800,
                        color: "var(--ink)",
                        minWidth: 220,
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 12, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "var(--ink)" }}>
                        <th style={th}>Panel</th>
                        <th style={th}>Test</th>
                        <th style={th}>Result</th>
                        <th style={th}>Range</th>
                        <th style={th}>Flag</th>
                        <th style={th}>Severity</th>
                        <th style={th}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAbnorm.map((a, idx) => (
                        <tr key={idx} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={tdMuted}>{a.panel}</td>
                          <td style={tdStrong}>{a.test}</td>
                          <td style={td}>
                            <span style={{ fontWeight: 900, color: "var(--ink)" }}>
                          {a.result} {a.unit ?? ""}
                        </span>
                      </td>
                      <td style={tdMuted}>{a.range ?? "—"}</td>
                      <td style={tdMuted}>{a.flag ?? "—"}</td>
                      <td style={td}>
                        <span style={badgeStyles(a.severity)}>{a.severity.toUpperCase()}</span>
                      </td>
                      <td style={tdMuted}>{a.notes ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

                  {filteredAbnorm.length === 0 && (
                    <div style={{ color: "var(--muted)", marginTop: 10 }}>No abnormalities match the current filters.</div>
                  )}
                </div>
              </div>

              {/* Pattern cards */}
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 18,
                  padding: 16,
                  boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
                }}
              >
                <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16 }}>Interpretation patterns</div>
                <div style={{ color: "var(--muted-2)", marginTop: 4, fontSize: 12 }}>
                  Generated from deterministic rules; RAG-ready for the next stage.
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                  {patterns.map((p, idx) => (
                    <details
                      key={idx}
                      open={idx === 0}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 14,
                        padding: 12,
                        background: "var(--surface-2)",
                      }}
                    >
                      <summary style={{ cursor: "pointer", listStyle: "none" as any }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                          <div style={{ fontWeight: 900, color: "var(--ink)" }}>{p.title}</div>
                          <div style={{ color: "var(--muted-2)", fontSize: 12 }}>Expand</div>
                        </div>
                        <div style={{ color: "var(--muted)", marginTop: 6 }}>{p.summary}</div>
                      </summary>

                      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 10, background: "var(--surface)" }}>
                          <div style={{ fontWeight: 900, color: "var(--ink)" }}>Likely conditions</div>
                          <ul style={{ margin: "8px 0 0 18px", color: "var(--ink)", fontWeight: 700 }}>
                            {p.likely_conditions.map((x, i) => (
                              <li key={i} style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span>{x}</span>
                                <button
                                  onClick={() => nav(`/ddx?condition=${encodeURIComponent(x)}&source=lab`)}
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: 6,
                                    border: "1px solid var(--accent)",
                                    background: "var(--surface)",
                                    cursor: "pointer",
                                    fontWeight: 700,
                                    color: "var(--accent)",
                                    fontSize: 10,
                                  }}
                                  title={`Investigate ${x} in DDx`}
                                >
                                  🔍 DDx
                                </button>
                                <button
                                  onClick={() => nav(`/treatment?topic=${encodeURIComponent(x)}&source=lab`)}
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: 6,
                                    border: "1px solid #059669",
                                    background: "var(--surface)",
                                    cursor: "pointer",
                                    fontWeight: 700,
                                    color: "#059669",
                                    fontSize: 10,
                                  }}
                                  title={`Get treatment for ${x}`}
                                >
                                  Treat
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 10, background: "var(--surface)" }}>
                          <div style={{ fontWeight: 900, color: "var(--ink)" }}>Red flags</div>
                          <ul style={{ margin: "8px 0 0 18px", color: "var(--ink)", fontWeight: 700 }}>
                            {p.red_flags.map((x, i) => (
                              <li key={i} style={{ marginBottom: 6 }}>
                                {x}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: 12, padding: 10, background: "var(--surface)" }}>
                        <div style={{ fontWeight: 900, color: "var(--ink)" }}>Next investigations</div>

                        <div style={{ marginTop: 8, overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                            <thead>
                              <tr style={{ textAlign: "left", color: "var(--ink)" }}>
                                <th style={th}>Test</th>
                                <th style={th}>Why</th>
                                <th style={th}>What it helps</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.next_investigations.map((n, i) => (
                                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                                  <td style={tdStrong}>{n.test}</td>
                                  <td style={tdMuted}>{n.why}</td>
                                  <td style={tdMuted}>{n.whatItHelps}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              </div>

              {/* Coverage gate */}
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 18,
                  padding: 16,
                }}
              >
                <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16 }}>Coverage gate</div>
                <div style={{ color: "var(--muted)", marginTop: 6 }}>
                  In real mode, the system verifies that <b>every abnormality</b> is covered by at least one interpretation pattern or note.
                </div>
                <div style={{ color: "var(--muted-2)", marginTop: 8, fontSize: 12 }}>
                  Status:{" "}
                  <b>{coverage?.all_addressed ? "All abnormalities addressed" : "Missing coverage"}</b>
                </div>
                {coverage?.missing?.length ? (
                  <div style={{ marginTop: 6, color: "#b45309", fontSize: 12 }}>
                    Missing: {coverage.missing.join(", ")}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

          <div style={{ marginTop: 12, color: "var(--muted-2)", fontSize: 12 }}>
            Note: If no lab values are detected, the PDF may be scanned and require OCR (not enabled).
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: "var(--ink)" }}>{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          padding: "10px 10px",
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--ink)",
          fontWeight: 800,
          outline: "none",
        }}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: "var(--ink)" }}>{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "10px 10px",
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--ink)",
          fontWeight: 800,
          outline: "none",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const th: React.CSSProperties = {
  padding: "10px 8px",
  fontSize: 12,
  letterSpacing: 0.2,
  textTransform: "uppercase",
  color: "var(--muted)",
};

const td: React.CSSProperties = {
  padding: "10px 8px",
  color: "var(--ink)",
  verticalAlign: "top",
};

const tdMuted: React.CSSProperties = {
  padding: "10px 8px",
  color: "var(--muted)",
  verticalAlign: "top",
  fontWeight: 700,
};

const tdStrong: React.CSSProperties = {
  padding: "10px 8px",
  color: "var(--ink)",
  verticalAlign: "top",
  fontWeight: 900,
};
