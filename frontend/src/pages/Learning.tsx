// frontend/src/pages/Learning.tsx
// Clinova — Learning & CME Hub
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Pearl {
  id: number;
  category: string;
  title: string;
  pearl: string;
  explanation: string;
  references: string[];
  tags: string[];
  difficulty: "basic" | "intermediate" | "advanced";
}

interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  category: string;
  difficulty: string;
  tags: string[];
}

interface QuizResult {
  is_correct: boolean;
  correct_option: number;
  correct_text: string;
  explanation: string;
  reference: string;
  points_earned: number;
}

interface Course {
  id: string;
  title: string;
  emoji: string;
  modules: number;
  duration_min: number;
  category: string;
  description: string;
}

interface Badge {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

// ─── Local stats (persisted in localStorage) ─────────────────────────────────

const STATS_KEY = "clinova_learning_stats";

interface LearningStats {
  points: number;
  streak: number;
  quizCorrect: number;
  quizTotal: number;
  lastActivityDate: string;
  earnedBadgeIds: string[];
}

function loadStats(): LearningStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { points: 0, streak: 0, quizCorrect: 0, quizTotal: 0, lastActivityDate: "", earnedBadgeIds: [] };
}

function saveStats(stats: LearningStats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function awardPoints(points: number): LearningStats {
  const stats = loadStats();
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const newStreak = stats.lastActivityDate === yesterday
    ? stats.streak + 1
    : stats.lastActivityDate === today
    ? stats.streak
    : 1;
  const updated = { ...stats, points: stats.points + points, streak: newStreak, lastActivityDate: today };
  saveStats(updated);
  return updated;
}

// ─── Difficulty badge ─────────────────────────────────────────────────────────

function DiffBadge({ level }: { level: string }) {
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 600,
      padding: "2px 7px",
      borderRadius: 3,
      background: "var(--bg-raised)",
      color: "var(--text-muted)",
      letterSpacing: 0.5,
      textTransform: "uppercase" as const,
      border: "1px solid var(--border)",
    }}>
      {level}
    </span>
  );
}

// ─── Pearl Card ───────────────────────────────────────────────────────────────

function PearlCard({ pearl }: { pearl: Pearl }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      background: "var(--bg-surface)",
      borderRadius: 8,
      border: "1px solid var(--border)",
      borderLeft: "3px solid var(--brand)",
      padding: "16px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, alignItems: "center" }}>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 3,
            background: "var(--brand-light)", color: "var(--brand)",
            letterSpacing: 0.5, textTransform: "uppercase" as const,
          }}>
            {pearl.category}
          </span>
          <DiffBadge level={pearl.difficulty} />
        </div>
      </div>

      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", lineHeight: 1.4, marginBottom: 8 }}>
        {pearl.title}
      </div>

      <div style={{
        background: "var(--bg-raised)",
        borderLeft: "2px solid var(--brand-border)",
        padding: "10px 12px",
        fontSize: 13,
        color: "var(--text-secondary)",
        lineHeight: 1.6,
        marginBottom: 10,
      }}>
        {pearl.pearl}
      </div>

      {expanded && (
        <>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 8 }}>
            <strong style={{ color: "var(--text-primary)" }}>Explanation: </strong>
            {pearl.explanation}
          </div>
          {pearl.references.length > 0 && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
              <strong>References: </strong>{pearl.references.join(" · ")}
            </div>
          )}
        </>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
          {pearl.tags.slice(0, 3).map((tag) => (
            <span key={tag} style={{
              fontSize: 10, color: "var(--text-subtle)",
              padding: "2px 6px", borderRadius: 3,
              border: "1px solid var(--border)",
            }}>
              {tag}
            </span>
          ))}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            fontSize: 11, fontWeight: 500, color: "var(--brand)",
            background: "none", border: "none", cursor: "pointer", padding: "4px 0",
          }}
        >
          {expanded ? "Show less" : "Full explanation"}
        </button>
      </div>
    </div>
  );
}

// ─── Quiz Widget ──────────────────────────────────────────────────────────────

