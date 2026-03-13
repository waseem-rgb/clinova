// frontend/src/components/DisclaimerBanner.tsx
// Clinova — Subtle fixed clinical notice footer

export default function DisclaimerBanner() {
  return (
    <div
      role="complementary"
      aria-label="Clinical disclaimer"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        background: "rgba(248,250,251,0.92)",
        backdropFilter: "blur(8px)",
        borderTop: "1px solid var(--border)",
        padding: "6px 20px",
        textAlign: "center",
      }}
    >
      <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
        Clinova supports clinical decision-making. Final judgment remains with the treating physician.
      </span>
    </div>
  );
}
