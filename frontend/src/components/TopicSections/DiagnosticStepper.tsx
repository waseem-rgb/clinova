// frontend/src/components/TopicSections/DiagnosticStepper.tsx
import React from "react";
import type { TopicContent } from "../../types/topic";

interface Props {
  steps: TopicContent["diagnosticApproach"]["stepByStep"];
}

export default function DiagnosticStepper({ steps }: Props) {
  return (
    <div style={{ position: "relative", paddingLeft: 32 }}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        return (
          <div key={step.step} style={{ position: "relative", marginBottom: isLast ? 0 : 20 }}>
            {/* Step number circle */}
            <div style={{
              position: "absolute",
              left: -32,
              top: 0,
              width: 22,
              height: 22,
              background: "var(--brand)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "#fff",
              fontWeight: 600,
              flexShrink: 0,
            }}>
              {step.step}
            </div>

            {/* Connector line */}
            {!isLast && (
              <div style={{
                position: "absolute",
                left: -22,
                top: 22,
                bottom: -20,
                width: 1,
                background: "#D0D7DE",
              }} />
            )}

            {/* Content */}
            <div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                <span style={{
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: "#1A2B3C",
                  lineHeight: 1.4,
                  flex: 1,
                }}>
                  {step.action}
                </span>
                {step.atPHC && (
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: "#2DA44E",
                    border: "1px solid rgba(17,99,41,0.25)",
                    padding: "2px 6px",
                    borderRadius: 3,
                    flexShrink: 0,
                    marginTop: 2,
                  }}>
                    PHC
                  </span>
                )}
              </div>
              <div style={{
                fontSize: 12.5,
                color: "#57606A",
                marginTop: 3,
                lineHeight: 1.5,
              }}>
                {step.rationale}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
