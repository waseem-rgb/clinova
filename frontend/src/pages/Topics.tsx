// frontend/src/pages/Topics.tsx
// Clinova — Topic Library browse page with search, specialty filter, recently viewed, and AI generation
import React, { useEffect, useState, useMemo, useCallback } from "react";
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

export default function Topics() {
  const { history, bookmarks, toggleBookmark, isBookmarked, addToHistory } = useTopicHistory();

  const [topics,       setTopics]       = useState<TopicEntry[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [activeSpec,   setActiveSpec]   = useState("All");
  const [searchQ,      setSearchQ]      = useState("");
  const [showModal,    setShowModal]    = useState(false);
  const [modalTopic,   setModalTopic]   = useState("");

  // Load topic list on mount
  useEffect(() => {
    fetch("/api/topics")
      .then((r) => r.json())
      .then((d) => setTopics(d.topics ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Unique specialties from topic data
  const specialties = useMemo(() => {
    const set = new Set<string>();
    topics.forEach((t) => t.specialty?.forEach((s) => set.add(s)));
    return ["All", ...Array.from(set).sort()];
  }, [topics]);

  // Client-side filter (specialty + search query from TopicSearchDropdown)
  const filtered = useMemo(() => {
    let result = topics;
    if (activeSpec !== "All") {
      result = result.filter((t) => t.specialty?.includes(activeSpec));
    }
    if (searchQ.trim()) {
      const ql = searchQ.toLowerCase();
      result = result.filter((t) =>
        t.title.toLowerCase().includes(ql) ||
        t.icd10?.toLowerCase().includes(ql) ||
        t.tags?.some((tag) => tag.toLowerCase().includes(ql))
      );
    }
    return result;
  }, [topics, activeSpec, searchQ]);

  // Recently viewed: resolve history slugs against loaded topic data
  const recentTopics = useMemo(() => {
    return history.slice(0, 8).map((h) =>
      topics.find((t) => t.slug === h.slug) ?? {
        slug: h.slug, title: h.title,
        icd10: h.icd10 ?? "", specialty: h.specialty ?? [], tags: [],
      }
    );
  }, [history, topics]);

  const openGenerate = useCallback((q = "") => {
    setModalTopic(q || searchQ);
    setShowModal(true);
  }, [searchQ]);

  const handleGenerated = useCallback((slug: string) => {
    // Reload topic list after generation
    fetch("/api/topics")
      .then((r) => r.json())
      .then((d) => setTopics(d.topics ?? []))
      .catch(() => {});
  }, []);

  const showRecent = recentTopics.length > 0 && !searchQ.trim() && activeSpec === "All";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", display: "flex" }}>

      {/* Sidebar */}
      <div style={{ width: 240, minWidth: 240, minHeight: "100vh" }}>
        <SidebarNav />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>

        {/* ── Dark header ── */}
        <div style={{
          background: "var(--bg-sidebar)",
          borderBottom: "1px solid var(--border-sidebar)",
          padding: "24px 36px",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{
                fontSize: 10, fontWeight: 600, letterSpacing: 0.7,
                textTransform: "uppercase", color: "var(--text-sidebar-m)", marginBottom: 5,
              }}>
                Clinical Reference
              </div>
              <h1 style={{
                margin: 0, fontSize: 22, fontWeight: 700,
                color: "#C9D1D9", letterSpacing: -0.3,
              }}>
                Topic Library
              </h1>
              <div style={{ marginTop: 5, fontSize: 12, color: "var(--text-sidebar-m)" }}>
                {loading
                  ? "Loading…"
                  : `${topics.length} structured topic${topics.length !== 1 ? "s" : ""}`
                }
                {" · "}Evidence-based · India-specific
              </div>
            </div>

            <button
              onClick={() => openGenerate()}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "9px 16px",
                background: "rgba(10,110,94,0.18)",
                border: "1px solid var(--brand)",
                borderRadius: 6, color: "#58D4C4",
                cursor: "pointer", fontWeight: 600, fontSize: 13,
                flexShrink: 0,
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(10,110,94,0.32)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(10,110,94,0.18)"; }}
            >
              <Plus size={14} />
              Generate with AI
            </button>
          </div>
        </div>

        {/* ── Content ── */}
        <div style={{ padding: "24px 36px 80px" }}>

          {/* Search dropdown */}
          <div style={{ marginBottom: 16 }}>
            <TopicSearchDropdown
              placeholder="Search by name, ICD-10, or tag…"
              bookmarkedSlugs={bookmarks}
              onQueryChange={setSearchQ}
            />
          </div>

          {/* Specialty filter tabs */}
          {specialties.length > 1 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
              {specialties.map((sp) => {
                const active = activeSpec === sp;
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
                    {sp}
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
              Loading topics…
            </div>
          ) : filtered.length === 0 ? (

            /* ── Empty state ── */
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
                  : topics.length === 0
                    ? "The library is empty. Generate the first topic with AI."
                    : `No ${activeSpec} topics in the library yet.`}
              </p>
              {(searchQ.trim() || topics.length === 0) && (
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
                    ? `Generate "${searchQ}" with AI →`
                    : "Generate Topic with AI →"}
                </button>
              )}
            </div>

          ) : (

            /* ── Topic grid ── */
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 16,
            }}>
              {filtered.map((topic) => (
                <TopicCard
                  key={topic.slug}
                  slug={topic.slug}
                  title={topic.title}
                  icd10={topic.icd10}
                  specialty={topic.specialty}
                  tags={topic.tags}
                  isBookmarked={isBookmarked(topic.slug)}
                  onBookmarkToggle={toggleBookmark}
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
