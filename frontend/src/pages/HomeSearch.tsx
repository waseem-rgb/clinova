// frontend/src/pages/HomeSearch.tsx
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cleanTopicTitle, suggestByCollection } from "../api/topic";
import type { CollectionKey } from "../api/topic";
import SidebarNav from "../components/SidebarNav";
import AutocompleteDropdown, { AutocompleteItem } from "../components/AutocompleteDropdown";

// ─── Emergency quick-access (text links) ─────────────────────────────────────

const EMERGENCY_ITEMS = [
  { label: "Snake Bite",  id: "snake-bite" },
  { label: "Acute MI",    id: "acute-mi" },
  { label: "Stroke",      id: "stroke" },
  { label: "Anaphylaxis", id: "anaphylaxis" },
  { label: "Seizure",     id: "status-epilepticus" },
  { label: "PPH",         id: "obstetric-emergency" },
];

function EmergencyLinks() {
  const navigate = useNavigate();
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        color: "var(--text-muted)",
        letterSpacing: 0.7,
        textTransform: "uppercase",
        marginBottom: 8,
      }}>
        Emergency Protocols
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {EMERGENCY_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(`/emergency/${item.id}`)}
            style={{
              padding: "5px 12px",
              borderRadius: 4,
              border: "1px solid var(--critical-border)",
              background: "transparent",
              color: "var(--critical)",
              cursor: "pointer",
              fontWeight: 500,
              fontSize: 12,
              transition: "background 0.12s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--critical-light)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            {item.label}
          </button>
        ))}
        <button
          onClick={() => navigate("/emergency")}
          style={{
            padding: "5px 12px",
            borderRadius: 4,
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
          All protocols
        </button>
      </div>
    </div>
  );
}

// ─── Stats grid (DM Mono numbers) ─────────────────────────────────────────────

