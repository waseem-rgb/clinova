// frontend/src/components/SidebarNav.tsx
// Clinova — Dark teal premium sidebar navigation
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
  Syringe,
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
      { icon: Syringe,     label: "Drug Dose Calculator",   path: "/dose-calculator" },
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
        background: "var(--teal-900)",
        padding: "20px 0 24px",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        position: "sticky",
        top: 0,
      }}
    >
      {/* Brand mark */}
      <div style={{ padding: "0 18px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <svg width="22" height="22" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <rect x="13" y="4"  width="10" height="28" rx="3" fill="#fff" />
            <rect x="4"  y="13" width="28" height="10" rx="3" fill="#fff" />
          </svg>
          <div style={{
            fontFamily: "var(--font-display)",
            fontWeight: 400,
            color: "#fff",
            letterSpacing: -0.3,
            fontSize: 20,
          }}>
            Clinova
          </div>
        </div>
        <div style={{
          color: "rgba(255,255,255,0.45)",
          fontSize: 11,
          marginTop: 3,
          paddingLeft: 31,
          letterSpacing: 0.2,
          fontWeight: 500,
        }}>
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
                letterSpacing: 1,
                textTransform: "uppercase",
                color: "#5eead4",
                padding: "0 8px",
                marginBottom: 6,
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
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "none",
                    borderLeft: active
                      ? `3px solid ${isCritical ? "var(--critical)" : "#5eead4"}`
                      : "3px solid transparent",
                    paddingLeft: active ? 7 : 10,
                    background: active
                      ? isCritical
                        ? "rgba(220,38,38,0.12)"
                        : "rgba(94,234,212,0.1)"
                      : "transparent",
                    color: active
                      ? isCritical ? "#fca5a5" : "#fff"
                      : isCritical ? "#fca5a5" : "rgba(255,255,255,0.75)",
                    cursor: "pointer",
                    fontWeight: active ? 600 : 450,
                    fontSize: 13,
                    transition: "all 0.12s ease",
                    marginBottom: 2,
                    fontFamily: "var(--font-sans)",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                      e.currentTarget.style.color = "#fff";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = isCritical ? "#fca5a5" : "rgba(255,255,255,0.75)";
                    }
                  }}
                >
                  <Icon
                    size={15}
                    strokeWidth={active ? 2.2 : 1.8}
                    style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }}
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
    </aside>
  );
}
