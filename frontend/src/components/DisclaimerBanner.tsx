// frontend/src/components/DisclaimerBanner.tsx
// Clinova — Minimal clinical disclaimer strip

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
        background: "var(--amber-light)",
        borderTop: "1px solid rgba(217,119,6,0.20)",
        padding: "5px 20px",
        textAlign: "center",
      }}
    >
      <span style={{ fontSize: 11, color: "var(--amber)", lineHeight: 1.4 }}>
        <strong>Clinical Notice:</strong>{" "}
        Clinova supports clinical decision-making. Final judgment remains with the treating physician.
      </span>
    </div>
  );
}