function QuizWidget() {
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [stats, setStats] = useState<LearningStats>(loadStats);

  useEffect(() => {
    fetch("/api/learning/quiz/today")
      .then((r) => r.json())
      .then((d) => setQuestion(d.question))
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (selected === null || !question) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/learning/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: question.id, selected_option: selected }),
      });
      const data: QuizResult = await res.json();
      setResult(data);
      const updated = awardPoints(data.points_earned);
      if (data.is_correct) updated.quizCorrect = (updated.quizCorrect || 0) + 1;
      updated.quizTotal = (updated.quizTotal || 0) + 1;
      saveStats(updated);
      setStats(updated);
    } catch {}
    finally { setSubmitting(false); }
  };

  if (!question) {
    return (
      <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
        Loading quiz…
      </div>
    );
  }

  const OPTION_LETTERS = ["A", "B", "C", "D"];

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" as const }}>
        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 3, background: "var(--brand-light)", color: "var(--brand)", textTransform: "uppercase" as const }}>{question.category}</span>
        <DiffBadge level={question.difficulty} />
      </div>

      <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)", lineHeight: 1.6, marginBottom: 14 }}>
        {question.question}
      </div>

      <div style={{ display: "flex", flexDirection: "column" as const, gap: 8, marginBottom: 14 }}>
        {question.options.map((opt, idx) => {
          const isSelected = selected === idx;
          const isCorrect = result?.correct_option === idx;
          const isWrong = result && isSelected && !result.is_correct;

          let borderColor = "var(--border)";
          let bg = "var(--bg-raised)";
          let color = "var(--text-primary)";

          if (result) {
            if (isCorrect)  { bg = "#F0FDF4"; borderColor = "#22C55E"; color = "#166534"; }
            else if (isWrong){ bg = "#FEF2F2"; borderColor = "#EF4444"; color = "#991B1B"; }
          } else if (isSelected) {
            bg = "var(--brand-light)";
            borderColor = "var(--brand)";
            color = "var(--brand)";
          }

          return (
            <button
              key={idx}
              onClick={() => !result && setSelected(idx)}
              disabled={!!result}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 6,
                border: `1px solid ${borderColor}`,
                background: bg,
                color,
                cursor: result ? "default" : "pointer",
                fontWeight: isSelected || (result && isCorrect) ? 600 : 400,
                fontSize: 13,
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                transition: "all 0.1s ease",
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, minWidth: 18, flexShrink: 0, marginTop: 1 }}>
                {OPTION_LETTERS[idx]}
              </span>
              <span style={{ lineHeight: 1.5, flex: 1 }}>{opt}</span>
              {result && isCorrect && <span style={{ marginLeft: "auto", color: "#166534", fontWeight: 700 }}>✓</span>}
              {result && isWrong  && <span style={{ marginLeft: "auto", color: "#991B1B", fontWeight: 700 }}>✗</span>}
            </button>
          );
        })}
      </div>

      {!result && (
        <button
          onClick={handleSubmit}
          disabled={selected === null || submitting}
          style={{
            padding: "9px 20px",
            background: selected !== null ? "var(--brand)" : "var(--bg-raised)",
            color: selected !== null ? "#fff" : "var(--text-subtle)",
            border: "none",
            borderRadius: 6,
            cursor: selected !== null ? "pointer" : "not-allowed",
            fontWeight: 600,
            fontSize: 13,
            transition: "background 0.12s ease",
          }}
        >
          {submitting ? "Checking…" : "Submit Answer"}
        </button>
      )}

      {result && (
        <div style={{
          marginTop: 14,
          padding: "14px 14px",
          borderRadius: 6,
          background: result.is_correct ? "#F0FDF4" : "#FEF2F2",
          border: `1px solid ${result.is_correct ? "#86EFAC" : "#FCA5A5"}`,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: result.is_correct ? "#166534" : "#991B1B" }}>
            {result.is_correct ? "Correct" : "Incorrect"}{" "}
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 12 }}>+{result.points_earned} pts</span>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.65, color: "var(--text-secondary)", marginBottom: 6 }}>
            {result.explanation}
          </div>
          {result.reference && (
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Ref: {result.reference}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stats Row (DM Mono numbers) ──────────────────────────────────────────────

function StatsRow({ stats }: { stats: LearningStats }) {
  const accuracy = stats.quizTotal > 0
    ? Math.round((stats.quizCorrect / stats.quizTotal) * 100)
    : 0;

  const items = [
    { label: "Points",    value: stats.points.toLocaleString() },
    { label: "Streak",    value: `${stats.streak}d` },
    { label: "Accuracy",  value: `${accuracy}%` },
    { label: "Questions", value: stats.quizTotal.toString() },
  ];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      overflow: "hidden",
      marginBottom: 24,
    }}>
      {items.map((item, i) => (
        <div key={item.label} style={{
          padding: "14px 12px",
          borderLeft: i > 0 ? "1px solid var(--border)" : "none",
          background: "var(--bg-surface)",
          textAlign: "center",
        }}>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 20,
            fontWeight: 500,
            color: "var(--brand)",
            letterSpacing: -0.5,
            marginBottom: 2,
          }}>
            {item.value}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Course Card ──────────────────────────────────────────────────────────────

function CourseCard({ course }: { course: Course }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--bg-surface)",
        borderRadius: 8,
        border: hovered ? "1px solid var(--brand-border)" : "1px solid var(--border)",
        borderLeft: "3px solid var(--border-strong)",
        padding: "16px 16px",
        cursor: "pointer",
        transition: "border-color 0.12s ease",
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)", lineHeight: 1.3, marginBottom: 3 }}>
          {course.title}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          {course.modules} modules · {course.duration_min} min
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 10 }}>
        {course.description}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 3,
          background: "var(--bg-raised)", color: "var(--text-muted)",
          letterSpacing: 0.4, textTransform: "uppercase" as const,
          border: "1px solid var(--border)",
        }}>
          {course.category}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--brand)" }}>
          Start →
        </span>
      </div>
    </div>
  );
}

