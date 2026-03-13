// frontend/src/pages/HomeSearch.tsx
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cleanTopicTitle, suggestByCollection } from "../api/topic";
import type { CollectionKey } from "../api/topic";
import SidebarNav from "../components/SidebarNav";
import AutocompleteDropdown, { AutocompleteItem } from "../components/AutocompleteDropdown";
import { ALL_CALCULATORS } from "../data/calculators_index";

// ─── Emergency quick-access pills ─────────────────────────────────────

const EMERGENCY_ITEMS = [
  { label: "Snake Bite",  id: "snake-bite" },
  { label: "Acute MI",    id: "acute-mi" },
  { label: "Stroke",      id: "stroke" },
  { label: "Anaphylaxis", id: "anaphylaxis" },
  { label: "Seizure",     id: "status-epilepticus" },
  { label: "PPH",         id: "obstetric-emergency" },
];

function EmergencyPills() {
  const navigate = useNavigate();
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {EMERGENCY_ITEMS.map((item) => (
        <button
          key={item.id}
          onClick={() => navigate(`/emergency/${item.id}`)}
          style={{
            padding: "6px 14px",
            borderRadius: 999,
            border: "1.5px solid rgba(15,118,110,0.3)",
            background: "transparent",
            color: "var(--teal-700)",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 12,
            transition: "all 0.15s ease",
            fontFamily: "var(--font-sans)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--teal-700)";
            e.currentTarget.style.color = "#fff";
            e.currentTarget.style.borderColor = "var(--teal-700)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--teal-700)";
            e.currentTarget.style.borderColor = "rgba(15,118,110,0.3)";
          }}
        >
          {item.label}
        </button>
      ))}
      <button
        onClick={() => navigate("/emergency")}
        style={{
          padding: "6px 14px",
          borderRadius: 999,
          border: "none",
          background: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          fontWeight: 500,
          fontSize: 12,
          textDecoration: "underline",
          textDecorationColor: "var(--border)",
        }}
      >
        All protocols →
      </button>
    </div>
  );
}

// ─── Stats grid ──────────────────────────────────────────────────────

interface BackendStats {
  treatment_conditions: number;
  drugs: number;
  drug_interaction_rules: number;
  emergency_protocols: number;
  topics: number;
  cme_courses: number;
  clinical_pearls: number;
  quiz_questions: number;
}

function useBackendStats() {
  const [data, setData] = useState<BackendStats | null>(null);
  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => setData(null));
  }, []);
  return data;
}

function StatsGrid() {
  const navigate = useNavigate();
  const backend = useBackendStats();
  const calculatorCount = ALL_CALCULATORS.length;

  const stats = [
    { label: "Topics",            value: backend?.topics ?? null,              path: "/topics" },
    { label: "Calculators",       value: calculatorCount,                      path: "/calculators" },
    { label: "Drug Database",     value: backend?.drugs ?? null,               path: "/drug" },
    { label: "Emergency Protocols", value: backend?.emergency_protocols ?? null, path: "/emergency" },
  ];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 14,
      marginBottom: 28,
    }}>
      {stats.map((s) => (
        <button
          key={s.label}
          onClick={() => navigate(s.path)}
          style={{
            padding: "20px 16px",
            border: "1px solid var(--border)",
            borderRadius: 12,
            background: "#fff",
            cursor: "pointer",
            textAlign: "left",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--brand-border)";
            e.currentTarget.style.boxShadow = "0 4px 16px rgba(15,118,110,0.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 28,
            fontWeight: 600,
            color: "var(--teal-700)",
            letterSpacing: -1,
            marginBottom: 4,
            lineHeight: 1,
          }}>
            {s.value != null ? s.value.toLocaleString() + "+" : "—"}
          </div>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", marginTop: 6 }}>
            {s.label}
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Today's Pearl ──────────────────────────────────────────────────

function TodayPearlCard() {
  const navigate = useNavigate();
  const [pearl, setPearl] = useState<{ title: string; category: string; pearl: string } | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/learning/pearl/today")
      .then((r) => r.json())
      .then((d) => setPearl(d.pearl))
      .catch(() => {});
  }, []);

  if (!pearl) return null;

  return (
    <div style={{
      background: "#fff",
      borderRadius: 12,
      border: "1px solid var(--border)",
      borderLeft: "3px solid var(--teal-700)",
      padding: "16px 20px",
      marginTop: 24,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
            background: "var(--teal-50)", color: "var(--teal-700)", letterSpacing: 0.5,
            textTransform: "uppercase",
          }}>
            {pearl.category}
          </span>
          <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text-secondary)" }}>
            Today's Clinical Pearl
          </span>
        </div>
        <button
          onClick={() => navigate("/learning")}
          style={{ fontSize: 12, fontWeight: 600, color: "var(--teal-700)", background: "none", border: "none", cursor: "pointer" }}
        >
          More →
        </button>
      </div>
      <div style={{
        fontWeight: 600, fontSize: 14, color: "var(--text-primary)", marginBottom: 6,
        fontFamily: "var(--font-display)",
      }}>
        {pearl.title}
      </div>
      <div style={{
        fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6,
        display: expanded ? "block" : "-webkit-box",
        WebkitLineClamp: expanded ? "unset" : 2,
        WebkitBoxOrient: "vertical" as React.CSSProperties["WebkitBoxOrient"],
        overflow: expanded ? "visible" : "hidden",
      }}>
        {pearl.pearl}
      </div>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{ marginTop: 6, fontSize: 12, color: "var(--teal-700)", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 600 }}
      >
        {expanded ? "Show less" : "Read more"}
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────

