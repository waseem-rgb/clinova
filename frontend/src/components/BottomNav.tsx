// frontend/src/components/BottomNav.tsx
// Clinova — Mobile bottom navigation: 5 core workflow tabs
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, GitBranch, FileText, AlertTriangle, Calculator } from "lucide-react";

const NAV_ITEMS = [
  { Icon: Search,        label: "Drugs",      path: "/drugs" },
  { Icon: GitBranch,     label: "DDx",        path: "/ddx" },
  { Icon: FileText,      label: "Rx",         path: "/prescription" },
  { Icon: AlertTriangle, label: "Emergency",  path: "/emergency", critical: true },
  { Icon: Calculator,    label: "Calc",       path: "/calculators" },
] as const;

function getRxCount(): number {
  try {
    const raw = localStorage.getItem("clinova_current_rx");
    if (!raw) return 0;
    const rx = JSON.parse(raw);
    return rx?.drugs?.length || 0;
  } catch { return 0; }
}

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [rxCount, setRxCount] = useState(getRxCount);

  // Listen for Rx changes
  useEffect(() => {
    const handler = () => setRxCount(getRxCount());
    window.addEventListener("storage", handler);
    window.addEventListener("rx-updated", handler);
    // Poll on route change
    setRxCount(getRxCount());
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("rx-updated", handler);
    };
  }, [location.pathname]);

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <>
      <style>{`
        #clinova-bottom-nav { display: none; }
        @media (max-width: 767px) {
          #clinova-bottom-nav { display: flex; }
          body { padding-bottom: 72px; }
        }
      `}</style>

      <nav
        id="clinova-bottom-nav"
        role="navigation"
        aria-label="Mobile bottom navigation"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 300,
          background: "#fff",
          borderTop: "1px solid var(--border)",
          alignItems: "stretch",
          justifyContent: "space-around",
          height: 60,
          paddingBottom: "env(safe-area-inset-bottom, 8px)",
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.path);
          const isCritical = "critical" in item && item.critical;
          const Icon = item.Icon;
          const isRx = item.path === "/prescription";

          const color = isCritical
            ? active ? "var(--critical)" : "#9ca3af"
            : active ? "var(--teal-700)" : "#9ca3af";

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                padding: "6px 0",
                position: "relative",
              }}
            >
              <div style={{ position: "relative" }}>
                <Icon
                  size={20}
                  strokeWidth={active ? 2.4 : 1.8}
                  color={color}
                />
                {isRx && rxCount > 0 && (
                  <span style={{
                    position: "absolute",
                    top: -4,
                    right: -8,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    background: "var(--teal-700)",
                    color: "#fff",
                    fontSize: 9,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 4px",
                    fontFamily: "var(--font-mono)",
                  }}>
                    {rxCount}
                  </span>
                )}
              </div>
              <span style={{
                fontSize: 10,
                fontWeight: active ? 700 : 500,
                color,
                lineHeight: 1,
              }}>
                {item.label}
              </span>
              {active && (
                <div style={{
                  position: "absolute",
                  top: 0,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 20,
                  height: 2,
                  borderRadius: 1,
                  background: isCritical ? "var(--critical)" : "var(--teal-700)",
                }} />
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
}
