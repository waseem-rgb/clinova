// frontend/src/components/WorkspaceDrawer.tsx
/**
 * Clinical Workspace Drawer.
 * 
 * A persistent right-side panel that appears on ALL feature pages.
 * Shows context chips, navigation, and "New Case" button.
 */

import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useWorkspace } from "../store/workspaceStore";

interface WorkspaceDrawerProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

export default function WorkspaceDrawer({ isOpen = true, onToggle }: WorkspaceDrawerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    caseId,
    context,
    outputs,
    isLoading,
    isSaving,
    error,
    newCase,
    saveCase,
    clearError,
  } = useWorkspace();

  const [showSummary, setShowSummary] = useState(false);

  // Feature navigation items
  const navItems = [
    { label: "DDx", path: "/ddx", icon: "" },
    { label: "Treatment", path: "/treatment", icon: "" },
    { label: "Drug Details", path: "/drug", icon: "" },
    { label: "Interactions", path: "/interactions", icon: "" },
    { label: "Lab", path: "/lab", icon: "" },
  ];

  // Build context chips
  const contextChips: Array<{ label: string; value: string; type: string }> = [];
  
  if (context.active_condition) {
    contextChips.push({ label: "Condition", value: context.active_condition, type: "condition" });
  }
  if (context.symptoms) {
    contextChips.push({ label: "Symptoms", value: context.symptoms.slice(0, 50) + (context.symptoms.length > 50 ? "..." : ""), type: "symptom" });
  }
  if (context.age) {
    contextChips.push({ label: "Age", value: String(context.age), type: "demo" });
  }
  if (context.sex && context.sex !== "unknown") {
    contextChips.push({ label: "Sex", value: context.sex, type: "demo" });
  }
  if (context.comorbidities.length > 0) {
    contextChips.push({ label: "Comorbidities", value: context.comorbidities.slice(0, 3).join(", "), type: "comorbidity" });
  }
  if (context.current_meds.length > 0) {
    contextChips.push({ label: "Meds", value: context.current_meds.slice(0, 3).join(", "), type: "med" });
  }
  if (context.allergies.length > 0) {
    contextChips.push({ label: "Allergies", value: context.allergies.join(", "), type: "allergy" });
  }
  if (context.selected_ddx.length > 0) {
    contextChips.push({ label: "Working Dx", value: context.selected_ddx.slice(0, 3).join(", "), type: "ddx" });
  }
  if (context.selected_drugs.length > 0) {
    contextChips.push({ label: "Selected Drugs", value: context.selected_drugs.slice(0, 3).join(", "), type: "drug" });
  }

  // Build output summary
  const outputSummary: string[] = [];
  if (outputs.ddx_result) {
    const ddxCount = outputs.ddx_result?.ranked_ddx?.length || 0;
    outputSummary.push(`DDx: ${ddxCount} diagnoses`);
  }
  if (outputs.treatment_result) {
    outputSummary.push(`Treatment: ${outputs.treatment_result?.topic || "loaded"}`);
  }
  if (Object.keys(outputs.drug_detail_cache || {}).length > 0) {
    outputSummary.push(`Drugs: ${Object.keys(outputs.drug_detail_cache).length} cached`);
  }
  if (outputs.interaction_result) {
    const intCount = outputs.interaction_result?.interactions?.length || 0;
    outputSummary.push(`Interactions: ${intCount} found`);
  }
  if (outputs.lab_result) {
    const abnCount = outputs.lab_result?.abnormalities_count || 0;
    outputSummary.push(`Lab: ${abnCount} abnormalities`);
  }

  const handleNewCase = async () => {
    if (confirm("Start a new case? This will clear all current data.")) {
      await newCase();
      navigate("/ddx");
    }
  };

  const handleSave = async () => {
    await saveCase();
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        style={{
          position: "fixed",
          right: 0,
          top: "50%",
          transform: "translateY(-50%)",
          padding: "12px 6px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRight: "none",
          borderRadius: "8px 0 0 8px",
          cursor: "pointer",
          boxShadow: "-4px 0 12px rgba(0,0,0,0.08)",
          zIndex: 100,
        }}
        title="Open Workspace"
      >
        <span style={{ writingMode: "vertical-rl", fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>
          📋 Workspace
        </span>
      </button>
    );
  }

  return (
    <aside
      style={{
        position: "fixed",
        right: 0,
        top: 0,
        bottom: 0,
        width: 280,
        background: "var(--surface)",
        borderLeft: "1px solid var(--border)",
        boxShadow: "-8px 0 24px rgba(15,23,42,0.08)",
        display: "flex",
        flexDirection: "column",
        zIndex: 100,
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontWeight: 800, color: "var(--ink)", fontSize: 14 }}>📋 Workspace</div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
            {caseId ? `Case: ${caseId.slice(0, 8)}...` : "Loading..."}
          </div>
        </div>
        {onToggle && (
          <button
            onClick={onToggle}
            style={{
              padding: "4px 8px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "var(--surface-2)",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Status */}
      {(isLoading || isSaving) && (
        <div style={{ padding: "8px 16px", background: "rgba(14,165,164,0.1)", fontSize: 12, color: "var(--accent)" }}>
          {isLoading ? "Loading..." : "Saving..."}
        </div>
      )}
      {error && (
        <div
          style={{
            padding: "8px 16px",
            background: "rgba(185,28,28,0.1)",
            fontSize: 12,
            color: "#b91c1c",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{error}</span>
          <button onClick={clearError} style={{ background: "none", border: "none", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* New Case Button */}
      <div style={{ padding: "12px 16px" }}>
        <button
          onClick={handleNewCase}
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: 10,
            border: "1px solid var(--accent)",
            background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          + New Case
        </button>
      </div>

      {/* Context Chips */}
      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ fontWeight: 700, fontSize: 11, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase" }}>
          Patient Context
        </div>
        {contextChips.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
            No context set yet. Start with DDx or Treatment.
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {contextChips.map((chip, idx) => (
              <div
                key={`${chip.label}-${idx}`}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  fontSize: 11,
                }}
                title={`${chip.label}: ${chip.value}`}
              >
                <span style={{ fontWeight: 700, color: "var(--muted)" }}>{chip.label}:</span>{" "}
                <span style={{ color: "var(--ink)" }}>{chip.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ fontWeight: 700, fontSize: 11, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase" }}>
          Go To
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: isActive ? "1px solid var(--accent)" : "1px solid var(--border)",
                  background: isActive ? "rgba(14,165,164,0.1)" : "var(--surface-2)",
                  color: isActive ? "var(--accent)" : "var(--ink)",
                  fontWeight: 700,
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 12,
                }}
              >
                {item.icon} {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Output Summary */}
      {outputSummary.length > 0 && (
        <div style={{ padding: "0 16px 12px" }}>
          <div style={{ fontWeight: 700, fontSize: 11, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase" }}>
            Cached Results
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            {outputSummary.map((summary, idx) => (
              <div
                key={idx}
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  padding: "4px 8px",
                  background: "var(--surface-2)",
                  borderRadius: 4,
                }}
              >
                ✓ {summary}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clinical Summary Toggle */}
      <div style={{ padding: "0 16px 12px", marginTop: "auto" }}>
        <button
          onClick={() => setShowSummary(!showSummary)}
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            color: "var(--ink)",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          {showSummary ? "Hide" : "Show"} Clinical Summary
        </button>
        
        {showSummary && (
          <div
            style={{
              marginTop: 8,
              padding: 12,
              background: "var(--surface-2)",
              borderRadius: 8,
              fontSize: 11,
              color: "var(--muted)",
              maxHeight: 200,
              overflowY: "auto",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--ink)" }}>Clinical Summary</div>
            {context.active_condition && (
              <div><b>Condition:</b> {context.active_condition}</div>
            )}
            {context.symptoms && (
              <div><b>Symptoms:</b> {context.symptoms}</div>
            )}
            {context.duration && (
              <div><b>Duration:</b> {context.duration}</div>
            )}
            {context.age && (
              <div><b>Age:</b> {context.age} {context.sex && context.sex !== "unknown" ? `(${context.sex})` : ""}</div>
            )}
            {context.comorbidities.length > 0 && (
              <div><b>Comorbidities:</b> {context.comorbidities.join(", ")}</div>
            )}
            {context.current_meds.length > 0 && (
              <div><b>Current Meds:</b> {context.current_meds.join(", ")}</div>
            )}
            {context.allergies.length > 0 && (
              <div><b>Allergies:</b> {context.allergies.join(", ")}</div>
            )}
            {context.selected_ddx.length > 0 && (
              <div><b>Working Dx:</b> {context.selected_ddx.join(", ")}</div>
            )}
            {context.selected_drugs.length > 0 && (
              <div><b>Selected Drugs:</b> {context.selected_drugs.join(", ")}</div>
            )}
            
            {contextChips.length === 0 && outputSummary.length === 0 && (
              <div style={{ fontStyle: "italic" }}>No data collected yet.</div>
            )}
          </div>
        )}
      </div>

      {/* Save Button */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
        <button
          onClick={handleSave}
          disabled={isSaving}
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: isSaving ? "var(--surface-2)" : "var(--surface)",
            color: isSaving ? "var(--muted)" : "var(--ink)",
            fontWeight: 600,
            cursor: isSaving ? "not-allowed" : "pointer",
            fontSize: 12,
          }}
        >
          {isSaving ? "Saving..." : "💾 Save to Server"}
        </button>
      </div>
    </aside>
  );
}
