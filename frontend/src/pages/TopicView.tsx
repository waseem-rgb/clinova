// frontend/src/pages/TopicView.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import SidebarNav from "../components/SidebarNav";
import LatestArticlesPanel from "../components/LatestArticlesPanel";
import DrugHighlighter from "../components/DrugHighlighter";
import { COLLECTIONS, cleanTopicTitle, getTopicByCollection, streamTopicByCollection } from "../api/topic";
import type { CollectionKey, TopicDoctorView, TopicResponse } from "../api/topic";

function isCollectionKey(x: any): x is CollectionKey {
  return x === "medicine" || x === "obgyn" || x === "pediatrics" || x === "surgery";
}

// ── Tab definitions mapped to section IDs ──
const TABS = [
  { id: "quick_view", label: "Quick View" },
  { id: "definition", label: "Definition" },
  { id: "pathophysiology", label: "Pathophysiology" },
  { id: "clinical_features", label: "Clinical Features" },
  { id: "diagnostic_approach", label: "Diagnosis" },
  { id: "treatment_strategy", label: "Treatment" },
  { id: "red_flags", label: "Red Flags" },
  { id: "india_context", label: "India Context" },
  { id: "clinical_pearls", label: "Pearls" },
];

const KEY_SECTIONS = new Set(["diagnostic_approach", "treatment_strategy", "clinical_features", "red_flags", "india_context", "clinical_pearls"]);

function hasSectionContent(section: TopicDoctorView["sections"][number]) {
  const content = (section.content || []).filter((c) => c && c.trim().length > 0);
  if (content.length > 0) return true;
  if (section.subsections?.some((s) => (s.content || []).some((c) => c && c.trim().length > 0))) return true;
  if (section.tables?.some((t) => (t.rows || []).length > 0)) return true;
  return false;
}

