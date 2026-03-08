// frontend/src/components/TopBar.tsx
// Clinova — Minimal white top bar
import { Link } from "react-router-dom";

export default function TopBar() {
  return (
    <div style={{
      position: "sticky",
      top: 0,
      zIndex: 50,
      height: 52,
      background: "var(--bg-surface)",
      borderBottom: "1px solid var(--border)",
      display: "flex",
      alignItems: "center",
      padding: "0 24px",
    }}>
      <Link
        to="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          textDecoration: "none",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 36 36" fill="none" aria-label="Clinova">
          <rect x="13" y="4"  width="10" height="28" rx="3" fill="var(--brand)" />
          <rect x="4"  y="13" width="28" height="10" rx="3" fill="var(--brand)" />
        </svg>
        <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14, letterSpacing: 0.2 }}>
          Clinova
        </span>
      </Link>
    </div>
  );
}
