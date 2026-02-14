import { Link } from "react-router-dom";

export default function TopBar() {
  return (
    <div style={styles.wrap}>
      <div style={styles.inner}>
        <div style={styles.brand}>
          <Link to="/" style={styles.brandLink}>
            <div style={styles.logoDot} />
            <div>
              <div style={styles.title}>MedCompanion</div>
              <div style={styles.sub}>Doctor-grade textbook search · RAG-only</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: "sticky",
    top: 0,
    zIndex: 50,
    backdropFilter: "blur(10px)",
    background: "rgba(10, 18, 40, 0.65)",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  inner: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { display: "flex", alignItems: "center", gap: 12 },
  brandLink: { display: "flex", alignItems: "center", gap: 12, textDecoration: "none" },
  logoDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    background: "linear-gradient(135deg, #6aa9ff, #7c3aed)",
    boxShadow: "0 0 18px rgba(106,169,255,0.45)",
  },
  title: { fontSize: 18, fontWeight: 800, color: "rgba(255,255,255,0.92)", letterSpacing: 0.2 },
  sub: { fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 },
};