export default function HomeSearch() {
  const navigate = useNavigate();

  const [collection] = useState<CollectionKey>("medicine");
  const [query, setQuery] = useState("");

  const fetchSuggestions = useCallback(
    async (q: string, signal: AbortSignal): Promise<AutocompleteItem[]> => {
      const [harrisonList, topicsRes, semanticRes] = await Promise.allSettled([
        suggestByCollection(collection, q.trim(), 40, signal),
        fetch(`/api/topics/search?q=${encodeURIComponent(q.trim())}`, { signal })
          .then((r) => r.ok ? r.json() : { results: [] })
          .catch(() => ({ results: [] })),
        fetch(`/api/search/semantic?q=${encodeURIComponent(q.trim())}&limit=5`, { signal })
          .then((r) => r.ok ? r.json() : { results: [] })
          .catch(() => ({ results: [] })),
      ]);

      const harrisonItems: AutocompleteItem[] = harrisonList.status === "fulfilled"
        ? harrisonList.value.map((text, idx) => ({
            id: `harrison-${idx}-${text}`,
            text: cleanTopicTitle(text),
          }))
        : [];

      const structuredTopics: AutocompleteItem[] = topicsRes.status === "fulfilled"
        ? (topicsRes.value.results ?? []).map((t: { slug: string; title: string; icd10?: string }) => ({
            id: `topic-${t.slug}`,
            text: t.title,
            subtitle: t.icd10 ?? undefined,
            badge: "TOPIC",
            href: `/topics/${t.slug}`,
          }))
        : [];

      const semanticItems: AutocompleteItem[] = semanticRes.status === "fulfilled"
        ? (semanticRes.value.results ?? []).map((r: { title: string; score: number }, idx: number) => ({
            id: `semantic-${idx}-${r.title}`,
            text: cleanTopicTitle(r.title),
          }))
        : [];

      const seen = new Set<string>();
      const deduped: AutocompleteItem[] = [];

      for (const item of [...structuredTopics, ...harrisonItems, ...semanticItems]) {
        const key = item.text.toLowerCase();
        if (seen.has(key) || !item.text.trim()) continue;
        seen.add(key);
        deduped.push(item);
      }

      return deduped.slice(0, 12);
    },
    [collection]
  );

  function goToTopic(rawTitle: string) {
    const cleaned = cleanTopicTitle(rawTitle);
    if (!cleaned) return;
    navigate(`/topic/${collection}?q=${encodeURIComponent(cleaned)}`);
  }

  const handleSelect = useCallback(
    (item: AutocompleteItem) => {
      if (item.href) {
        navigate(item.href);
      } else {
        goToTopic(item.text);
      }
    },
    [collection, navigate]
  );

  const handleSubmit = useCallback(
    (value: string) => { if (value.trim()) goToTopic(value); },
    [collection, navigate]
  );

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-base)",
      display: "flex",
    }}>
      {/* Sidebar */}
      <div className="sidebar-collapse" style={{ width: 240, minWidth: 240, minHeight: "100vh" }}>
        <SidebarNav />
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* ── HERO SECTION ── */}
        <div className="hero-section" style={{ padding: "0 40px" }}>
          <div style={{
            maxWidth: 800,
            position: "relative",
            zIndex: 1,
            padding: "48px 0 40px",
          }}>
            <h1 style={{
              margin: 0,
              fontSize: 48,
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              color: "#fff",
              letterSpacing: -1,
              lineHeight: 1.1,
            }}>
              Clinova
            </h1>
            <p style={{
              margin: "8px 0 0",
              fontSize: 15,
              color: "rgba(255,255,255,0.5)",
              fontWeight: 500,
              letterSpacing: 0.3,
            }}>
              Evidence-based medicine, point of care
            </p>

            {/* Search bar */}
            <div style={{
              marginTop: 28,
              background: "#fff",
              borderRadius: 14,
              padding: "6px 6px 6px 0",
              boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              <div style={{ flex: 1 }}>
                <AutocompleteDropdown
                  query={query}
                  value={query}
                  onChange={setQuery}
                  fetchSuggestions={fetchSuggestions}
                  onSelect={handleSelect}
                  onSubmit={handleSubmit}
                  minChars={2}
                  debounceMs={200}
                  maxItems={12}
                  placeholder="Search conditions, drugs, protocols..."
                  inputStyle={{
                    padding: "14px 18px",
                    fontSize: 15,
                    borderRadius: 10,
                    border: "none",
                    outline: "none",
                    width: "100%",
                    fontWeight: 500,
                  }}
                />
              </div>
              <button
                onClick={() => handleSubmit(query)}
                disabled={!query.trim()}
                style={{
                  padding: "12px 24px",
                  borderRadius: 10,
                  border: "none",
                  background: query.trim() ? "var(--teal-700)" : "var(--bg-raised)",
                  color: query.trim() ? "#fff" : "var(--text-subtle)",
                  cursor: query.trim() ? "pointer" : "not-allowed",
                  fontWeight: 600,
                  fontSize: 14,
                  transition: "background 0.15s ease",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                Search
              </button>
            </div>
          </div>
        </div>

        {/* ── CONTENT BELOW HERO ── */}
        <div style={{ padding: "28px 40px 80px", maxWidth: 860 }}>

          {/* Emergency protocols */}
          <div style={{ marginBottom: 28 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-muted)",
              letterSpacing: 0.8,
              textTransform: "uppercase",
              marginBottom: 10,
            }}>
              Emergency Protocols
            </div>
            <EmergencyPills />
          </div>

          {/* Stats grid */}
          <StatsGrid />

          {/* Popular Topics */}
          <div>
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-muted)",
              letterSpacing: 0.8,
              textTransform: "uppercase",
              marginBottom: 10,
            }}>
              Popular Topics
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[
                "Hypertension", "Type 2 Diabetes", "Epilepsy", "Pneumonia",
                "Heart Failure", "Asthma", "COPD", "Anemia",
                "Hypothyroidism", "Hyperlipidemia",
              ].map((topic) => (
                <button
                  key={topic}
                  onClick={() => goToTopic(topic)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "#fff",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    fontWeight: 500,
                    fontSize: 13,
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--teal-700)";
                    e.currentTarget.style.color = "#fff";
                    e.currentTarget.style.borderColor = "var(--teal-700)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#fff";
                    e.currentTarget.style.color = "var(--text-secondary)";
                    e.currentTarget.style.borderColor = "var(--border)";
                  }}
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>

          {/* Today's Pearl */}
          <TodayPearlCard />
        </div>
      </div>
    </div>
  );
}
