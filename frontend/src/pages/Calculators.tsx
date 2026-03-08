// frontend/src/pages/Calculators.tsx
// Clinova — Clinical Calculator Hub
import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CALCULATORS } from "../components/calculators/index";

type Calc = (typeof CALCULATORS)[number];

const ALL_CATEGORIES = ["All", ...Array.from(new Set(CALCULATORS.map((c) => c.category)))];

function CalcCard({
  calc,
  active,
  onClick,
}: {
  calc: Calc;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const highlighted = active || hovered;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`Open ${calc.title} calculator`}
      aria-pressed={active}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "12px 14px",
        borderRadius: 12,
        border: active
          ? "2px solid var(--primary)"
          : hovered
          ? "2px solid var(--border)"
          : "2px solid transparent",
        background: active
          ? "linear-gradient(135deg, rgba(10,110,94,0.12), rgba(10,110,94,0.06))"
          : hovered
          ? "var(--surface-2)"
          : "transparent",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 10,
        transition: "all 0.15s ease",
        transform: highlighted ? "translateX(2px)" : "none",
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{calc.emoji}</span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: active ? 700 : 600,
            fontSize: 13,
            color: active ? "var(--primary)" : "var(--ink)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {calc.title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: active ? "var(--primary)" : "var(--muted-2)",
            marginTop: 2,
            opacity: 0.85,
          }}
        >
          {calc.category}
        </div>
      </div>
      {active && (
        <span
          style={{
            marginLeft: "auto",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--primary)",
            flexShrink: 0,
          }}
        />
      )}
    </button>
  );
}

