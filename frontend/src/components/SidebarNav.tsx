// frontend/src/components/SidebarNav.tsx
// Clinova — Dark premium sidebar navigation
import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Home,
  AlertTriangle,
  GitBranch,
  ClipboardList,
  Pill,
  Zap,
  Calculator,
  FlaskConical,
  FileText,
  ScanLine,
  BookOpen,
  Library,
} from "lucide-react";

const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { icon: Home, label: "Home", path: "/" },
    ],
  },
  {
    label: "Clinical Tools",
    items: [
      { icon: GitBranch,    label: "Differential Diagnosis", path: "/ddx" },
      { icon: ClipboardList,label: "Treatment Advisor",      path: "/treatment" },
      { icon: Pill,         label: "Drug Database",          path: "/drug" },
      { icon: Zap,          label: "Drug Interactions",      path: "/interactions" },
      { icon: Calculator,   label: "Calculators",            path: "/calculators" },
      { icon: FlaskConical, label: "Lab Interpretation",     path: "/lab" },
      { icon: FileText,     label: "Prescription Studio",    path: "/prescription" },
      { icon: ScanLine,     label: "Image Interpretation",   path: "/image" },
    ],
  },
  {
    label: "Emergency",
    items: [
      { icon: AlertTriangle, label: "Emergency Protocols", path: "/emergency", critical: true },
    ],
  },
  {
    label: "Education",
    items: [
      { icon: Library,  label: "Topic Library",   path: "/topics" },
      { icon: BookOpen, label: "Learning & CME",   path: "/learning" },
    ],
  },
] as const;

export default function SidebarNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <aside
      style={{
        width: 240,
        minWidth: 240,
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--border-sidebar)",
        padding: "20px 0 24px",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        position: "sticky",
        top: 0,
      }}
    >
      {/* Brand mark */}
      <div style={{ padding: "0 18px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="20" height="20" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <rect x="13" y="4"  width="10" height="28" rx="3" fill="#C9D1D9" />
            <rect x="4"  y="13" width="28" height="10" rx="3" fill="#C9D1D9" />
          </svg>
          <div style={{ fontWeight: 700, color: "#C9D1D9", letterSpacing: 0.3, fontSize: 15 }}>
            Clinova
          </div>
        </div>
        <div style={{ color: "var(--text-sidebar-m)", fontSize: 10, marginTop: 4, paddingLeft: 28, letterSpacing: 0.3 }}>
          Evidence-Based Medicine
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "0 10px" }}>
        {NAV_SECTIONS.map((section, si) => (
          <div key={si} style={{ marginBottom: section.label ? 20 : 8 }}>
            {section.label && (
              <div style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.7,
                textTransform: "uppercase",
                color: "var(--text-sidebar-m)",
                padding: "0 8px",
                marginBottom: 4,
              }}>
                {section.label}
              </div>
            )}
            {section.items.map((item) => {
              const active = isActive(item.path);
              const isCritical = "critical" in item && item.critical;
              const Icon = item.icon;

              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "8px 8px",
                    borderRadius: 6,
                    border: "none",
                    borderLeft: active
                      ? `2px solid ${isCritical ? "var(--critical)" : "var(--brand)"}`
                      : "2px solid transparent",
                    paddingLeft: active ? 6 : 8,
                    background: active
                      ? isCritical
                        ? "rgba(207,34,46,0.10)"
                        : "rgba(10,110,94,0.12)"
                      : "transparent",
                    color: active
                      ? isCritical ? "#F87171" : "#58A6FF"
                      : isCritical ? "#F87171" : "var(--text-sidebar)",
                    cursor: "pointer",
                    fontWeight: active ? 600 : 400,
                    fontSize: 13,
                    transition: "background 0.1s ease, color 0.1s ease",
                    marginBottom: 2,
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = "var(--bg-sidebar-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Icon
                    size={14}
                    strokeWidth={active ? 2.2 : 1.8}
                    style={{ flexShrink: 0, opacity: active ? 1 : 0.75 }}
                  />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div style={{
        margin: "0 10px",
        padding: "10px 10px",
        background: "rgba(255,255,255,0.04)",
        borderRadius: 6,
        border: "1px solid var(--border-sidebar)",
      }}>
        <p style={{ margin: 0, fontSize: 11, color: "var(--text-sidebar-m)", lineHeight: 1.5 }}>
          Search any condition for evidence-based DDx, treatment, and drug guidance.
        </p>
      </div>
    </aside>
  );
}