function SectionBlock({ section }: { section: TopicDoctorView["sections"][number] }) {
  const isRedFlag = section.id === "red_flags";
  const isIndiaContext = section.id === "india_context";
  const isTreatment = section.id === "treatment_strategy";

  const borderColor = isRedFlag ? "var(--critical)" : isIndiaContext ? "var(--warning)" : isTreatment ? "var(--success)" : "var(--teal-700)";
  const bgColor = isRedFlag ? "#fef2f2" : isIndiaContext ? "#fffbeb" : "transparent";

  return (
    <div
      id={`section-${section.id}`}
      style={{
        borderLeft: `3px solid ${borderColor}`,
        background: bgColor,
        borderRadius: isRedFlag || isIndiaContext ? 10 : 0,
        padding: isRedFlag || isIndiaContext ? "16px 20px" : "16px 20px",
        marginBottom: 16,
      }}
    >
      <div style={{
        fontWeight: 700,
        fontSize: 14,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        color: isRedFlag ? "var(--critical)" : isIndiaContext ? "var(--warning)" : "var(--text-primary)",
        marginBottom: 10,
        fontFamily: "var(--font-sans)",
      }}>
        {section.title}
      </div>
      <div style={{ color: "var(--text-primary)", fontSize: 15, lineHeight: 1.7 }}>
        {section.content?.map((p, idx) => (
          <p key={idx} style={{ margin: "8px 0" }}>
            <DrugHighlighter text={p} />
          </p>
        ))}

        {section.subsections?.map((sub, idx) => (
          <div key={idx} style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14 }}>{sub.title}</div>
            {sub.content?.map((p, i) => (
              <p key={i} style={{ margin: "6px 0" }}>
                <DrugHighlighter text={p} />
              </p>
            ))}
          </div>
        ))}

        {section.tables?.map((tbl, idx) => (
          <div key={idx} style={{ marginTop: 14 }}>
            {tbl.title && <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14 }}>{tbl.title}</div>}
            <table className="clinical-table">
              <thead>
                <tr>
                  {tbl.columns.map((c, i) => (
                    <th key={i}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tbl.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickViewCard({ quickView }: { quickView: TopicDoctorView["quick_view"] }) {
  return (
    <div id="section-quick_view" style={{ padding: "0 0 8px" }}>
      <ul style={{ margin: 0, paddingLeft: 20, color: "var(--text-primary)", fontSize: 15, lineHeight: 1.7 }}>
        {quickView.bullets?.slice(0, 8).map((b, i) => (
          <li key={i} style={{ marginBottom: 6 }}>{b}</li>
        ))}
      </ul>
      {quickView.table && quickView.table.length > 0 && (
        <table className="clinical-table" style={{ marginTop: 14 }}>
          <thead>
            <tr>
              <th>Clinical Question</th>
              <th>Practical Answer</th>
            </tr>
          </thead>
          <tbody>
            {quickView.table.map((row, idx) => (
              <tr key={idx}>
                <td style={{ fontWeight: 600 }}>{row.q}</td>
                <td>{row.a}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ThresholdsTable({ rows }: { rows: TopicDoctorView["thresholds"] }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        fontWeight: 700, fontSize: 14, textTransform: "uppercase",
        letterSpacing: 0.5, marginBottom: 10, color: "var(--text-primary)",
      }}>
        Key Thresholds
      </div>
      <table className="clinical-table">
        <thead>
          <tr>
            <th>Finding / Threshold</th>
            <th>Clinical Meaning</th>
            <th>Next Step</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx}>
              <td style={{ fontWeight: 600 }}>{r.finding}</td>
              <td>{r.meaning}</td>
              <td>{r.next_step}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EvidenceDrawer({ items }: { items: TopicResponse["evidence"]["items"] }) {
  if (!items || items.length === 0) return null;
  return (
    <details style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
      <summary style={{
        cursor: "pointer", fontWeight: 700, color: "var(--text-muted)", fontSize: 13,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        Evidence Sources ({items.length})
      </summary>
      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        {items.map((it) => (
          <div
            key={it.id}
            style={{
              border: "1px solid var(--border)",
              background: "#fff",
              borderRadius: 8,
              padding: 12,
            }}
          >
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
              {it.meta?.source}
              {it.meta?.chapter ? ` · ${it.meta.chapter}` : ""}
              {it.meta?.page_start ? ` · p.${it.meta.page_start}` : ""}
            </div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 13 }}>{it.text}</div>
          </div>
        ))}
      </div>
    </details>
  );
}

export default function TopicView() {
  const navigate = useNavigate();
  const params = useParams();
  const [sp] = useSearchParams();

  const collection: CollectionKey = useMemo(() => {
    const raw = params.collection;
    return isCollectionKey(raw) ? raw : "medicine";
  }, [params.collection]);

  const qRaw = sp.get("q") ?? "";
  const q = useMemo(() => cleanTopicTitle(qRaw), [qRaw]);

  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<TopicResponse | null>(null);
  const [activeTab, setActiveTab] = useState("quick_view");

  const abortRef = useRef<AbortController | null>(null);
  const closeStreamRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!q.trim()) {
      setErr("Missing topic query");
      setData(null);
      return;
    }

    abortRef.current?.abort();
    closeStreamRef.current?.();
    const ac = new AbortController();
    abortRef.current = ac;

    setErr(null);
    setLoading(true);
    setStreaming(true);
    setActiveTab("quick_view");

    const close = streamTopicByCollection(
      collection,
      q,
      {
        onQuickView: (partial) => {
          setData((prev) => ({
            topic: partial.topic || q,
            ref_id: (partial as any).ref_id || prev?.ref_id,
            sources: (partial as any).sources || prev?.sources,
            specialty: (partial as any).specialty || prev?.specialty,
            doctor_view: {
              quick_view: partial.quick_view,
              sections: partial.sections || [],
              thresholds: (partial as any).thresholds,
              pearls: [],
              takeaway: [],
            },
            evidence: prev?.evidence || { items: [], hidden_by_default: true },
            timings: prev?.timings || { cache_hit: { topic: false, evidence: false, transform: false }, retrieval_ms: 0, dedup_ms: 0, llm_ms: 0, total_ms: 0 },
          }));
          setLoading(false);
          setStreaming(true);
        },
        onComplete: (full) => {
          setData(full);
          setLoading(false);
          setStreaming(false);
        },
        onError: (errMsg) => {
          setStreaming(false);
          (async () => {
            try {
              const resp = await getTopicByCollection(collection, q, ac.signal);
              setData(resp);
            } catch (e: any) {
              if (e?.name !== "AbortError") setErr(e?.message ?? "Failed to fetch topic");
            } finally {
              setLoading(false);
            }
          })();
        },
      },
      ac.signal,
    );
    closeStreamRef.current = close;

    return () => {
      ac.abort();
      close();
    };
  }, [collection, q]);

  const collectionLabel = COLLECTIONS.find((c) => c.key === collection)?.label ?? "Medicine";
  const doctorView = data?.doctor_view;
  const sections = useMemo(() => doctorView?.sections ?? [], [doctorView]);
  const filteredSections = useMemo(() => sections.filter(hasSectionContent), [sections]);
  const thresholds = useMemo(() => doctorView?.thresholds ?? [], [doctorView]);
  const hasKeySections = useMemo(
    () => filteredSections.some((section) => section.id && KEY_SECTIONS.has(section.id)),
    [filteredSections]
  );
  const hasPearlSection = useMemo(
    () => filteredSections.some((section) => section.id === "clinical_pearls"),
    [filteredSections]
  );

  // Available tabs (only show tabs that have content)
  const availableTabs = useMemo(() => {
    const sectionIds = new Set(filteredSections.map((s) => s.id));
    return TABS.filter((tab) => {
      if (tab.id === "quick_view") return !!doctorView?.quick_view;
      return sectionIds.has(tab.id);
    });
  }, [filteredSections, doctorView]);

  function scrollToSection(id: string) {
    setActiveTab(id);
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", display: "flex" }}>
      {/* Sidebar */}
      <div className="sidebar-collapse" style={{ width: 240, minWidth: 240, minHeight: "100vh" }}>
        <SidebarNav />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* ── Dark teal header strip ── */}
        <div className="hero-section" style={{ padding: "0 32px" }}>
          <div style={{ position: "relative", zIndex: 1, padding: "24px 0 20px" }}>
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
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
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
              >
                Home
              </button>
              <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>/</span>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 500 }}>{collectionLabel}</span>
            </div>

            {/* Title row */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <h1 style={{
                margin: 0,
                fontSize: 36,
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                color: "#fff",
                letterSpacing: -0.8,
                flex: 1,
                lineHeight: 1.15,
              }}>
                {q || "Topic"}
              </h1>

              {/* Completeness badge — dev mode only */}
              {data?.completeness && window.location.hostname === "localhost" && (() => {
                const score = data.completeness.score;
                return (
                  <span
                    title={Object.entries(data.completeness.breakdown || {}).map(([k, v]) => `${k}: ${v}`).join("\n")}
                    style={{
                      fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 6,
                      background: "rgba(255,255,255,0.12)", color: "#fff",
                      fontFamily: "var(--font-mono)",
                      cursor: "help",
                    }}
                  >
                    {score}/100
                  </span>
                );
              })()}
            </div>

            {/* Specialty tags + ref */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              {data?.specialty && data.specialty.map((s, i) => (
                <span key={i} style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999,
                  background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)",
                }}>
                  {s}
                </span>
              ))}
              {data?.ref_id && (
                <span style={{
                  fontSize: 11, fontWeight: 600, fontFamily: "var(--font-mono)",
                  padding: "3px 10px", borderRadius: 999,
                  background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)",
                  letterSpacing: 0.5,
                }}>
                  {data.ref_id}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Tab navigation ── */}
        {!loading && !err && doctorView && availableTabs.length > 0 && (
          <div style={{
            background: "#fff",
            borderBottom: "1px solid var(--border)",
            padding: "0 32px",
            overflowX: "auto",
          }}>
            <div style={{ display: "flex", gap: 0 }}>
              {availableTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => scrollToSection(tab.id)}
                  style={{
                    padding: "12px 16px",
                    border: "none",
                    borderBottom: activeTab === tab.id ? "2px solid var(--teal-700)" : "2px solid transparent",
                    background: "transparent",
                    color: activeTab === tab.id ? "var(--teal-700)" : "var(--text-muted)",
                    fontWeight: activeTab === tab.id ? 700 : 500,
                    fontSize: 13,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "all 0.12s ease",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Content area ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: q.trim() ? "1fr 300px" : "1fr",
          gap: 24,
          padding: "24px 32px 80px",
          alignItems: "start",
        }}>
          <div>
            {/* Loading */}
            {(loading || (!err && !doctorView)) && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-muted)", fontWeight: 600, padding: "20px 0" }}>
                <span className="hourglass" aria-hidden style={{ fontSize: 24 }}>⏳</span>
                Loading topic...
              </div>
            )}
            {streaming && !loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--teal-700)", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "currentColor", animation: "pulse 1s infinite" }} />
                Refining with AI...
              </div>
            )}
            {err && (
              <div style={{
                color: "var(--critical)", fontWeight: 600, padding: "16px 20px",
                background: "#fef2f2", borderRadius: 10, border: "1px solid rgba(220,38,38,0.2)",
              }}>
                {err}
              </div>
            )}

            {!loading && !err && doctorView && (
              <div style={{
                background: "#fff",
                borderRadius: 12,
                border: "1px solid var(--border)",
                padding: "24px",
                boxShadow: "var(--shadow-sm)",
              }}>
                <QuickViewCard quickView={doctorView.quick_view} />
                <ThresholdsTable rows={thresholds} />

                {!hasKeySections && (
                  <div style={{
                    marginTop: 16, padding: 14, borderRadius: 10,
                    border: "1px solid var(--border)", background: "var(--bg-raised)",
                    fontWeight: 600, color: "var(--text-muted)", fontSize: 14,
                  }}>
                    No structured evidence found for this topic. Try expanding evidence.
                  </div>
                )}

                {filteredSections.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    {filteredSections.map((section) => (
                      <SectionBlock key={section.id} section={section} />
                    ))}
                  </div>
                )}

                {!hasPearlSection && doctorView.pearls && doctorView.pearls.length > 0 && (
                  <div id="section-clinical_pearls" style={{
                    marginTop: 18, borderLeft: "3px solid var(--teal-700)", padding: "16px 20px",
                  }}>
                    <div style={{
                      fontWeight: 700, fontSize: 14, textTransform: "uppercase",
                      letterSpacing: 0.5, marginBottom: 10,
                    }}>
                      Clinical Pearls & Pitfalls
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.7 }}>
                      {doctorView.pearls.map((p, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {doctorView.takeaway && doctorView.takeaway.length > 0 && (
                  <div style={{
                    marginTop: 18, padding: "16px 20px",
                    background: "var(--teal-50)", borderRadius: 10,
                    borderLeft: "3px solid var(--teal-700)",
                  }}>
                    <div style={{
                      fontWeight: 700, fontSize: 14, textTransform: "uppercase",
                      letterSpacing: 0.5, marginBottom: 8, color: "var(--teal-900)",
                    }}>
                      Key Takeaway
                    </div>
                    {doctorView.takeaway.map((t, i) => (
                      <p key={i} style={{ margin: "6px 0", fontSize: 15, lineHeight: 1.7 }}>{t}</p>
                    ))}
                  </div>
                )}

                <EvidenceDrawer items={data?.evidence?.items ?? []} />

                {/* Sources */}
                {data?.sources && data.sources.length > 0 && (
                  <details style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                    <summary style={{
                      cursor: "pointer", fontWeight: 700, fontSize: 13, color: "var(--text-muted)",
                    }}>
                      Sources ({data.sources.length})
                    </summary>
                    <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {data.sources.map((src, idx) => (
                        <span
                          key={idx}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            fontSize: 12, fontWeight: 600, padding: "5px 12px",
                            borderRadius: 6, background: "var(--bg-raised)",
                            border: "1px solid var(--border)", color: "var(--text-primary)",
                          }}
                        >
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--teal-700)", flexShrink: 0 }} />
                          {src}
                        </span>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>

          {/* Right: Latest Articles panel */}
          {q.trim() && <LatestArticlesPanel topic={q} />}
        </div>
      </div>
    </div>
  );
}
