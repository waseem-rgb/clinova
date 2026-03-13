// frontend/src/pages/Topics.tsx
// Clinova — Topic Library with pre-built Harrison's topics + AI generation
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FileSearch, Plus } from "lucide-react";
import SidebarNav from "../components/SidebarNav";
import TopicCard from "../components/TopicCard";
import TopicSearchDropdown from "../components/TopicSearchDropdown";
import GenerateTopicModal from "../components/GenerateTopicModal";
import { useTopicHistory } from "../hooks/useTopicHistory";

interface TopicEntry {
  slug: string;
  title: string;
  icd10: string;
  specialty: string[];
  tags: string[];
}

interface LibraryTopic {
  slug: string;
  title: string;
  specialty: string[];
  completeness_score: number;
  page_start?: number;
  page_end?: number;
  chunk_count?: number;
}

export default function Topics() {
  const navigate = useNavigate();
  const { history, bookmarks, toggleBookmark, isBookmarked, addToHistory } = useTopicHistory();

  const [topics,        setTopics]        = useState<TopicEntry[]>([]);
  const [libraryTopics, setLibraryTopics] = useState<LibraryTopic[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [activeSpec,    setActiveSpec]    = useState("All");
  const [searchQ,       setSearchQ]       = useState("");
  const [showModal,     setShowModal]     = useState(false);
  const [modalTopic,    setModalTopic]    = useState("");

  // Load both topic index and library on mount
  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch("/api/topics").then((r) => r.json()).catch(() => ({ topics: [] })),
      fetch("/api/topics/library").then((r) => r.json()).catch(() => ({ topics: [] })),
    ]).then(([indexData, libraryData]) => {
      if (!mounted) return;
      setTopics(indexData.topics ?? []);
      setLibraryTopics(libraryData.topics ?? []);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  // Merge: library topics + manually created topics (deduped)
  const allTopics = useMemo(() => {
    const slugSet = new Set<string>();
    const merged: Array<TopicEntry & { completeness_score?: number; source: "library" | "manual" }> = [];

    // Library topics first (pre-built from Harrison's)
    for (const lt of libraryTopics) {
      slugSet.add(lt.slug);
      merged.push({
        slug: lt.slug,
        title: lt.title,
        icd10: "",
        specialty: lt.specialty,
        tags: [],
        completeness_score: lt.completeness_score,
        source: "library",
      });
    }

    // Manually created topics that aren't in library
    for (const t of topics) {
      if (!slugSet.has(t.slug)) {
        merged.push({ ...t, source: "manual" });
      }
    }

    return merged;
  }, [topics, libraryTopics]);

  // Unique specialties
  const specialties = useMemo(() => {
    const set = new Set<string>();
    allTopics.forEach((t) => t.specialty?.forEach((s) => set.add(s)));
    return ["All", ...Array.from(set).sort()];
  }, [allTopics]);

  // Client-side filter
  const filtered = useMemo(() => {
    let result = allTopics;
    if (activeSpec !== "All") {
      result = result.filter((t) => t.specialty?.includes(activeSpec));
    }
    if (searchQ.trim()) {
      const ql = searchQ.toLowerCase();
      result = result.filter((t) =>
        t.title.toLowerCase().includes(ql) ||
        t.icd10?.toLowerCase().includes(ql) ||
        t.specialty?.some((s) => s.toLowerCase().includes(ql)) ||
        t.tags?.some((tag) => tag.toLowerCase().includes(ql))
      );
    }
    return result;
  }, [allTopics, activeSpec, searchQ]);

  // Recently viewed
  const recentTopics = useMemo(() => {
    return history.slice(0, 8).map((h) =>
      allTopics.find((t) => t.slug === h.slug) ?? {
        slug: h.slug, title: h.title,
        icd10: h.icd10 ?? "", specialty: h.specialty ?? [], tags: [],
        source: "manual" as const,
      }
    );
  }, [history, allTopics]);

  const openGenerate = useCallback((q = "") => {
    setModalTopic(q || searchQ);
    setShowModal(true);
  }, [searchQ]);

  const handleGenerated = useCallback((slug: string) => {
    fetch("/api/topics")
      .then((r) => r.json())
      .then((d) => setTopics(d.topics ?? []))
      .catch(() => {});
  }, []);

  const showRecent = recentTopics.length > 0 && !searchQ.trim() && activeSpec === "All";

  // Navigate to the appropriate view based on topic source
  const handleTopicClick = useCallback((topic: typeof allTopics[number]) => {
    if (topic.source === "library") {
      // Pre-built library topic -> TopicView with cached RAG data
      navigate(`/topic/medicine?q=${encodeURIComponent(topic.title)}`);
    } else {
      // Manually created topic -> TopicDetail
      navigate(`/topics/${topic.slug}`);
    }
  }, [navigate]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", display: "flex" }}>

      {/* Sidebar */}
      <div className="sidebar-collapse" style={{ width: 240, minWidth: 240, minHeight: "100vh" }}>
        <SidebarNav />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Dark teal header */}
        <div className="hero-section" style={{ padding: "0 36px" }}>
          <div style={{ position: "relative", zIndex: 1, padding: "24px 0 20px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: 1,
                  textTransform: "uppercase", color: "#5eead4", marginBottom: 5,
                }}>
                  Clinical Reference
                </div>
                <h1 style={{
                  margin: 0, fontSize: 28, fontFamily: "var(--font-display)",
                  fontStyle: "italic", color: "#fff", letterSpacing: -0.5,
                }}>
                  Topic Library
                </h1>
                <div style={{ marginTop: 6, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                  {loading
                    ? "Loading..."
                    : `${allTopics.length} topic${allTopics.length !== 1 ? "s" : ""}`
                  }
                  {libraryTopics.length > 0 && !loading && (
                    <span> ({libraryTopics.length} from Harrison's)</span>
                  )}
                  {" · "}Evidence-based · India-specific
                </div>
              </div>

              <button
                onClick={() => openGenerate()}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "9px 16px",
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 8, color: "#fff",
                  cursor: "pointer", fontWeight: 600, fontSize: 13,
                  flexShrink: 0,
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.18)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
              >
                <Plus size={14} />
                Generate with AI
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "24px 36px 80px" }}>

          {/* Search dropdown */}
          <div style={{ marginBottom: 16 }}>
            <TopicSearchDropdown
              placeholder="Search by name, specialty, or keyword..."
              bookmarkedSlugs={bookmarks}
              onQueryChange={setSearchQ}
            />
          </div>

          {/* Specialty filter tabs */}
          {specialties.length > 1 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
              {specialties.map((sp) => {
                const active = activeSpec === sp;
                const count = sp === "All"
                  ? allTopics.length
                  : allTopics.filter((t) => t.specialty?.includes(sp)).length;
                return (
                  <button
                    key={sp}
                    onClick={() => setActiveSpec(sp)}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 4,
                      border: `1px solid ${active ? "var(--brand)" : "var(--border)"}`,
                      background: active ? "var(--brand-light)" : "transparent",
                      color: active ? "var(--brand)" : "var(--text-muted)",
                      cursor: "pointer",
                      fontWeight: active ? 600 : 400,
                      fontSize: 12,
                      transition: "all 0.1s",
                    }}
                  >
                    {sp} <span style={{ opacity: 0.6, fontSize: 10 }}>({count})</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Recently Viewed */}
          {showRecent && (
            <div style={{ marginBottom: 28 }}>
              <div style={{
                fontSize: 10, fontWeight: 600, letterSpacing: 0.7,
                textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10,
              }}>
                Recently Viewed
              </div>
              <div style={{
                display: "flex", gap: 10,
                overflowX: "auto", scrollbarWidth: "none",
                paddingBottom: 4,
              }}>
                <style>{`.recent-scroll::-webkit-scrollbar { display: none; }`}</style>
                {recentTopics.map((t) => (
                  <TopicCard
                    key={t.slug}
                    slug={t.slug}
                    title={t.title}
                    icd10={t.icd10}
                    specialty={t.specialty}
                    compact
                  />
                ))}
              </div>
            </div>
          )}

          {/* Topic count */}
          {!loading && (
            <div style={{
              fontSize: 11, color: "var(--text-muted)",
              fontFamily: "var(--font-mono)", marginBottom: 14,
            }}>
              {filtered.length} topic{filtered.length !== 1 ? "s" : ""}
              {activeSpec !== "All" && ` in ${activeSpec}`}
              {searchQ.trim() && ` matching "${searchQ}"`}
            </div>
          )}

          {/* Content area */}
          {loading ? (
            <div style={{
              color: "var(--text-muted)", fontSize: 13,
              padding: "60px 0", textAlign: "center",
            }}>
              Loading topics...
            </div>
          ) : filtered.length === 0 ? (

            /* Empty state */
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
              <FileSearch
                size={32}
                style={{ opacity: 0.35, display: "block", margin: "0 auto 12px" }}
              />
              <p style={{
                fontSize: 15, fontWeight: 600,
                color: "var(--text-secondary)", margin: "0 0 6px",
              }}>
                No topics found
              </p>
              <p style={{
                fontSize: 13.5, color: "var(--text-muted)", margin: "0 0 18px",
              }}>
                {searchQ.trim()
                  ? `No results for "${searchQ}" in the library yet.`
                  : allTopics.length === 0
                    ? "The library is empty. Generate the first topic with AI."
                    : `No ${activeSpec} topics in the library yet.`}
              </p>
              {(searchQ.trim() || allTopics.length === 0) && (
                <button
                  onClick={() => openGenerate(searchQ)}
                  style={{
                    padding: "10px 22px",
                    background: "var(--brand)", color: "#fff",
                    border: "none", borderRadius: 6,
                    fontWeight: 600, fontSize: 13, cursor: "pointer",
                  }}
                >
                  {searchQ.trim()
                    ? `Generate "${searchQ}" with AI`
                    : "Generate Topic with AI"}
                </button>
              )}
            </div>

          ) : (

            /* Topic grid */
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 16,
            }}>
              {filtered.map((topic) => (
                <LibraryTopicCard
                  key={topic.slug}
                  title={topic.title}
                  specialty={topic.specialty}
                  completenessScore={topic.completeness_score}
                  isBookmarked={isBookmarked(topic.slug)}
                  onBookmarkToggle={() => toggleBookmark(topic.slug)}
                  onClick={() => handleTopicClick(topic)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI Generation Modal */}
      {showModal && (
        <GenerateTopicModal
          onClose={() => setShowModal(false)}
          initialTopic={modalTopic}
          onGenerated={handleGenerated}
        />
      )}
    </div>
  );
}

// ── Library Topic Card with completeness score ──

function LibraryTopicCard({
  title, specialty, completenessScore, isBookmarked, onBookmarkToggle, onClick,
}: {
  title: string;
  specialty?: string[];
  completenessScore?: number;
  isBookmarked?: boolean;
  onBookmarkToggle?: () => void;
  onClick: () => void;
}) {
  const score = completenessScore ?? 0;
  const scoreColor = score >= 70 ? "var(--success)" : score >= 40 ? "var(--warning)" : "var(--text-subtle)";

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "16px",
        cursor: "pointer",
        transition: "border-color 0.15s, box-shadow 0.15s",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--brand-border)";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(10,110,94,0.07)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Score badge + bookmark */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {score > 0 ? (
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
            color: scoreColor, border: `1px solid ${scoreColor}`,
            borderRadius: 3, padding: "2px 6px",
          }}>
            {score}/100
          </span>
        ) : <span />}

        {onBookmarkToggle && (
          <button
            onClick={(e) => { e.stopPropagation(); onBookmarkToggle(); }}
            title={isBookmarked ? "Remove bookmark" : "Bookmark"}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 2,
              color: isBookmarked ? "var(--brand)" : "var(--text-muted)",
              transition: "color 0.1s",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={isBookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        )}
      </div>

      {/* Title */}
      <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)", lineHeight: 1.4 }}>
        {title}
      </div>

      {/* Specialty chips */}
      {specialty && specialty.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {specialty.slice(0, 2).map((s, i) => (
            <span key={i} style={{
              fontSize: 10, padding: "2px 7px", fontWeight: 500,
              background: "var(--bg-raised)", border: "1px solid var(--border)",
              borderRadius: 4, color: "var(--text-muted)",
            }}>
              {s}
            </span>
          ))}
          {specialty.length > 2 && (
            <span style={{ fontSize: 10, color: "var(--text-subtle)" }}>
              +{specialty.length - 2}
            </span>
          )}
        </div>
      )}

      {/* Completeness bar */}
      {score > 0 && (
        <div style={{ marginTop: "auto" }}>
          <div style={{
            height: 3, borderRadius: 2,
            background: "var(--border)",
            overflow: "hidden",
          }}>
            <div style={{
              height: "100%", borderRadius: 2,
              width: `${Math.min(score, 100)}%`,
              background: scoreColor,
              transition: "width 0.3s",
            }} />
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        paddingTop: 2,
        fontSize: 12, color: "var(--brand)", fontWeight: 500, textAlign: "right",
      }}>
        View →
      </div>
    </div>
  );
}
