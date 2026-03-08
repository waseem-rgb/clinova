// frontend/src/components/BottomNav.tsx
// Clinova — Mobile bottom navigation (shown only <768px)
import { useLocation, useNavigate } from "react-router-dom";
import { Home, AlertTriangle, Pill, BookOpen, Search } from "lucide-react";

const NAV_ITEMS = [
  { Icon: Home,          label: "Home",      path: "/" },
  { Icon: Search,        label: "Search",    path: "/?focus=1" },
  { Icon: AlertTriangle, label: "Emergency", path: "/emergency", critical: true },
  { Icon: Pill,          label: "Drugs",     path: "/drug" },
  { Icon: BookOpen,      label: "Learn",     path: "/learning" },
] as const;

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    const base = path.split("?")[0];
    if (base === "/") return location.pathname === "/";
    return location.pathname.startsWith(base);
  };

  return (
    <>
      <style>{`
        #clinova-bottom-nav { display: none; }
        @media (max-width: 767px) {
          #clinova-bottom-nav { display: flex; }
          body { padding-bottom: 60px; }
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
          background: "var(--bg-surface)",
          borderTop: "1px solid var(--border)",
          alignItems: "stretch",
          justifyContent: "space-around",
          height: 56,
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.path);
          const isCritical = "critical" in item && item.critical;
          const Icon = item.Icon;

          const color = isCritical
            ? "var(--critical)"
            : active ? "var(--brand)" : "var(--text-subtle)";

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
                gap: 3,
                border: "none",
                borderTop: isCritical && active ? "2px solid var(--critical)" : "2px solid transparent",
                background: "transparent",
                cursor: "pointer",
                padding: "6px 0",
              }}
            >
              <Icon
                size={18}
                strokeWidth={active ? 2.2 : 1.8}
                color={color}
              />
              <span style={{
                fontSize: 10,
                fontWeight: active ? 600 : 400,
                color,
                lineHeight: 1,
              }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
