// frontend/src/pages/EmergencyProtocols.tsx
// Clinova — Emergency Protocols landing page
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { EmergencyProtocolSummary } from "../api/emergency";
import { fetchProtocols } from "../api/emergency";

function ProtocolRow({ p, onClick }: { p: EmergencyProtocolSummary; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const isUrgent = p.category === "URGENT";

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`Open ${p.name} emergency protocol`}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 16px",
        border: "none",
        borderBottom: "1px solid var(--border)",
        borderLeft: hovered
          ? `3px solid ${isUrgent ? "var(--amber)" : "var(--critical)"}`
          : "3px solid transparent",
        background: hovered ? "var(--bg-raised)" : "var(--bg-surface)",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.1s ease",
      }}
    >
      {/* Category badge */}
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 7px",
        borderRadius: 3,
        background: isUrgent ? "rgba(217,119,6,0.08)" : "var(--critical-light)",
        color: isUrgent ? "var(--amber)" : "var(--critical)",
        border: `1px solid ${isUrgent ? "rgba(217,119,6,0.20)" : "var(--critical-border)"}`,
        letterSpacing: 0.5,
        textTransform: "uppercase" as const,
        flexShrink: 0,
        minWidth: 54,
        textAlign: "center" as const,
      }}>
        {p.category}
      </span>

      {/* Name + summary */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)", marginBottom: 2 }}>
          {p.name}
        </div>
        <div style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {p.summary}
        </div>
      </div>

      {/* Meta */}
      <div style={{
        fontSize: 11,
        color: "var(--text-subtle)",
        fontFamily: "var(--font-mono)",
        flexShrink: 0,
        textAlign: "right" as const,
      }}>
        <div>{p.step_count} steps</div>
        <div>{p.medication_count} meds</div>
      </div>

      <span style={{ color: "var(--text-subtle)", fontSize: 14, flexShrink: 0 }}>→</span>
    </button>
  );
}

export default function EmergencyProtocols() {
  const navigate = useNavigate();
  const [protocols, setProtocols] = useState<EmergencyProtocolSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProtocols();
      setProtocols(data.protocols);
    } catch {
      setError("Could not load protocols. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

          <h1 style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            color: "var(--text-sidebar)",
            fontFamily: "var(--font-sans)",
            fontStyle: "normal",
            letterSpacing: -0.3,
            marginBottom: 4,
          }}>
            Emergency Protocols
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-sidebar-m)" }}>
            Step-by-step life-safety protocols with timers, dose calculators, and checklists.
          </p>
        </div>
      </div>

      {/* Clinical notice */}
      <div style={{
        background: "var(--amber-light)",
        borderBottom: "1px solid rgba(217,119,6,0.20)",
        padding: "8px 28px",
        textAlign: "center",
      }}>
        <span style={{ fontSize: 11, color: "var(--amber)" }}>
          These protocols support clinical decision-making. Verify doses for each patient's weight, age, and renal function.
        </span>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 28px" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)", fontSize: 13 }}>
            Loading emergency protocols…
          </div>
        )}

        {error && (
          <div style={{
            background: "var(--critical-light)",
            border: "1px solid var(--critical-border)",
            borderRadius: 6,
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span style={{ color: "var(--critical)", fontWeight: 600, fontSize: 13 }}>{error}</span>
            <button
              onClick={load}
              style={{
                padding: "6px 16px",
                background: "var(--critical)",
                color: "#fff",
                border: "none",
                borderRadius: 5,
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            <div style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              overflow: "hidden",
            }}>
              {protocols.map((p, i) => (
                <ProtocolRow
                  key={p.id}
                  p={p}
                  onClick={() => navigate(`/emergency/${p.id}`)}
                />
              ))}
              {protocols.length === 0 && (
                <div style={{ padding: "48px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  No protocols found.
                </div>
              )}
            </div>

            {/* Emergency contacts */}
            <div style={{
              marginTop: 20,
              padding: "14px 16px",
              background: "var(--bg-surface)",
              borderRadius: 6,
              border: "1px solid var(--border)",
              borderLeft: "3px solid var(--critical)",
            }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-primary)", marginBottom: 5 }}>
                Emergency Contacts
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                National Emergency: <strong>112</strong> &nbsp;·&nbsp;
                Ambulance: <strong>108</strong> &nbsp;·&nbsp;
                Poison Control: <strong>1800-11-6117</strong> &nbsp;·&nbsp;
                Women Helpline: <strong>181</strong>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
