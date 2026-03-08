// frontend/src/pages/TopicDetail.tsx
// Clinova — Medical-grade structured topic page
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Bookmark } from "lucide-react";
import type { TopicContent, FeatureItem, SeverityLevel } from "../types/topic";
import LatestArticlesPanel from "../components/LatestArticlesPanel";
import { useTopicHistory } from "../hooks/useTopicHistory";

// ── Section components ────────────────────────────────────────────────────────
import ClinicalQuickView from "../components/TopicSections/ClinicalQuickView";
import RedFlagBanner     from "../components/TopicSections/RedFlagBanner";
import DiagnosticStepper from "../components/TopicSections/DiagnosticStepper";
import TreatmentByFacility from "../components/TopicSections/TreatmentByFacility";
import PearlsAndPitfalls from "../components/TopicSections/PearlsAndPitfalls";
import KeyTakeaway       from "../components/TopicSections/KeyTakeaway";
import InvestigationsTable from "../components/TopicSections/InvestigationsTable";
import DDxTable          from "../components/TopicSections/DDxTable";

// ── Tab configuration ─────────────────────────────────────────────────────────

const TABS = [
  { id: "quickview",       label: "Quick View" },
  { id: "definition",      label: "Definition & Etiology" },
  { id: "pathophysiology", label: "Pathophysiology" },
  { id: "features",        label: "Clinical Features" },
  { id: "diagnosis",       label: "Diagnosis" },
  { id: "treatment",       label: "Treatment" },
  { id: "pearls",          label: "Pearls & Pitfalls" },
  { id: "takeaway",        label: "Key Takeaway" },
] as const;

type TabId = typeof TABS[number]["id"];

// ── Evidence level badge ──────────────────────────────────────────────────────

const EV_COLORS: Record<string, string> = {
  A: "#2DA44E", B: "#58D4C4", C: "#8B949E", Expert: "#D97706",
};

function EvidenceBadge({ level }: { level: string }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
      padding: "2px 7px", borderRadius: 3,
      background: "transparent",
      border: `1px solid ${EV_COLORS[level] ?? "rgba(0,0,0,0.15)"}`,
      color: EV_COLORS[level] ?? "#8B949E",
      letterSpacing: 0.3,
    }}>
      Evidence {level}
    </span>
  );
}

// ── Section title ─────────────────────────────────────────────────────────────

function SectionTitle({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
      textTransform: "uppercase", color: "#8B949E",
      marginBottom: 12,
    }}>
      {label}
    </div>
  );
}

// ── Feature items renderer ────────────────────────────────────────────────────

