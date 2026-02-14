import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// frontend/src/components/WorkspaceDrawer.tsx
/**
 * Clinical Workspace Drawer.
 *
 * A persistent right-side panel that appears on ALL feature pages.
 * Shows context chips, navigation, and "New Case" button.
 */
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useWorkspace } from "../store/workspaceStore";
export default function WorkspaceDrawer({ isOpen = true, onToggle }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { caseId, context, outputs, isLoading, isSaving, error, newCase, saveCase, clearError, } = useWorkspace();
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
    const contextChips = [];
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
    const outputSummary = [];
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
        return (_jsx("button", { onClick: onToggle, style: {
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
            }, title: "Open Workspace", children: _jsx("span", { style: { writingMode: "vertical-rl", fontSize: 12, fontWeight: 700, color: "var(--ink)" }, children: "\uD83D\uDCCB Workspace" }) }));
    }
    return (_jsxs("aside", { style: {
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
        }, children: [_jsxs("div", { style: {
                    padding: "16px",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 800, color: "var(--ink)", fontSize: 14 }, children: "\uD83D\uDCCB Workspace" }), _jsx("div", { style: { fontSize: 10, color: "var(--muted)", marginTop: 2 }, children: caseId ? `Case: ${caseId.slice(0, 8)}...` : "Loading..." })] }), onToggle && (_jsx("button", { onClick: onToggle, style: {
                            padding: "4px 8px",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            background: "var(--surface-2)",
                            cursor: "pointer",
                            fontSize: 12,
                        }, children: "\u2715" }))] }), (isLoading || isSaving) && (_jsx("div", { style: { padding: "8px 16px", background: "rgba(14,165,164,0.1)", fontSize: 12, color: "var(--accent)" }, children: isLoading ? "Loading..." : "Saving..." })), error && (_jsxs("div", { style: {
                    padding: "8px 16px",
                    background: "rgba(185,28,28,0.1)",
                    fontSize: 12,
                    color: "#b91c1c",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }, children: [_jsx("span", { children: error }), _jsx("button", { onClick: clearError, style: { background: "none", border: "none", cursor: "pointer" }, children: "\u2715" })] })), _jsx("div", { style: { padding: "12px 16px" }, children: _jsx("button", { onClick: handleNewCase, style: {
                        width: "100%",
                        padding: "10px",
                        borderRadius: 10,
                        border: "1px solid var(--accent)",
                        background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                        color: "#fff",
                        fontWeight: 800,
                        cursor: "pointer",
                        fontSize: 13,
                    }, children: "+ New Case" }) }), _jsxs("div", { style: { padding: "0 16px 12px" }, children: [_jsx("div", { style: { fontWeight: 700, fontSize: 11, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase" }, children: "Patient Context" }), contextChips.length === 0 ? (_jsx("div", { style: { fontSize: 12, color: "var(--muted)", fontStyle: "italic" }, children: "No context set yet. Start with DDx or Treatment." })) : (_jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 }, children: contextChips.map((chip, idx) => (_jsxs("div", { style: {
                                padding: "4px 8px",
                                borderRadius: 6,
                                background: "var(--surface-2)",
                                border: "1px solid var(--border)",
                                fontSize: 11,
                            }, title: `${chip.label}: ${chip.value}`, children: [_jsxs("span", { style: { fontWeight: 700, color: "var(--muted)" }, children: [chip.label, ":"] }), " ", _jsx("span", { style: { color: "var(--ink)" }, children: chip.value })] }, `${chip.label}-${idx}`))) }))] }), _jsxs("div", { style: { padding: "0 16px 12px" }, children: [_jsx("div", { style: { fontWeight: 700, fontSize: 11, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase" }, children: "Go To" }), _jsx("div", { style: { display: "grid", gap: 6 }, children: navItems.map((item) => {
                            const isActive = location.pathname === item.path;
                            return (_jsxs("button", { onClick: () => navigate(item.path), style: {
                                    padding: "8px 12px",
                                    borderRadius: 8,
                                    border: isActive ? "1px solid var(--accent)" : "1px solid var(--border)",
                                    background: isActive ? "rgba(14,165,164,0.1)" : "var(--surface-2)",
                                    color: isActive ? "var(--accent)" : "var(--ink)",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    textAlign: "left",
                                    fontSize: 12,
                                }, children: [item.icon, " ", item.label] }, item.path));
                        }) })] }), outputSummary.length > 0 && (_jsxs("div", { style: { padding: "0 16px 12px" }, children: [_jsx("div", { style: { fontWeight: 700, fontSize: 11, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase" }, children: "Cached Results" }), _jsx("div", { style: { display: "grid", gap: 4 }, children: outputSummary.map((summary, idx) => (_jsxs("div", { style: {
                                fontSize: 11,
                                color: "var(--muted)",
                                padding: "4px 8px",
                                background: "var(--surface-2)",
                                borderRadius: 4,
                            }, children: ["\u2713 ", summary] }, idx))) })] })), _jsxs("div", { style: { padding: "0 16px 12px", marginTop: "auto" }, children: [_jsxs("button", { onClick: () => setShowSummary(!showSummary), style: {
                            width: "100%",
                            padding: "8px",
                            borderRadius: 8,
                            border: "1px solid var(--border)",
                            background: "var(--surface-2)",
                            color: "var(--ink)",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontSize: 12,
                        }, children: [showSummary ? "Hide" : "Show", " Clinical Summary"] }), showSummary && (_jsxs("div", { style: {
                            marginTop: 8,
                            padding: 12,
                            background: "var(--surface-2)",
                            borderRadius: 8,
                            fontSize: 11,
                            color: "var(--muted)",
                            maxHeight: 200,
                            overflowY: "auto",
                        }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 8, color: "var(--ink)" }, children: "Clinical Summary" }), context.active_condition && (_jsxs("div", { children: [_jsx("b", { children: "Condition:" }), " ", context.active_condition] })), context.symptoms && (_jsxs("div", { children: [_jsx("b", { children: "Symptoms:" }), " ", context.symptoms] })), context.duration && (_jsxs("div", { children: [_jsx("b", { children: "Duration:" }), " ", context.duration] })), context.age && (_jsxs("div", { children: [_jsx("b", { children: "Age:" }), " ", context.age, " ", context.sex && context.sex !== "unknown" ? `(${context.sex})` : ""] })), context.comorbidities.length > 0 && (_jsxs("div", { children: [_jsx("b", { children: "Comorbidities:" }), " ", context.comorbidities.join(", ")] })), context.current_meds.length > 0 && (_jsxs("div", { children: [_jsx("b", { children: "Current Meds:" }), " ", context.current_meds.join(", ")] })), context.allergies.length > 0 && (_jsxs("div", { children: [_jsx("b", { children: "Allergies:" }), " ", context.allergies.join(", ")] })), context.selected_ddx.length > 0 && (_jsxs("div", { children: [_jsx("b", { children: "Working Dx:" }), " ", context.selected_ddx.join(", ")] })), context.selected_drugs.length > 0 && (_jsxs("div", { children: [_jsx("b", { children: "Selected Drugs:" }), " ", context.selected_drugs.join(", ")] })), contextChips.length === 0 && outputSummary.length === 0 && (_jsx("div", { style: { fontStyle: "italic" }, children: "No data collected yet." }))] }))] }), _jsx("div", { style: { padding: "12px 16px", borderTop: "1px solid var(--border)" }, children: _jsx("button", { onClick: handleSave, disabled: isSaving, style: {
                        width: "100%",
                        padding: "8px",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: isSaving ? "var(--surface-2)" : "var(--surface)",
                        color: isSaving ? "var(--muted)" : "var(--ink)",
                        fontWeight: 600,
                        cursor: isSaving ? "not-allowed" : "pointer",
                        fontSize: 12,
                    }, children: isSaving ? "Saving..." : "💾 Save to Server" }) })] }));
}
