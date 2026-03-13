// frontend/src/pages/Calculators.tsx
// Clinova -- 335 Clinical Calculators — "Precision Medical Instrument" design
import React, { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ALL_CALCULATORS, SPECIALTIES } from "../data/calculators_index";
import type { Calculator } from "../data/calculators_index";
import CalculatorDetail from "./CalculatorDetail";

const DARK_TEAL = "#0a4a44";
const TEAL = "#0f766e";

/* ── helpers ── */
function calcNum(id: string): string {
  return id.replace("calc_", "").replace(/^0+/, "") || "1";
}

function calcNumPadded(id: string): string {
  return "#" + id.replace("calc_", "");
}

/** Extract a short formula-like preview from the calculator description */
function formulaPreview(calc: Calculator): string {
  // Try to find a formula-like string in the reference or build one from inputs
  const inputNames = calc.inputs.slice(0, 3).map((i) => i.label.split(" ")[0]);
  if (inputNames.length === 0) return calc.specialty;
  return "f(" + inputNames.join(", ") + (calc.inputs.length > 3 ? ", ..." : "") + ")";
}

/* ── Sidebar list item ── */
function CalcListItem({
  calc,
  active,
  onClick,
}: {
  calc: Calculator;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="calc-list-item"
      data-active={active}
      onClick={onClick}
    >
      <span className="calc-list-dot" />
      <span className="calc-list-num">{calcNum(calc.id)}</span>
      <span className="calc-list-name">{calc.name}</span>
    </button>
  );
}

/* ── Calculator card ── */
function CalcCard({
  calc,
  onClick,
}: {
  calc: Calculator;
  onClick: () => void;
}) {
  return (
    <button className="calc-card" onClick={onClick}>
      <span className="calc-card-id">{calcNumPadded(calc.id)}</span>
      <div className="calc-card-name">{calc.name}</div>
      <div className="calc-card-desc">{calc.description}</div>
      <div className="calc-card-formula">{formulaPreview(calc)}</div>
      <span className="calc-card-chip">{calc.specialty}</span>
    </button>
  );
}

/* ── Search icon (inline SVG) ── */
function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="rgba(255,255,255,0.5)"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

/* ── Arrow icons ── */
function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

/* ════════════════════════════════════════════════ */
/*                   MAIN PAGE                     */
/* ════════════════════════════════════════════════ */