function FeatureList({ items, label }: { items: FeatureItem[]; label: string }) {
  const SEVERITY_TAG: Record<string, { label: string; color: string }> = {
    mild:     { label: "Mild",     color: "#2DA44E" },
    moderate: { label: "Moderate", color: "#D97706" },
    severe:   { label: "Severe",   color: "#CF222E" },
    all:      { label: "",         color: "" },
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <SectionTitle label={label} />
      <div style={{ border: "1px solid #D0D7DE", borderRadius: 6, overflow: "hidden" }}>
        {items.map((item, i) => {
          const tag = SEVERITY_TAG[item.severity] ?? { label: "", color: "" };
          return (
            <div key={i} style={{
              display: "flex", gap: 10, alignItems: "flex-start",
              padding: "9px 12px",
              borderBottom: i < items.length - 1 ? "1px solid #F0F1F2" : "none",
              fontSize: 13,
            }}>
              <div style={{ flex: 1 }}>
                <span style={{ color: "#1A2B3C", lineHeight: 1.5 }}>{item.feature}</span>
                {item.note && (
                  <span style={{ color: "#8B949E", fontSize: 12, marginLeft: 8 }}>
                    — {item.note}
                  </span>
                )}
              </div>
              {tag.label && (
                <span style={{
                  fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3,
                  color: tag.color, border: `1px solid ${tag.color}`, opacity: 0.8,
                  flexShrink: 0, letterSpacing: 0.3, textTransform: "uppercase",
                }}>
                  {tag.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Severity table ────────────────────────────────────────────────────────────

function SeverityTable({ levels }: { levels: SeverityLevel[] }) {
  const BORDER: Record<string, string> = {
    mild: "#2DA44E", moderate: "#D97706", severe: "#CF222E",
  };
  return (
    <div>
      <SectionTitle label="Severity Classification" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {levels.map((level, i) => (
          <div key={i} style={{
            border: "1px solid #D0D7DE",
            borderLeft: `3px solid ${BORDER[level.level] ?? "rgba(0,0,0,0.15)"}`,
            borderRadius: "0 6px 6px 0",
            padding: "12px 14px",
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 5 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: 0.5, color: BORDER[level.level] ?? "#8B949E",
              }}>
                {level.level}
              </span>
              <span style={{ fontSize: 12.5, color: "#57606A", flex: 1 }}>
                {level.criteria}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: "#1A2B3C", lineHeight: 1.5 }}>
              <strong style={{ color: "#8B949E", fontWeight: 600 }}>Management: </strong>
              {level.management}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Loading / Error states ────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", padding: "60px 28px", textAlign: "center", color: "#8B949E", fontSize: 13 }}>
      Loading topic…
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", padding: "40px 28px" }}>
      <div style={{
        border: "1px solid rgba(207,34,46,0.2)",
        borderLeft: "3px solid #CF222E",
        borderRadius: "0 6px 6px 0",
        padding: "16px 18px",
        background: "rgba(207,34,46,0.03)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 13, color: "#CF222E", fontWeight: 500 }}>{message}</span>
        <button onClick={onRetry} style={{
          padding: "6px 14px", background: "#CF222E", color: "#fff",
          border: "none", borderRadius: 5, cursor: "pointer", fontSize: 12, fontWeight: 600,
        }}>
          Retry
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TopicDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { addToHistory, toggleBookmark, isBookmarked } = useTopicHistory();
  const [topic, setTopic] = useState<TopicContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("quickview");
  const tabBarRef = useRef<HTMLDivElement>(null);

  const loadTopic = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/topics/${slug}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? `Topic '${slug}' not found`);
      }
      const data: TopicContent = await res.json();
      setTopic(data);
      addToHistory({ slug, title: data.title, icd10: data.icd10, specialty: data.specialty });
    } catch (e: any) {
      setError(e.message ?? "Failed to load topic");
    } finally {
      setLoading(false);
    }
  }, [slug, addToHistory]);

  useEffect(() => { loadTopic(); }, [loadTopic]);

  // Read URL hash on load to restore active tab
  useEffect(() => {
    if (!topic) return;
    const hash = window.location.hash.slice(1) as TabId;
    if (hash && TABS.some((t) => t.id === hash)) {
      setActiveTab(hash);
    }
  }, [topic]);

  // Scroll active tab into view
  useEffect(() => {
    const bar = tabBarRef.current;
    if (!bar) return;
    const el = bar.querySelector(`[data-tab="${activeTab}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeTab]);

  // Tab change: update state + URL hash
  const handleTabChange = (tabId: TabId) => {
    setActiveTab(tabId);
    window.location.hash = tabId;
  };

  if (loading) return <LoadingState />;
  if (error || !topic) return <ErrorState message={error ?? "Topic not found"} onRetry={loadTopic} />;

  // ── Tab content renderer ──────────────────────────────────────────────────

  const renderTab = () => {
    switch (activeTab) {
      case "quickview":
        return <ClinicalQuickView data={topic.clinicalQuickView} />;

      case "definition":
        return (
          <div>
            <SectionTitle label="Definition" />
            <p style={{ margin: "0 0 6px", fontSize: 13.5, color: "#1A2B3C", lineHeight: 1.65 }}>
              {topic.definition.text}
            </p>
            {topic.definition.keyThreshold && (
              <div style={{
                marginBottom: 24, padding: "9px 12px",
                background: "rgba(10,110,94,0.06)", border: "1px solid rgba(10,110,94,0.15)",
                borderRadius: 6, fontSize: 12.5, color: "#0A6E5E", fontFamily: "var(--font-mono)",
              }}>
                {topic.definition.keyThreshold}
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <SectionTitle label="Most Common Causes" />
              <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 4 }}>
                {topic.etiology.commonCauses.map((c, i) => (
                  <li key={i} style={{ fontSize: 13, color: "#1A2B3C", lineHeight: 1.5 }}>{c}</li>
                ))}
              </ul>
            </div>

            <div style={{ marginBottom: 20 }}>
              <SectionTitle label="Aetiology by Category" />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {topic.etiology.categories.map((cat, i) => (
                  <div key={i} style={{
                    border: "1px solid #D0D7DE", borderRadius: 6, overflow: "hidden",
                  }}>
                    <div style={{
                      padding: "8px 12px",
                      background: "#F6F8FA",
                      borderBottom: "1px solid #D0D7DE",
                      fontSize: 12, fontWeight: 600, color: "#1A2B3C",
                    }}>
                      {cat.category}
                    </div>
                    <div style={{ padding: "8px 12px", display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {cat.causes.map((cause, j) => (
                        <span key={j} style={{
                          fontSize: 12, padding: "3px 8px",
                          background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.08)",
                          borderRadius: 4, color: "#57606A",
                        }}>
                          {cause}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <SectionTitle label="Risk Factors" />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {topic.etiology.riskFactors.map((rf, i) => (
                <span key={i} style={{
                  fontSize: 12, padding: "4px 10px",
                  background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 4, color: "#57606A",
                }}>
                  {rf}
                </span>
              ))}
            </div>

            {topic.etiology.rareCauses && topic.etiology.rareCauses.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <SectionTitle label="Rare Causes" />
                <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 3 }}>
                  {topic.etiology.rareCauses.map((c, i) => (
                    <li key={i} style={{ fontSize: 12.5, color: "#8B949E", lineHeight: 1.5 }}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );

      case "pathophysiology":
        return (
          <div>
            <SectionTitle label="Overview" />
            <p style={{ margin: "0 0 20px", fontSize: 13.5, lineHeight: 1.7, color: "#1A2B3C" }}>
              {topic.pathophysiology.summary}
            </p>

            <SectionTitle label="Key Mechanisms" />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              {topic.pathophysiology.keyMechanisms.map((m, i) => (
                <div key={i} style={{
                  display: "flex", gap: 10, alignItems: "flex-start",
                  padding: "8px 12px",
                  border: "1px solid #D0D7DE", borderRadius: 5,
                  fontSize: 13, color: "#1A2B3C", lineHeight: 1.5,
                }}>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                    color: "var(--brand)", flexShrink: 0, marginTop: 2,
                  }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {m}
                </div>
              ))}
            </div>

            <div style={{
              padding: "12px 14px",
              background: "rgba(10,110,94,0.04)",
              border: "1px solid rgba(10,110,94,0.15)",
              borderLeft: "3px solid var(--brand)",
              borderRadius: "0 6px 6px 0",
            }}>
              <div style={{
                fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
                textTransform: "uppercase", color: "var(--brand)", marginBottom: 6,
              }}>
                Bedside Relevance
              </div>
              <p style={{ margin: 0, fontSize: 13, color: "#1A2B3C", lineHeight: 1.6 }}>
                {topic.pathophysiology.clinicalRelevance}
              </p>
            </div>
          </div>
        );

      case "features":
        return (
          <div>
            <RedFlagBanner flags={topic.clinicalFeatures.redFlags} />
            <FeatureList items={topic.clinicalFeatures.symptoms} label="Symptoms" />
            <FeatureList items={topic.clinicalFeatures.signs} label="Signs" />
            <SeverityTable levels={topic.clinicalFeatures.severity} />
          </div>
        );

      case "diagnosis":
        return (
          <div>
            <SectionTitle label="Step-by-Step Approach" />
            <div style={{ marginBottom: 28 }}>
              <DiagnosticStepper steps={topic.diagnosticApproach.stepByStep} />
            </div>

            <SectionTitle label="Key Investigations" />
            <div style={{ marginBottom: 28 }}>
              <InvestigationsTable investigations={topic.diagnosticApproach.keyInvestigations} />
            </div>

            <SectionTitle label="Differential Diagnosis" />
            <DDxTable
              items={topic.diagnosticApproach.differentialDiagnosis}
              algorithm={topic.diagnosticApproach.diagnosticAlgorithm}
            />
          </div>
        );

      case "treatment":
        return (
          <TreatmentByFacility
            byContext={topic.treatment.byContext}
            firstLine={topic.treatment.firstLine}
            secondLine={topic.treatment.secondLine}
            principles={topic.treatment.principles}
            specialPopulations={topic.treatment.specialPopulations}
            monitoring={topic.treatment.monitoring}
            whenToRefer={topic.treatment.whenToRefer}
            pitfalls={topic.treatment.pitfalls}
          />
        );

      case "pearls":
        return <PearlsAndPitfalls data={topic.clinicalPearlsAndPitfalls} />;

      case "takeaway":
        return <KeyTakeaway points={topic.keyTakeaway} />;

      default:
        return null;
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const bookmarked = slug ? isBookmarked(slug) : false;

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF" }}>
      <style>{`
        .topic-tabbar::-webkit-scrollbar { display: none; }
        .topic-articles::-webkit-scrollbar { width: 4px; }
        .topic-articles::-webkit-scrollbar-track { background: transparent; }
        .topic-articles::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 4px; }
      `}</style>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", alignItems: "start" }}>

        {/* ── Main column ───────────────────────────────────────────────────── */}
        <div style={{ minWidth: 0 }}>

          {/* Hero header — stays dark */}
          <div style={{
            background: "#0D1117",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            padding: "20px 28px 22px",
          }}>
            <button
              onClick={() => navigate("/topics")}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 5, color: "#8B949E",
                padding: "5px 12px", cursor: "pointer",
                fontSize: 12, fontWeight: 500, marginBottom: 16,
              }}
            >
              ← Back
            </button>

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <h1 style={{
                  margin: 0, fontSize: 32, fontWeight: 300,
                  color: "#FFFFFF",
                  fontFamily: "var(--font-display)", fontStyle: "italic",
                  lineHeight: 1.15, letterSpacing: -0.5,
                }}>
                  {topic.title}
                </h1>
                <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#8B949E" }}>
                    {topic.icd10}
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.2)" }}>·</span>
                  {topic.specialty.map((s, i) => (
                    <span key={i} style={{ fontSize: 11, color: "#8B949E" }}>{s}</span>
                  ))}
                  <span style={{ color: "rgba(255,255,255,0.2)" }}>·</span>
                  <EvidenceBadge level={topic.evidenceLevel} />
                  <span style={{ color: "rgba(255,255,255,0.2)" }}>·</span>
                  <span style={{ fontSize: 11, color: "#8B949E" }}>
                    Reviewed {new Date(topic.lastReviewed).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                  </span>
                </div>
              </div>

              {/* Bookmark button — 34×34 */}
              <button
                onClick={() => slug && toggleBookmark(slug)}
                title={bookmarked ? "Remove bookmark" : "Bookmark this topic"}
                style={{
                  width: 34, height: 34, flexShrink: 0,
                  background: bookmarked ? "rgba(88,212,196,0.12)" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${bookmarked ? "rgba(88,212,196,0.4)" : "rgba(255,255,255,0.12)"}`,
                  borderRadius: 6, cursor: "pointer",
                  color: bookmarked ? "#58D4C4" : "#8B949E",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.12s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = bookmarked ? "rgba(88,212,196,0.2)" : "rgba(255,255,255,0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = bookmarked ? "rgba(88,212,196,0.12)" : "rgba(255,255,255,0.06)"; }}
              >
                <Bookmark size={15} fill={bookmarked ? "currentColor" : "none"} />
              </button>
            </div>
          </div>

          {/* Tab bar — stays dark */}
          <div
            ref={tabBarRef}
            className="topic-tabbar"
            style={{
              background: "#0D1117",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              padding: "0 28px",
              display: "flex",
              gap: 0,
              overflowX: "auto",
              scrollbarWidth: "none",
            }}
          >
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  data-tab={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  style={{
                    padding: "11px 14px",
                    border: "none",
                    borderBottom: active ? "2px solid #0A6E5E" : "2px solid transparent",
                    background: "none",
                    color: active ? "#FFFFFF" : "#8B949E",
                    fontWeight: active ? 600 : 400,
                    fontSize: 13,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "color 0.1s ease",
                    flexShrink: 0,
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content — light */}
          <div style={{ padding: "24px 28px 80px", background: "#FFFFFF" }}>
            {renderTab()}
          </div>
        </div>

        {/* ── Articles panel — light ─────────────────────────────────────── */}
        <div
          className="topic-articles"
          style={{
            borderLeft: "1px solid #D0D7DE",
            background: "#F6F8FA",
            minHeight: "100vh",
            position: "sticky",
            top: 0,
            maxHeight: "100vh",
            overflowY: "auto",
          }}
        >
          <LatestArticlesPanel topic={topic.title} />
        </div>
      </div>
    </div>
  );
}
