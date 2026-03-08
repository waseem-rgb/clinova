// frontend/src/components/GenerateTopicModal.tsx
// AI-powered topic generation modal with animated progress steps
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";

interface GenerateTopicModalProps {
  onClose: () => void;
  initialTopic?: string;
  onGenerated?: (slug: string) => void;
}

const SPECIALTIES = [
  "General Medicine", "Cardiology", "Pulmonology", "Gastroenterology",
  "Nephrology", "Neurology", "Endocrinology", "Dermatology",
  "Psychiatry", "Obstetrics & Gynecology", "Pediatrics", "Surgery",
  "Emergency Medicine", "Orthopedics", "Ophthalmology", "ENT",
  "Infectious Disease", "Rheumatology", "Hematology", "Oncology",
];

const STEPS = [
  "Researching clinical evidence…",
  "Structuring medical content…",
  "Generating India-specific guidance…",
];

export default function GenerateTopicModal({
  onClose, initialTopic = "", onGenerated,
}: GenerateTopicModalProps) {
  const navigate = useNavigate();
  const [topic,      setTopic]      = useState(initialTopic);
  const [specialty,  setSpecialty]  = useState("General Medicine");
  const [generating, setGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [result,     setResult]     = useState<{ slug: string; title: string } | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  // Animate steps forward while generating
  useEffect(() => {
    if (!generating) return;
    setCurrentStep(0);
    const t1 = setTimeout(() => setCurrentStep(1), 5000);
    const t2 = setTimeout(() => setCurrentStep(2), 13000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [generating]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !generating) onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [generating, onClose]);

  const handleGenerate = async () => {
    const trimmed = topic.trim();
    if (!trimmed) return;

    setError(null);
    setResult(null);
    setGenerating(true);

    try {
      const res = await fetch("/api/topics/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: trimmed, specialty, force: false }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          // Topic already exists — navigate to it
          const slug = trimmed.toLowerCase().replace(/[\s/]+/g, "_").replace(/[^a-z0-9_]/g, "");
          setResult({ slug, title: trimmed });
        } else {
          setError(data.detail ?? "Generation failed. Please try again.");
        }
      } else {
        setResult({ slug: data.slug, title: data.title ?? trimmed });
        onGenerated?.(data.slug);
      }
    } catch {
      setError("Network error. Make sure the backend is running.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !generating) onClose(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(13,17,23,0.65)",
        backdropFilter: "blur(4px)",
        zIndex: 900,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div style={{
        background: "var(--bg-surface)",
        borderRadius: 12,
        width: "100%", maxWidth: 480,
        boxShadow: "0 24px 60px rgba(0,0,0,0.28)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 22px 16px",
          borderBottom: "1px solid var(--border)",
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>
              Generate Topic with AI
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              claude-opus-4-5 · India-specific · ~30 seconds
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={generating}
            style={{
              background: "none", border: "none", cursor: generating ? "not-allowed" : "pointer",
              color: "var(--text-muted)", padding: 4, opacity: generating ? 0.4 : 1,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "22px" }}>
          {result ? (
            /* ── Success ── */
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: "var(--brand-light)", border: "2px solid var(--brand)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 14px", fontSize: 20, color: "var(--brand)",
              }}>
                ✓
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", marginBottom: 6 }}>
                Topic Generated!
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
                <strong>{result.title}</strong> is ready to view.
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button
                  onClick={() => { navigate(`/topics/${result.slug}`); onClose(); }}
                  style={{
                    background: "var(--brand)", color: "#fff",
                    border: "none", borderRadius: 6,
                    padding: "10px 22px", fontWeight: 600, fontSize: 13, cursor: "pointer",
                  }}
                >
                  Open Topic →
                </button>
                <button
                  onClick={() => { setResult(null); setTopic(""); }}
                  style={{
                    background: "none", color: "var(--text-muted)",
                    border: "1px solid var(--border)", borderRadius: 6,
                    padding: "10px 16px", fontWeight: 500, fontSize: 13, cursor: "pointer",
                  }}
                >
                  Generate Another
                </button>
              </div>
            </div>
          ) : generating ? (
            /* ── Generating (animated steps) ── */
            <div style={{ padding: "8px 0" }}>
              {STEPS.map((step, i) => {
                const done   = i < currentStep;
                const active = i === currentStep;
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "11px 0",
                    borderBottom: i < STEPS.length - 1 ? "1px solid var(--border)" : "none",
                    opacity: i > currentStep ? 0.3 : 1,
                    transition: "opacity 0.4s ease",
                  }}>
                    {/* Step indicator */}
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                      border: done ? "none" : `2px solid ${active ? "var(--brand)" : "var(--border)"}`,
                      background: done ? "var(--brand)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {done ? (
                        <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>
                      ) : active ? (
                        <span style={{
                          display: "inline-block",
                          width: 8, height: 8, borderRadius: "50%",
                          background: "var(--brand)",
                          animation: "topicPulse 1.1s ease-in-out infinite",
                        }} />
                      ) : (
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 9,
                          color: "var(--text-muted)", fontWeight: 600,
                        }}>
                          {i + 1}
                        </span>
                      )}
                    </div>
                    <span style={{
                      fontSize: 13, fontWeight: active ? 500 : 400,
                      color: active ? "var(--text-primary)" : "var(--text-muted)",
                    }}>
                      {step}
                    </span>
                  </div>
                );
              })}
              <div style={{
                marginTop: 16, fontSize: 11, color: "var(--text-muted)", textAlign: "center",
              }}>
                This takes ~30 seconds — please wait…
              </div>
            </div>
          ) : (
            /* ── Form ── */
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {error && (
                <div style={{
                  padding: "10px 14px",
                  background: "var(--critical-light)",
                  border: "1px solid var(--critical-border)",
                  borderLeft: "3px solid var(--critical)",
                  borderRadius: "0 6px 6px 0",
                  fontSize: 13, color: "var(--critical)",
                }}>
                  {error}
                </div>
              )}

              <div>
                <label style={{
                  fontSize: 11, fontWeight: 600, color: "var(--text-secondary)",
                  display: "block", marginBottom: 5,
                }}>
                  Topic Name
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleGenerate(); }}
                  placeholder="e.g. Hypothyroidism, Septic Shock, GERD…"
                  autoFocus
                  style={{
                    width: "100%", padding: "10px 12px", fontSize: 13,
                    border: "1px solid var(--border)", borderRadius: 6,
                    background: "var(--bg-base)", color: "var(--text-primary)",
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{
                  fontSize: 11, fontWeight: 600, color: "var(--text-secondary)",
                  display: "block", marginBottom: 5,
                }}>
                  Primary Specialty
                </label>
                <select
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  style={{
                    width: "100%", padding: "10px 12px", fontSize: 13,
                    border: "1px solid var(--border)", borderRadius: 6,
                    background: "var(--bg-base)", color: "var(--text-primary)",
                    outline: "none", cursor: "pointer", boxSizing: "border-box",
                  }}
                >
                  {SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <button
                onClick={handleGenerate}
                disabled={!topic.trim()}
                style={{
                  padding: "11px 0",
                  background: topic.trim() ? "var(--brand)" : "var(--bg-raised)",
                  color: topic.trim() ? "#fff" : "var(--text-subtle)",
                  border: "none", borderRadius: 6,
                  fontWeight: 600, fontSize: 13,
                  cursor: topic.trim() ? "pointer" : "not-allowed",
                  transition: "background 0.15s",
                }}
              >
                Generate with AI →
              </button>

              <p style={{ margin: 0, fontSize: 11, color: "var(--text-subtle)", textAlign: "center" }}>
                Requires ANTHROPIC_API_KEY in backend/.env
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes topicPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.75); }
        }
      `}</style>
    </div>
  );
}