export default function Calculators() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [specialty, setSpecialty] = useState<string>("All");
  const [search, setSearch] = useState("");
  const detailRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    return ALL_CALCULATORS.filter((c) => {
      const matchSpec = specialty === "All" || c.specialty === specialty;
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.specialty.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.id.includes(q);
      return matchSpec && matchSearch;
    });
  }, [specialty, search]);

  const selectedCalc = selectedId
    ? ALL_CALCULATORS.find((c) => c.id === selectedId) ?? null
    : null;

  useEffect(() => {
    if (selectedCalc && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedId]);

  useEffect(() => {
    if (selectedCalc && !filtered.find((c) => c.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filtered, selectedCalc, selectedId]);

  const filteredForList = selectedCalc ? filtered : filtered.slice(0, 60);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f7f8fa",
        paddingBottom: 90,
        display: "flex",
        flexDirection: "column",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* ═══ HERO HEADER ═══ */}
      <div className="calc-hero" style={{ padding: "0 24px" }}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            position: "relative",
            zIndex: 1,
            padding: "32px 0 28px",
          }}
        >
          {/* Nav breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <button
              onClick={() => navigate("/")}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 6,
                color: "rgba(255,255,255,0.7)",
                padding: "5px 12px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.15)";
                e.currentTarget.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                e.currentTarget.style.color = "rgba(255,255,255,0.7)";
              }}
            >
              Home
            </button>
            {selectedCalc && (
              <>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>/</span>
                <button
                  onClick={() => setSelectedId(null)}
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 6,
                    color: "rgba(255,255,255,0.7)",
                    padding: "5px 12px",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.15)";
                    e.currentTarget.style.color = "#fff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                    e.currentTarget.style.color = "rgba(255,255,255,0.7)";
                  }}
                >
                  All Calculators
                </button>
              </>
            )}
          </div>

          {/* Title block */}
          <h1
            style={{
              margin: 0,
              fontSize: 36,
              fontWeight: 400,
              letterSpacing: -0.8,
              color: "#fff",
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              lineHeight: 1.15,
            }}
          >
            Clinical Calculators
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 14,
              color: "rgba(255,255,255,0.5)",
              fontWeight: 500,
              letterSpacing: 0.3,
            }}
          >
            {ALL_CALCULATORS.length} validated calculators
            <span style={{ margin: "0 8px", opacity: 0.3 }}>|</span>
            100% offline
            <span style={{ margin: "0 8px", opacity: 0.3 }}>|</span>
            Evidence-based
          </p>

          {/* Search */}
          <div style={{ marginTop: 20, position: "relative", maxWidth: 520 }}>
            <SearchIcon />
            <input
              type="text"
              className="calc-search"
              placeholder={`Search ${ALL_CALCULATORS.length} calculators...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "13px 18px 13px 42px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                fontSize: 15,
                fontWeight: 500,
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "'DM Sans', sans-serif",
                transition: "all 0.2s ease",
              }}
            />
          </div>
        </div>
      </div>

      {/* ═══ SPECIALTY TABS ═══ */}
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          padding: "12px 24px",
          overflowX: "auto",
        }}
        className="calc-tabs"
        ref={tabsRef}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "flex",
            gap: 7,
            flexWrap: "nowrap",
          }}
        >
          <button
            className="calc-tab"
            data-active={specialty === "All"}
            onClick={() => setSpecialty("All")}
          >
            All
            <span className="calc-tab-count">{ALL_CALCULATORS.length}</span>
          </button>
          {SPECIALTIES.map((s) => (
            <button
              key={s.name}
              className="calc-tab"
              data-active={specialty === s.name}
              onClick={() => setSpecialty(s.name)}
            >
              {s.name}
              <span className="calc-tab-count">{s.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ═══ BODY ═══ */}
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "24px 24px 0",
          display: "flex",
          gap: 24,
          width: "100%",
          boxSizing: "border-box",
          flex: 1,
        }}
      >
        {/* ── LEFT SIDEBAR ── */}
        <aside className="calc-sidebar">
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              padding: "8px 6px",
              display: "flex",
              flexDirection: "column",
              gap: 0,
            }}
          >
            <div
              style={{
                padding: "6px 10px 8px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#9ca3af",
                borderBottom: "1px solid #f3f4f6",
                marginBottom: 4,
              }}
            >
              {specialty === "All" ? "All" : specialty}
              <span style={{ marginLeft: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 9 }}>
                ({filtered.length})
              </span>
            </div>

            {filtered.length === 0 && (
              <div
                style={{
                  padding: "20px 12px",
                  textAlign: "center",
                  color: "#9ca3af",
                  fontSize: 13,
                }}
              >
                No calculators match.
              </div>
            )}
            {filteredForList.map((calc) => (
              <CalcListItem
                key={calc.id}
                calc={calc}
                active={selectedCalc?.id === calc.id}
                onClick={() => setSelectedId(calc.id)}
              />
            ))}
            {!selectedCalc && filtered.length > 60 && (
              <div
                style={{
                  padding: "10px 12px",
                  textAlign: "center",
                  color: "#9ca3af",
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {filteredForList.length} of {filtered.length} shown
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: 14,
              padding: "10px 12px",
              background: "#fff",
              borderRadius: 10,
              fontSize: 11,
              color: "#9ca3af",
              borderLeft: `3px solid ${DARK_TEAL}`,
              lineHeight: 1.5,
              border: "1px solid #e5e7eb",
              borderLeftColor: DARK_TEAL,
              borderLeftWidth: 3,
            }}
          >
            <strong style={{ color: "#374151" }}>Clinical Note</strong>
            <br />
            All calculations use validated formulas. Always verify results in clinical context.
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main style={{ flex: 1, minWidth: 0 }}>
          {selectedCalc ? (
            <div ref={detailRef}>
              {/* Calculator detail header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  marginBottom: 20,
                  paddingBottom: 18,
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                <span
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: DARK_TEAL,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    fontWeight: 800,
                    flexShrink: 0,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {calcNum(selectedCalc.id)}
                </span>
                <div style={{ flex: 1 }}>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 24,
                      fontWeight: 400,
                      color: "var(--text-primary)",
                      letterSpacing: -0.5,
                      fontFamily: "var(--font-display)",
                      fontStyle: "italic",
                      lineHeight: 1.2,
                    }}
                  >
                    {selectedCalc.name}
                  </h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <span className="calc-card-chip">{selectedCalc.specialty}</span>
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 11,
                        color: "#9ca3af",
                      }}
                    >
                      {calcNumPadded(selectedCalc.id)}
                    </span>
                  </div>
                </div>

                {/* Prev / Next */}
                <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                  {(() => {
                    const idx = filtered.indexOf(selectedCalc);
                    return (
                      <>
                        {idx > 0 && (
                          <button
                            onClick={() => setSelectedId(filtered[idx - 1].id)}
                            title="Previous"
                            style={{
                              padding: "7px 10px",
                              borderRadius: 8,
                              border: "1px solid #e5e7eb",
                              background: "#fff",
                              cursor: "pointer",
                              color: "#6b7280",
                              display: "flex",
                              alignItems: "center",
                              transition: "all 0.12s",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = DARK_TEAL; e.currentTarget.style.color = DARK_TEAL; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.color = "#6b7280"; }}
                          >
                            <ChevronLeft />
                          </button>
                        )}
                        {idx < filtered.length - 1 && (
                          <button
                            onClick={() => setSelectedId(filtered[idx + 1].id)}
                            title="Next"
                            style={{
                              padding: "7px 10px",
                              borderRadius: 8,
                              border: "1px solid #e5e7eb",
                              background: "#fff",
                              cursor: "pointer",
                              color: "#6b7280",
                              display: "flex",
                              alignItems: "center",
                              transition: "all 0.12s",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = DARK_TEAL; e.currentTarget.style.color = DARK_TEAL; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.color = "#6b7280"; }}
                          >
                            <ChevronRight />
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Calculator form wrapper */}
              <div
                style={{
                  background: "#fff",
                  borderRadius: 14,
                  border: "1px solid #e5e7eb",
                  padding: "24px",
                  boxShadow: "0 2px 12px rgba(10,74,68,0.04)",
                }}
              >
                <CalculatorDetail key={selectedCalc.id} calc={selectedCalc} />
              </div>
            </div>
          ) : (
            /* ═══ CARD GRID ═══ */
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: "#111827",
                      letterSpacing: -0.3,
                    }}
                  >
                    {specialty === "All" ? "All Calculators" : specialty}
                  </span>
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 13,
                      color: "#9ca3af",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {filtered.length}
                  </span>
                </div>
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    style={{
                      fontSize: 12,
                      color: DARK_TEAL,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontWeight: 600,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Clear search
                  </button>
                )}
              </div>
              <div className="calc-grid">
                {filtered.map((calc) => (
                  <CalcCard
                    key={calc.id}
                    calc={calc}
                    onClick={() => setSelectedId(calc.id)}
                  />
                ))}
              </div>
              {filtered.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "60px 20px",
                    color: "#9ca3af",
                  }}
                >
                  <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>0</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>No calculators found</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>Try adjusting your search or filter</div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