function StatsGrid() {
  const navigate = useNavigate();
  const stats = [
    { label: "Calculators",      value: "11",  sub: "BMI, GFR, APGAR, CURB-65…",    path: "/calculators" },
    { label: "Treatment Guides", value: "30+", sub: "Diagnoses with regimens",        path: "/treatment" },
    { label: "Drug Interactions",value: "50+", sub: "Checked instantly",              path: "/interactions" },
    { label: "CME Courses",      value: "5",   sub: "Courses · Quizzes · Badges",     path: "/learning" },
  ];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      overflow: "hidden",
      marginBottom: 28,
    }}>
      {stats.map((s, i) => (
        <button
          key={s.label}
          onClick={() => navigate(s.path)}
          style={{
            padding: "16px 14px",
            border: "none",
            borderLeft: i > 0 ? "1px solid var(--border)" : "none",
            background: "var(--bg-surface)",
            cursor: "pointer",
            textAlign: "left",
            transition: "background 0.12s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-raised)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-surface)"; }}
        >
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 22,
            fontWeight: 500,
            color: "var(--brand)",
            letterSpacing: -0.5,
            marginBottom: 4,
          }}>
            {s.value}
          </div>
          <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-primary)", marginBottom: 2 }}>
            {s.label}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-subtle)" }}>
            {s.sub}
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Today's Pearl mini-card ──────────────────────────────────────────────────

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
      background: "var(--bg-surface)",
      borderRadius: 8,
      border: "1px solid var(--border)",
      borderLeft: "3px solid var(--brand)",
      padding: "14px 16px",
      marginTop: 20,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4,
            background: "var(--brand-light)", color: "var(--brand)", letterSpacing: 0.5,
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
          style={{ fontSize: 11, fontWeight: 500, color: "var(--brand)", background: "none", border: "none", cursor: "pointer" }}
        >
          More →
        </button>
      </div>
      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", marginBottom: 4 }}>
        {pearl.title}
      </div>
      <div style={{
        fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55,
        display: expanded ? "block" : "-webkit-box",
        WebkitLineClamp: expanded ? "unset" : 2,
        WebkitBoxOrient: "vertical" as React.CSSProperties["WebkitBoxOrient"],
        overflow: expanded ? "visible" : "hidden",
      }}>
        {pearl.pearl}
      </div>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{ marginTop: 5, fontSize: 11, color: "var(--brand)", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 500 }}
      >
        {expanded ? "Show less" : "Read more"}
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HomeSearch() {
  const navigate = useNavigate();

  const [collection] = useState<CollectionKey>("medicine");
  const [query, setQuery] = useState("");

  const fetchSuggestions = useCallback(
    async (q: string, signal: AbortSignal): Promise<AutocompleteItem[]> => {
      // Run Harrison index suggestions + structured topics search in parallel
      const [harrisonList, topicsRes] = await Promise.allSettled([
        suggestByCollection(collection, q.trim(), 40, signal),
        fetch(`/api/topics/search?q=${encodeURIComponent(q.trim())}`, { signal })
          .then((r) => r.ok ? r.json() : { results: [] })
          .catch(() => ({ results: [] })),
      ]);

      const harrisonItems: AutocompleteItem[] = harrisonList.status === "fulfilled"
        ? harrisonList.value.map((text, idx) => ({
            id: `harrison-${idx}-${text}`,
            text: cleanTopicTitle(text),
          }))
        : [];

      // Structured topics come first in the list, styled with a badge
      const structuredTopics: AutocompleteItem[] = topicsRes.status === "fulfilled"
        ? (topicsRes.value.results ?? []).map((t: { slug: string; title: string; icd10?: string }) => ({
            id: `topic-${t.slug}`,
            text: t.title,
            subtitle: t.icd10 ?? undefined,
            badge: "TOPIC",
            href: `/topics/${t.slug}`,
          }))
        : [];

      // De-duplicate: if a Harrison suggestion matches a structured topic title, drop the Harrison one
      const topicTitlesLower = new Set(structuredTopics.map((t) => t.text.toLowerCase()));
      const filteredHarrison = harrisonItems.filter(
        (item) => !topicTitlesLower.has(item.text.toLowerCase())
      );

      return [...structuredTopics, ...filteredHarrison].slice(0, 12);
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
      <div style={{ width: 240, minWidth: 240, minHeight: "100vh" }}>
        <SidebarNav />
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: "32px 40px 80px", maxWidth: 820 }}>

        {/* Page heading */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontSize: 32,
            fontWeight: 600,
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            color: "var(--text-primary)",
            letterSpacing: -0.5,
            marginBottom: 4,
          }}>
            Clinova
          </div>
          <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>
            Evidence-based medicine for every doctor, everywhere.
          </p>
        </div>

        {/* Emergency links */}
        <EmergencyLinks />

        {/* Search box */}
        <div style={{
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--bg-surface)",
          padding: "20px",
          marginBottom: 20,
          boxShadow: "var(--shadow-sm)",
        }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
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
                placeholder="Search conditions, drugs, protocols… (e.g. epilepsy, amoxicillin)"
                inputStyle={{ padding: "14px 16px", fontSize: 15, borderRadius: 6 }}
              />
            </div>
            <button
              onClick={() => handleSubmit(query)}
              disabled={!query.trim()}
              style={{
                padding: "14px 22px",
                borderRadius: 6,
                border: "none",
                background: query.trim() ? "var(--brand)" : "var(--bg-raised)",
                color: query.trim() ? "#fff" : "var(--text-subtle)",
                cursor: query.trim() ? "pointer" : "not-allowed",
                fontWeight: 600,
                fontSize: 14,
                transition: "background 0.15s ease",
                whiteSpace: "nowrap",
              }}
            >
              Search
            </button>
          </div>

          <div style={{ marginTop: 10, color: "var(--text-subtle)", fontSize: 11 }}>
            <kbd style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", padding: "1px 5px", borderRadius: 3, fontSize: 10 }}>↑↓</kbd>{" "}
            navigate ·{" "}
            <kbd style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", padding: "1px 5px", borderRadius: 3, fontSize: 10 }}>Enter</kbd>{" "}
            select ·{" "}
            <kbd style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", padding: "1px 5px", borderRadius: 3, fontSize: 10 }}>Esc</kbd>{" "}
            close
          </div>
        </div>

        {/* Stats grid */}
        <StatsGrid />

        {/* Popular Topics */}
        <div>
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--text-muted)",
            letterSpacing: 0.7,
            textTransform: "uppercase",
            marginBottom: 10,
          }}>
            Popular Topics
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[
              "Hypertension", "Type 2 Diabetes", "Epilepsy", "Pneumonia",
              "Heart Failure", "Asthma", "COPD", "Anemia",
              "Hypothyroidism", "Hyperlipidemia",
            ].map((topic) => (
              <button
                key={topic}
                onClick={() => goToTopic(topic)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 4,
                  border: "1px solid var(--border)",
                  background: "var(--bg-surface)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  fontWeight: 500,
                  fontSize: 12,
                  transition: "all 0.12s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--brand-border)";
                  e.currentTarget.style.color = "var(--brand)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                {topic}
              </button>
            ))}
          </div>
        </div>

        {/* Today's Pearl */}
        <TodayPearlCard />

        <div style={{ marginTop: 24, color: "var(--text-subtle)", fontSize: 10, textAlign: "center" }}>
          Powered by Harrison's Principles of Internal Medicine and other trusted medical references
        </div>
      </div>
    </div>
  );
}