export default function Calculators() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string>(CALCULATORS[0].id);
  const [category, setCategory] = useState<string>("All");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return CALCULATORS.filter((c) => {
      const matchCat = category === "All" || c.category === category;
      const q = search.trim().toLowerCase();
      const matchSearch = !q || c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [category, search]);

  const selected = CALCULATORS.find((c) => c.id === selectedId) ?? CALCULATORS[0];
  const SelectedComponent = selected.component as React.ComponentType;

  // If filtered list doesn't contain selected, auto-select first visible
  const visibleIds = new Set(filtered.map((c) => c.id));
  const effectiveSelected =
    visibleIds.has(selectedId) ? selected : filtered[0] ?? CALCULATORS[0];
  const EffectiveComponent = effectiveSelected.component as React.ComponentType;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--page-bg, #F8FAFB)",
        paddingBottom: 80,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          background: "linear-gradient(135deg, #064038 0%, var(--primary) 60%, #0A8070 100%)",
          padding: "28px 24px 24px",
          color: "#fff",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <button
              onClick={() => navigate("/")}
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
              ← Home
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 40 }}>🧮</span>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: -0.5 }}>
                Clinical Calculator Hub
              </h1>
              <p style={{ margin: "5px 0 0", fontSize: 14, opacity: 0.85 }}>
                {CALCULATORS.length} validated calculators — BMI, GFR, APGAR, Wells, CURB-65, GCS &amp; more
              </p>
            </div>
          </div>

          {/* Search bar */}
          <div style={{ marginTop: 16, position: "relative" }}>
            <input
              type="text"
              placeholder="Search calculators…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                maxWidth: 440,
                padding: "10px 16px 10px 38px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.35)",
                background: "rgba(255,255,255,0.15)",
                color: "#fff",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 16,
                opacity: 0.7,
                pointerEvents: "none",
              }}
            >
              🔍
            </span>
          </div>
        </div>
      </div>

      {/* ── Body: sidebar + main ── */}
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "24px 24px 0",
          display: "flex",
          gap: 20,
          width: "100%",
          boxSizing: "border-box",
          flex: 1,
        }}
      >
        {/* ── Left panel: category chips + calc list ── */}
        <aside
          style={{
            width: 230,
            flexShrink: 0,
            position: "sticky",
            top: 22,
            alignSelf: "flex-start",
          }}
        >
          {/* Category chips */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginBottom: 14,
            }}
          >
            {ALL_CATEGORIES.map((cat) => {
              const active = category === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: active ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
                    background: active ? "var(--primary)" : "transparent",
                    color: active ? "#fff" : "var(--muted)",
                    fontSize: 11,
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                    transition: "all 0.12s ease",
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Calculator list */}
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 14,
              border: "1px solid var(--border)",
              padding: "8px 6px",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {filtered.length === 0 && (
              <div
                style={{
                  padding: "20px 12px",
                  textAlign: "center",
                  color: "var(--muted-2)",
                  fontSize: 13,
                }}
              >
                No calculators match.
              </div>
            )}
            {filtered.map((calc) => (
              <CalcCard
                key={calc.id}
                calc={calc}
                active={effectiveSelected.id === calc.id}
                onClick={() => setSelectedId(calc.id)}
              />
            ))}
          </div>

          {/* Legend note */}
          <div
            style={{
              marginTop: 14,
              padding: "10px 12px",
              background: "var(--surface-2)",
              borderRadius: 10,
              fontSize: 11,
              color: "var(--muted)",
              borderLeft: "3px solid var(--amber)",
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: "var(--ink)" }}>Note:</strong> All calculations are
            based on validated clinical formulas. Always verify for each patient's
            individual context.
          </div>
        </aside>

        {/* ── Right panel: active calculator ── */}
        <main
          style={{
            flex: 1,
            minWidth: 0,
          }}
        >
          {/* Calculator header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 18,
              paddingBottom: 16,
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: 32 }}>{effectiveSelected.emoji}</span>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 800,
                  color: "var(--ink)",
                  letterSpacing: -0.3,
                }}
              >
                {effectiveSelected.title}
              </h2>
              <span
                style={{
                  display: "inline-block",
                  marginTop: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "rgba(10,110,94,0.1)",
                  color: "var(--primary)",
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                }}
              >
                {effectiveSelected.category}
              </span>
            </div>

            {/* Keyboard nav hint */}
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              {CALCULATORS.indexOf(effectiveSelected) > 0 && (
                <button
                  onClick={() => {
                    const idx = CALCULATORS.indexOf(effectiveSelected);
                    setSelectedId(CALCULATORS[idx - 1].id);
                  }}
                  title="Previous calculator"
                  style={{
                    padding: "5px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    cursor: "pointer",
                    fontSize: 14,
                    color: "var(--muted)",
                  }}
                >
                  ‹
                </button>
              )}
              {CALCULATORS.indexOf(effectiveSelected) < CALCULATORS.length - 1 && (
                <button
                  onClick={() => {
                    const idx = CALCULATORS.indexOf(effectiveSelected);
                    setSelectedId(CALCULATORS[idx + 1].id);
                  }}
                  title="Next calculator"
                  style={{
                    padding: "5px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    cursor: "pointer",
                    fontSize: 14,
                    color: "var(--muted)",
                  }}
                >
                  ›
                </button>
              )}
              <span style={{ fontSize: 12, color: "var(--muted-2)" }}>
                {CALCULATORS.indexOf(effectiveSelected) + 1} / {CALCULATORS.length}
              </span>
            </div>
          </div>

          {/* Rendered calculator component */}
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 16,
              border: "1px solid var(--border)",
              padding: "24px 24px",
              boxShadow: "0 4px 20px rgba(10,110,94,0.06)",
            }}
          >
            <EffectiveComponent />
          </div>

          {/* Quick-jump grid (all calcs thumbnails) */}
          <div style={{ marginTop: 28 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--muted)",
                letterSpacing: 0.8,
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              All Calculators
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: 10,
              }}
            >
              {CALCULATORS.map((calc) => {
                const isActive = effectiveSelected.id === calc.id;
                return (
                  <button
                    key={calc.id}
                    onClick={() => setSelectedId(calc.id)}
                    style={{
                      padding: "12px 10px",
                      borderRadius: 12,
                      border: isActive
                        ? "2px solid var(--primary)"
                        : "1px solid var(--border)",
                      background: isActive
                        ? "linear-gradient(135deg, rgba(10,110,94,0.1), rgba(10,110,94,0.04))"
                        : "var(--surface)",
                      cursor: "pointer",
                      textAlign: "center",
                      transition: "all 0.12s ease",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 24 }}>{calc.emoji}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? "var(--primary)" : "var(--ink)",
                        lineHeight: 1.3,
                        textAlign: "center",
                      }}
                    >
                      {calc.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