// ─── Badge Shelf ──────────────────────────────────────────────────────────────

function BadgeShelf({ earnedIds }: { earnedIds: string[] }) {
  const ALL_BADGES: Badge[] = [
    { id: "first-responder",   name: "First Responder",    emoji: "🚑", description: "Complete Common Emergencies" },
    { id: "drug-safety",       name: "Drug Safety",        emoji: "🛡️", description: "10 pharmacology Qs correct" },
    { id: "antibiotic-steward",name: "Antibiotic Steward", emoji: "🔬", description: "Complete Rational Antibiotic Use" },
    { id: "diagnosis-master",  name: "Diagnosis Master",   emoji: "🧠", description: "25 quiz Qs correct" },
    { id: "streak-7",          name: "Week Warrior",       emoji: "🔥", description: "7-day streak" },
    { id: "streak-30",         name: "Consistent",         emoji: "⭐", description: "30-day streak" },
    { id: "cme-1",             name: "CME Pioneer",        emoji: "🎓", description: "Earn first CME credit" },
  ];

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
      {ALL_BADGES.map((badge) => {
        const earned = earnedIds.includes(badge.id);
        return (
          <div
            key={badge.id}
            title={badge.description}
            style={{
              display: "flex",
              flexDirection: "column" as const,
              alignItems: "center",
              gap: 4,
              padding: "10px 12px",
              borderRadius: 6,
              border: earned ? "1px solid var(--brand-border)" : "1px solid var(--border)",
              background: earned ? "var(--brand-light)" : "var(--bg-raised)",
              opacity: earned ? 1 : 0.4,
              minWidth: 64,
              cursor: "default",
              transition: "opacity 0.12s ease",
            }}
          >
            <span style={{ fontSize: 20 }}>{badge.emoji}</span>
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: earned ? "var(--brand)" : "var(--text-muted)",
              textAlign: "center" as const,
              lineHeight: 1.2,
            }}>
              {badge.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Learning() {
  const navigate = useNavigate();
  const [pearl, setPearl] = useState<Pearl | null>(null);
  const [pearlLoading, setPearlLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [stats, setStats] = useState<LearningStats>(loadStats);
  const [activeTab, setActiveTab] = useState<"today" | "courses" | "badges">("today");

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    const s = loadStats();
    if (s.lastActivityDate !== today) {
      const updated = awardPoints(5);
      setStats(updated);
    }
  }, []);

  useEffect(() => {
    fetch("/api/learning/pearl/today")
      .then((r) => r.json())
      .then((d) => { setPearl(d.pearl); setPearlLoading(false); })
      .catch(() => setPearlLoading(false));

    fetch("/api/learning/courses")
      .then((r) => r.json())
      .then((d) => setCourses(d.courses ?? []))
      .catch(() => {});
  }, []);

  const TAB_LABELS = [
    { id: "today",   label: "Today",   aria: "Today's learning" },
    { id: "courses", label: "Courses", aria: "All courses" },
    { id: "badges",  label: "Badges",  aria: "Achievements" },
  ] as const;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", paddingBottom: 60 }}>
      {/* Header */}
      <div style={{
        background: "var(--bg-sidebar)",
        borderBottom: "1px solid var(--border-sidebar)",
        padding: "24px 28px",
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ marginBottom: 14 }}>
            <button
              onClick={() => navigate("/")}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid var(--border-sidebar)",
                borderRadius: 5,
                color: "var(--text-sidebar)",
                padding: "5px 12px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              ← Home
            </button>
          </div>

          <div style={{ marginBottom: 16 }}>
            <h1 style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: "var(--text-sidebar)",
              fontFamily: "var(--font-sans)",
              fontStyle: "normal",
              letterSpacing: -0.3,
            }}>
              Learning &amp; CME
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-sidebar-m)" }}>
              Daily pearls, quizzes, courses — earn CME points and badges
            </p>
          </div>

          {/* Stats row in header */}
          <div style={{ display: "flex", gap: 20 }}>
            {[
              { label: "Points", value: stats.points.toLocaleString() },
              { label: "Streak", value: `${stats.streak}d` },
              { label: "Correct", value: stats.quizCorrect.toString() },
            ].map((s) => (
              <div key={s.label} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 16, color: "#58A6FF" }}>
                  {s.value}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-sidebar-m)" }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)", padding: "0 28px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", gap: 0 }}>
          {TAB_LABELS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-label={tab.aria}
              style={{
                padding: "12px 16px",
                border: "none",
                borderBottom: activeTab === tab.id ? "2px solid var(--brand)" : "2px solid transparent",
                background: "none",
                color: activeTab === tab.id ? "var(--brand)" : "var(--text-muted)",
                fontWeight: activeTab === tab.id ? 600 : 400,
                fontSize: 13,
                cursor: "pointer",
                transition: "color 0.1s ease",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 28px" }}>

        {/* ── Today tab ── */}
        {activeTab === "today" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <div style={{
                fontSize: 10, fontWeight: 600, color: "var(--text-muted)",
                letterSpacing: 0.7, textTransform: "uppercase" as const, marginBottom: 10,
              }}>
                Today's Clinical Pearl
              </div>
              {pearlLoading ? (
                <div style={{ background: "var(--bg-surface)", borderRadius: 8, border: "1px solid var(--border)", padding: 20, color: "var(--text-muted)", textAlign: "center", fontSize: 13 }}>
                  Loading pearl…
                </div>
              ) : pearl ? (
                <PearlCard pearl={pearl} />
              ) : (
                <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>Could not load pearl.</div>
              )}
            </div>

            <div>
              <div style={{
                fontSize: 10, fontWeight: 600, color: "var(--text-muted)",
                letterSpacing: 0.7, textTransform: "uppercase" as const, marginBottom: 10,
              }}>
                Quiz of the Day
              </div>
              <div style={{
                background: "var(--bg-surface)",
                borderRadius: 8,
                border: "1px solid var(--border)",
                padding: "16px 16px",
              }}>
                <QuizWidget />
              </div>
            </div>
          </div>
        )}

        {/* ── Courses tab ── */}
        {activeTab === "courses" && (
          <div>
            <div style={{
              fontSize: 10, fontWeight: 600, color: "var(--text-muted)",
              letterSpacing: 0.7, textTransform: "uppercase" as const, marginBottom: 14,
            }}>
              All Courses
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {courses.map((c) => <CourseCard key={c.id} course={c} />)}
            </div>
            {courses.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 0", fontSize: 13 }}>
                Loading courses…
              </div>
            )}

            <div style={{
              marginTop: 20,
              padding: "14px 16px",
              background: "var(--amber-light)",
              border: "1px solid rgba(217,119,6,0.20)",
              borderRadius: 6,
            }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", marginBottom: 3 }}>
                CME Credits
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Complete a full course to earn <strong>1 CME credit</strong>. Each module earns 50 points.
                Certificates generated upon course completion. Credits aligned with MCI/NMC guidelines.
              </div>
            </div>
          </div>
        )}

        {/* ── Badges tab ── */}
        {activeTab === "badges" && (
          <div>
            <div style={{
              fontSize: 10, fontWeight: 600, color: "var(--text-muted)",
              letterSpacing: 0.7, textTransform: "uppercase" as const, marginBottom: 14,
            }}>
              Achievements
            </div>
            <BadgeShelf earnedIds={stats.earnedBadgeIds} />

            <div style={{ marginTop: 28, marginBottom: 14 }}>
              <div style={{
                fontSize: 10, fontWeight: 600, color: "var(--text-muted)",
                letterSpacing: 0.7, textTransform: "uppercase" as const, marginBottom: 12,
              }}>
                Your Progress
              </div>
              <StatsRow stats={stats} />
            </div>

            {/* Points guide */}
            <div style={{
              background: "var(--bg-surface)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              overflow: "hidden",
            }}>
              {[
                { action: "Correct quiz answer",      points: 10 },
                { action: "Quiz attempt (any answer)", points: 2 },
                { action: "Read clinical pearl",       points: 3 },
                { action: "Complete a course module",  points: 50 },
                { action: "Daily login",               points: 5 },
              ].map((row, i) => (
                <div key={i} style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderBottom: i < 4 ? "1px solid var(--border)" : "none",
                  fontSize: 13,
                }}>
                  <span style={{ color: "var(--text-secondary)" }}>{row.action}</span>
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontWeight: 500,
                    fontSize: 12,
                    color: "var(--brand)",
                  }}>
                    +{row.points}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
