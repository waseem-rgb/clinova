import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Prescription Studio - Doctor-grade prescription writing module.
 *
 * Features:
 * - Voice dictation (FIXED: no repetition)
 * - Inline intelligent suggestions
 * - Structured medication table
 * - Safety checks with override capability
 * - Draft / Review / Locked modes
 * - PDF generation and download
 *
 * This is a medico-legally valid prescription system for India.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../services/api";
import SidebarNav from "../components/SidebarNav";
import SmartComposer from "../components/SmartComposer";
import useDictation from "../hooks/useDictation";
// ============================================================
// Empty/Default Values
// ============================================================
const emptyDoctor = {
    name: "",
    qualification: "",
    registration_no: "",
    clinic: "",
    phone: "",
};
const emptyPatient = {
    name: "",
    age: null,
    sex: "",
    id: "",
    phone: "",
};
const emptyVisit = {
    visit_datetime: new Date().toISOString(),
    complaints: [],
};
const emptyDiagnosis = {
    primary: "",
    provisional: [],
};
const emptyRxItem = {
    generic: "",
    frequency: "OD",
    strength: "",
    form: "",
    dose: "",
    timing: "",
    duration: "",
    route: "",
    instructions: "",
};
// ============================================================
// Component
// ============================================================
export default function PrescriptionStudio() {
    const nav = useNavigate();
    // Core state
    const [draftId, setDraftId] = useState(null);
    const [mode, setMode] = useState("edit");
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [successMsg, setSuccessMsg] = useState("");
    // Form state
    const [doctor, setDoctor] = useState(emptyDoctor);
    const [patient, setPatient] = useState(emptyPatient);
    const [visit, setVisit] = useState(emptyVisit);
    const [diagnosis, setDiagnosis] = useState(emptyDiagnosis);
    const [rxItems, setRxItems] = useState([{ ...emptyRxItem }]);
    const [investigations, setInvestigations] = useState([]);
    const [advice, setAdvice] = useState([]);
    const [followUp, setFollowUp] = useState("");
    const [transcript, setTranscript] = useState("");
    // Safety state
    const [safetyAlerts, setSafetyAlerts] = useState([]);
    const [safetyOverrides, setSafetyOverrides] = useState([]);
    const [showSafetyPanel, setShowSafetyPanel] = useState(false);
    const [overrideReason, setOverrideReason] = useState("");
    const [selectedAlertId, setSelectedAlertId] = useState(null);
    // Lock state
    const [lockHash, setLockHash] = useState(null);
    // Dictation hook
    const dictation = useDictation();
    // ============================================================
    // API Functions
    // ============================================================
    const createDraft = async () => {
        setLoading(true);
        setErrorMsg("");
        try {
            const res = await fetch(`${API_BASE}/prescription/draft`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    doctor,
                    patient,
                    visit,
                    diagnosis,
                    transcript: dictation.finalTranscript || transcript,
                }),
            });
            if (!res.ok)
                throw new Error(await res.text());
            const data = await res.json();
            setDraftId(data.id);
            setSuccessMsg("Draft created");
            return data;
        }
        catch (e) {
            const err = e;
            setErrorMsg(err?.message || "Failed to create draft");
        }
        finally {
            setLoading(false);
        }
    };
    const updateDraft = async () => {
        if (!draftId)
            return;
        setLoading(true);
        setErrorMsg("");
        try {
            const res = await fetch(`${API_BASE}/prescription/draft/${draftId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    doctor,
                    patient,
                    visit,
                    diagnosis,
                    rx_items: rxItems.filter((r) => r.generic.trim()),
                    investigations,
                    advice,
                    follow_up: followUp,
                    safety_overrides: safetyOverrides,
                    transcript: dictation.finalTranscript || transcript,
                }),
            });
            if (!res.ok)
                throw new Error(await res.text());
            setSuccessMsg("Draft saved");
        }
        catch (e) {
            const err = e;
            setErrorMsg(err?.message || "Failed to save draft");
        }
        finally {
            setLoading(false);
        }
    };
    const runSafetyCheck = async () => {
        if (rxItems.filter((r) => r.generic.trim()).length === 0)
            return;
        try {
            const res = await fetch(`${API_BASE}/prescription/safety/check`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    rx_items: rxItems.filter((r) => r.generic.trim()),
                    patient,
                    existing_alerts: safetyAlerts,
                }),
            });
            if (!res.ok)
                return;
            const data = await res.json();
            if (data.alerts && data.alerts.length > 0) {
                setSafetyAlerts(data.alerts);
                setShowSafetyPanel(true);
            }
        }
        catch (e) {
            console.error("Safety check error:", e);
        }
    };
    const parseTranscript = async () => {
        const text = dictation.finalTranscript || transcript;
        if (!text.trim())
            return;
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/prescription/parse`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
            });
            if (!res.ok)
                return;
            const data = await res.json();
            // Apply parsed data
            if (data.complaints?.length) {
                setVisit((v) => ({ ...v, complaints: data.complaints }));
            }
            if (data.diagnosis) {
                setDiagnosis((d) => ({
                    primary: data.diagnosis.primary || d.primary,
                    provisional: data.diagnosis.provisional || d.provisional,
                }));
            }
            if (data.medications?.length) {
                setRxItems(data.medications.map((m) => ({
                    ...emptyRxItem,
                    ...m,
                })));
            }
            if (data.investigations?.length) {
                setInvestigations(data.investigations);
            }
            if (data.advice?.length) {
                setAdvice(data.advice);
            }
            if (data.follow_up) {
                setFollowUp(data.follow_up);
            }
            setSuccessMsg("Transcript parsed");
        }
        catch (e) {
            console.error("Parse error:", e);
        }
        finally {
            setLoading(false);
        }
    };
    const lockPrescription = async () => {
        if (!draftId) {
            // Create draft first
            const created = await createDraft();
            if (!created?.id)
                return;
            setDraftId(created.id);
            // Then try to lock
            await lockPrescriptionById(created.id);
        }
        else {
            await updateDraft();
            await lockPrescriptionById(draftId);
        }
    };
    const lockPrescriptionById = async (id) => {
        setLoading(true);
        setErrorMsg("");
        try {
            const res = await fetch(`${API_BASE}/prescription/lock/${id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ confirm: true }),
            });
            const data = await res.json();
            if (!data.success) {
                setErrorMsg(data.errors?.join(", ") || "Lock failed");
                return;
            }
            setLockHash(data.hash);
            setMode("locked");
            setSuccessMsg("Prescription locked successfully");
        }
        catch (e) {
            const err = e;
            setErrorMsg(err?.message || "Failed to lock");
        }
        finally {
            setLoading(false);
        }
    };
    const downloadPDF = async () => {
        if (!draftId)
            return;
        window.open(`${API_BASE}/prescription/pdf/${draftId}/download`, "_blank");
    };
    const previewPDF = async () => {
        if (!draftId) {
            const created = await createDraft();
            if (created?.id) {
                window.open(`${API_BASE}/prescription/pdf/${created.id}/preview`, "_blank");
            }
        }
        else {
            await updateDraft();
            window.open(`${API_BASE}/prescription/pdf/${draftId}/preview`, "_blank");
        }
    };
    // ============================================================
    // Medication Table Functions
    // ============================================================
    const addMedication = () => {
        setRxItems([...rxItems, { ...emptyRxItem }]);
    };
    const removeMedication = (index) => {
        setRxItems(rxItems.filter((_, i) => i !== index));
    };
    const updateMedication = (index, field, value) => {
        const updated = [...rxItems];
        updated[index] = { ...updated[index], [field]: value };
        setRxItems(updated);
    };
    // ============================================================
    // Safety Override Functions
    // ============================================================
    const addOverride = (alertId) => {
        if (!overrideReason || overrideReason.length < 10) {
            setErrorMsg("Override reason must be at least 10 characters");
            return;
        }
        const override = {
            alert_id: alertId,
            reason: overrideReason,
            overridden_at: new Date().toISOString(),
        };
        setSafetyOverrides([...safetyOverrides, override]);
        setOverrideReason("");
        setSelectedAlertId(null);
        setSuccessMsg("Alert overridden");
    };
    const isAlertOverridden = (alertId) => {
        return safetyOverrides.some((o) => o.alert_id === alertId);
    };
    // ============================================================
    // Effects
    // ============================================================
    // Sync dictation transcript
    useEffect(() => {
        if (dictation.finalTranscript) {
            setTranscript(dictation.finalTranscript);
        }
    }, [dictation.finalTranscript]);
    // Run safety check when medications change
    useEffect(() => {
        const timer = setTimeout(() => {
            runSafetyCheck();
        }, 1000);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rxItems, patient.age, patient.sex]);
    // Clear messages after timeout
    useEffect(() => {
        if (successMsg) {
            const t = setTimeout(() => setSuccessMsg(""), 3000);
            return () => clearTimeout(t);
        }
    }, [successMsg]);
    // ============================================================
    // Render Helpers
    // ============================================================
    const isLocked = mode === "locked";
    const canEdit = mode === "edit";
    const cardStyle = {
        background: "var(--surface)",
        borderRadius: 18,
        border: "1px solid var(--border)",
        padding: 18,
        boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
        marginBottom: 16,
    };
    const labelStyle = {
        display: "block",
        fontSize: 12,
        fontWeight: 700,
        color: "var(--muted)",
        marginBottom: 4,
        textTransform: "uppercase",
        letterSpacing: 0.5,
    };
    const inputStyle = {
        width: "100%",
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: isLocked ? "var(--surface-2)" : "var(--surface)",
        color: "var(--ink)",
        fontSize: 14,
    };
    const buttonPrimary = {
        padding: "10px 18px",
        borderRadius: 10,
        border: "none",
        background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
        color: "#fff",
        fontWeight: 700,
        cursor: "pointer",
        boxShadow: "0 4px 12px rgba(14,165,164,0.3)",
    };
    const buttonSecondary = {
        padding: "10px 18px",
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        color: "var(--ink)",
        fontWeight: 700,
        cursor: "pointer",
    };
    // ============================================================
    // Render
    // ============================================================
    return (_jsxs("div", { style: {
            minHeight: "100vh",
            background: "var(--page-bg)",
            padding: "24px 24px 24px 0",
        }, children: [_jsxs("div", { style: {
                    maxWidth: "100%",
                    minWidth: 1200,
                    margin: 0,
                    display: "grid",
                    gridTemplateColumns: "260px 1fr",
                    gap: 24,
                }, children: [_jsx(SidebarNav, {}), _jsxs("div", { children: [_jsxs("div", { style: {
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginBottom: 16,
                                }, children: [_jsxs("div", { children: [_jsx("button", { onClick: () => nav("/"), style: {
                                                    ...buttonSecondary,
                                                    padding: "8px 12px",
                                                    marginBottom: 8,
                                                }, children: "\u2190 Back" }), _jsx("h1", { style: {
                                                    fontSize: 32,
                                                    fontWeight: 700,
                                                    color: "var(--ink)",
                                                    letterSpacing: -0.5,
                                                    fontFamily: "var(--font-display)",
                                                    margin: 0,
                                                }, children: "Prescription Studio" })] }), _jsx("div", { style: { display: "flex", gap: 10, alignItems: "center" }, children: _jsx("span", { style: {
                                                padding: "6px 12px",
                                                borderRadius: 20,
                                                fontSize: 12,
                                                fontWeight: 700,
                                                textTransform: "uppercase",
                                                background: mode === "locked"
                                                    ? "rgba(34,197,94,0.15)"
                                                    : mode === "review"
                                                        ? "rgba(245,158,11,0.15)"
                                                        : "rgba(59,130,246,0.15)",
                                                color: mode === "locked"
                                                    ? "#22c55e"
                                                    : mode === "review"
                                                        ? "#f59e0b"
                                                        : "#3b82f6",
                                            }, children: mode === "locked" ? "Locked" : mode === "review" ? "Review" : "Draft" }) })] }), errorMsg && (_jsx("div", { style: {
                                    ...cardStyle,
                                    background: "rgba(239,68,68,0.1)",
                                    border: "1px solid rgba(239,68,68,0.3)",
                                    color: "#dc2626",
                                    marginBottom: 16,
                                }, children: errorMsg })), successMsg && (_jsxs("div", { style: {
                                    ...cardStyle,
                                    background: "rgba(34,197,94,0.1)",
                                    border: "1px solid rgba(34,197,94,0.3)",
                                    color: "#16a34a",
                                    marginBottom: 16,
                                }, children: ["\u2713 ", successMsg] })), _jsxs("div", { style: cardStyle, children: [_jsxs("div", { style: {
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            marginBottom: 12,
                                        }, children: [_jsx("h2", { style: {
                                                    margin: 0,
                                                    fontSize: 16,
                                                    fontWeight: 700,
                                                    color: "var(--ink)",
                                                }, children: "Voice Dictation" }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsxs("button", { onClick: () => dictation.listening ? dictation.stop() : dictation.start(), disabled: !dictation.supported || isLocked, style: {
                                                            ...buttonPrimary,
                                                            background: dictation.listening
                                                                ? "#ef4444"
                                                                : "linear-gradient(135deg, var(--accent), var(--accent-2))",
                                                            boxShadow: dictation.listening
                                                                ? "0 4px 12px rgba(239,68,68,0.3)"
                                                                : "0 4px 12px rgba(14,165,164,0.3)",
                                                        }, children: [dictation.listening ? "⏹ Stop" : "▶ Start", " Dictation"] }), _jsx("button", { onClick: parseTranscript, disabled: !transcript.trim() || loading || isLocked, style: buttonSecondary, children: "Parse Transcript" })] })] }), dictation.listening && (_jsxs("div", { style: {
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                            marginBottom: 8,
                                            color: "#ef4444",
                                            fontSize: 13,
                                            fontWeight: 600,
                                        }, children: [_jsx("span", { style: {
                                                    width: 8,
                                                    height: 8,
                                                    borderRadius: "50%",
                                                    background: "#ef4444",
                                                    animation: "pulse 1s infinite",
                                                } }), "Listening..."] })), _jsx("textarea", { value: transcript, onChange: (e) => {
                                            setTranscript(e.target.value);
                                            dictation.setFinalTranscript(e.target.value);
                                        }, placeholder: "Speak or type your prescription notes here...", disabled: isLocked, style: {
                                            ...inputStyle,
                                            minHeight: 100,
                                            resize: "vertical",
                                            fontFamily: "inherit",
                                        } }), dictation.interimTranscript && (_jsx("div", { style: {
                                            marginTop: 8,
                                            padding: 8,
                                            background: "rgba(14,165,164,0.1)",
                                            borderRadius: 8,
                                            fontSize: 13,
                                            color: "var(--muted)",
                                            fontStyle: "italic",
                                        }, children: dictation.interimTranscript }))] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }, children: [_jsxs("div", { style: cardStyle, children: [_jsx("h2", { style: {
                                                    margin: "0 0 12px 0",
                                                    fontSize: 16,
                                                    fontWeight: 700,
                                                    color: "var(--ink)",
                                                }, children: "Doctor Information" }), _jsxs("div", { style: { display: "grid", gap: 10 }, children: [_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: "Name *" }), _jsx("input", { type: "text", value: doctor.name, onChange: (e) => setDoctor({ ...doctor, name: e.target.value }), placeholder: "Dr. Name", disabled: isLocked, style: inputStyle })] }), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: "Registration No *" }), _jsx("input", { type: "text", value: doctor.registration_no, onChange: (e) => setDoctor({ ...doctor, registration_no: e.target.value }), placeholder: "Medical Council Reg. No.", disabled: isLocked, style: inputStyle })] }), _jsxs("div", { style: {
                                                            display: "grid",
                                                            gridTemplateColumns: "1fr 1fr",
                                                            gap: 10,
                                                        }, children: [_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: "Qualification" }), _jsx("input", { type: "text", value: doctor.qualification, onChange: (e) => setDoctor({ ...doctor, qualification: e.target.value }), placeholder: "MBBS, MD", disabled: isLocked, style: inputStyle })] }), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: "Phone" }), _jsx("input", { type: "text", value: doctor.phone, onChange: (e) => setDoctor({ ...doctor, phone: e.target.value }), placeholder: "Contact", disabled: isLocked, style: inputStyle })] })] }), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: "Clinic/Hospital" }), _jsx("input", { type: "text", value: doctor.clinic, onChange: (e) => setDoctor({ ...doctor, clinic: e.target.value }), placeholder: "Clinic name & address", disabled: isLocked, style: inputStyle })] })] })] }), _jsxs("div", { style: cardStyle, children: [_jsx("h2", { style: {
                                                    margin: "0 0 12px 0",
                                                    fontSize: 16,
                                                    fontWeight: 700,
                                                    color: "var(--ink)",
                                                }, children: "\uD83E\uDDD1 Patient Information" }), _jsxs("div", { style: { display: "grid", gap: 10 }, children: [_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: "Name *" }), _jsx("input", { type: "text", value: patient.name, onChange: (e) => setPatient({ ...patient, name: e.target.value }), placeholder: "Patient name", disabled: isLocked, style: inputStyle })] }), _jsxs("div", { style: {
                                                            display: "grid",
                                                            gridTemplateColumns: "1fr 1fr 1fr",
                                                            gap: 10,
                                                        }, children: [_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: "Age *" }), _jsx("input", { type: "number", value: patient.age ?? "", onChange: (e) => setPatient({
                                                                            ...patient,
                                                                            age: e.target.value ? parseInt(e.target.value) : null,
                                                                        }), placeholder: "Age", disabled: isLocked, style: inputStyle })] }), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: "Sex *" }), _jsxs("select", { value: patient.sex, onChange: (e) => setPatient({ ...patient, sex: e.target.value }), disabled: isLocked, style: inputStyle, children: [_jsx("option", { value: "", children: "Select" }), _jsx("option", { value: "M", children: "Male" }), _jsx("option", { value: "F", children: "Female" }), _jsx("option", { value: "Other", children: "Other" })] })] }), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: "ID/UHID" }), _jsx("input", { type: "text", value: patient.id || "", onChange: (e) => setPatient({ ...patient, id: e.target.value }), placeholder: "Patient ID", disabled: isLocked, style: inputStyle })] })] }), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: "Complaints" }), _jsx(SmartComposer, { value: visit.complaints.join(", "), onChange: (v) => setVisit({
                                                                    ...visit,
                                                                    complaints: v
                                                                        .split(",")
                                                                        .map((c) => c.trim())
                                                                        .filter(Boolean),
                                                                }), placeholder: "Chief complaints (comma separated)", disabled: isLocked, delimiter: "," })] })] })] })] }), _jsxs("div", { style: cardStyle, children: [_jsx("h2", { style: {
                                            margin: "0 0 12px 0",
                                            fontSize: 16,
                                            fontWeight: 700,
                                            color: "var(--ink)",
                                        }, children: "Diagnosis" }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }, children: [_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: "Primary Diagnosis" }), _jsx(SmartComposer, { value: diagnosis.primary, onChange: (v) => setDiagnosis({ ...diagnosis, primary: v }), placeholder: "Primary diagnosis", fieldType: "diagnosis", disabled: isLocked })] }), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: "Provisional / Differentials" }), _jsx(SmartComposer, { value: diagnosis.provisional.join(", "), onChange: (v) => setDiagnosis({
                                                            ...diagnosis,
                                                            provisional: v
                                                                .split(",")
                                                                .map((d) => d.trim())
                                                                .filter(Boolean),
                                                        }), placeholder: "Other diagnoses (comma separated)", fieldType: "diagnosis", delimiter: ",", disabled: isLocked })] })] })] }), _jsxs("div", { style: cardStyle, children: [_jsxs("div", { style: {
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            marginBottom: 12,
                                        }, children: [_jsx("h2", { style: {
                                                    margin: 0,
                                                    fontSize: 16,
                                                    fontWeight: 700,
                                                    color: "var(--ink)",
                                                }, children: "Medications (Rx)" }), canEdit && (_jsx("button", { onClick: addMedication, style: buttonSecondary, children: "+ Add Medication" }))] }), _jsx("div", { style: { overflowX: "auto" }, children: _jsxs("table", { style: {
                                                width: "100%",
                                                borderCollapse: "collapse",
                                                fontSize: 13,
                                            }, children: [_jsx("thead", { children: _jsxs("tr", { style: {
                                                            background: "var(--surface-2)",
                                                            textAlign: "left",
                                                        }, children: [_jsx("th", { style: { padding: 10, fontWeight: 700 }, children: "#" }), _jsx("th", { style: { padding: 10, fontWeight: 700, minWidth: 180 }, children: "Drug Name" }), _jsx("th", { style: { padding: 10, fontWeight: 700 }, children: "Strength" }), _jsx("th", { style: { padding: 10, fontWeight: 700 }, children: "Form" }), _jsx("th", { style: { padding: 10, fontWeight: 700 }, children: "Frequency" }), _jsx("th", { style: { padding: 10, fontWeight: 700 }, children: "Duration" }), _jsx("th", { style: { padding: 10, fontWeight: 700 }, children: "Timing" }), _jsx("th", { style: { padding: 10, fontWeight: 700 }, children: "Instructions" }), canEdit && (_jsx("th", { style: { padding: 10, fontWeight: 700 } }))] }) }), _jsx("tbody", { children: rxItems.map((item, idx) => (_jsxs("tr", { style: { borderBottom: "1px solid var(--border)" }, children: [_jsx("td", { style: { padding: 8 }, children: idx + 1 }), _jsx("td", { style: { padding: 8 }, children: _jsx(SmartComposer, { value: item.generic, onChange: (v) => updateMedication(idx, "generic", v), placeholder: "Drug name", fieldType: "drug", disabled: isLocked }) }), _jsx("td", { style: { padding: 8 }, children: _jsx("input", { type: "text", value: item.strength || "", onChange: (e) => updateMedication(idx, "strength", e.target.value), placeholder: "500mg", disabled: isLocked, style: { ...inputStyle, width: 80 } }) }), _jsx("td", { style: { padding: 8 }, children: _jsx(SmartComposer, { value: item.form || "", onChange: (v) => updateMedication(idx, "form", v), placeholder: "Tab", fieldType: "form", disabled: isLocked, style: { width: 70 } }) }), _jsx("td", { style: { padding: 8 }, children: _jsx(SmartComposer, { value: item.frequency, onChange: (v) => updateMedication(idx, "frequency", v), placeholder: "OD", fieldType: "frequency", disabled: isLocked, style: { width: 80 } }) }), _jsx("td", { style: { padding: 8 }, children: _jsx(SmartComposer, { value: item.duration || "", onChange: (v) => updateMedication(idx, "duration", v), placeholder: "5 days", fieldType: "duration", disabled: isLocked, style: { width: 80 } }) }), _jsx("td", { style: { padding: 8 }, children: _jsx(SmartComposer, { value: item.timing || "", onChange: (v) => updateMedication(idx, "timing", v), placeholder: "After food", fieldType: "timing", disabled: isLocked, style: { width: 90 } }) }), _jsx("td", { style: { padding: 8 }, children: _jsx("input", { type: "text", value: item.instructions || "", onChange: (e) => updateMedication(idx, "instructions", e.target.value), placeholder: "Notes", disabled: isLocked, style: { ...inputStyle, width: 100 } }) }), canEdit && (_jsx("td", { style: { padding: 8 }, children: _jsx("button", { onClick: () => removeMedication(idx), style: {
                                                                        background: "rgba(239,68,68,0.1)",
                                                                        border: "none",
                                                                        borderRadius: 6,
                                                                        padding: "6px 10px",
                                                                        cursor: "pointer",
                                                                        color: "#dc2626",
                                                                        fontWeight: 700,
                                                                    }, children: "\u2715" }) }))] }, idx))) })] }) })] }), safetyAlerts.length > 0 && (_jsxs("div", { style: {
                                    ...cardStyle,
                                    background: "rgba(245,158,11,0.1)",
                                    border: "1px solid rgba(245,158,11,0.3)",
                                }, children: [_jsxs("div", { style: {
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            marginBottom: 8,
                                        }, children: [_jsxs("h2", { style: {
                                                    margin: 0,
                                                    fontSize: 16,
                                                    fontWeight: 700,
                                                    color: "#b45309",
                                                }, children: ["Safety Alerts (", safetyAlerts.length, ")"] }), _jsxs("button", { onClick: () => setShowSafetyPanel(!showSafetyPanel), style: buttonSecondary, children: [showSafetyPanel ? "Hide" : "Show", " Details"] })] }), showSafetyPanel && (_jsx("div", { style: { marginTop: 12 }, children: safetyAlerts.map((alert) => {
                                            const overridden = isAlertOverridden(alert.id);
                                            return (_jsxs("div", { style: {
                                                    padding: 12,
                                                    marginBottom: 8,
                                                    borderRadius: 10,
                                                    background: overridden
                                                        ? "rgba(34,197,94,0.1)"
                                                        : alert.severity === "high"
                                                            ? "rgba(239,68,68,0.1)"
                                                            : "rgba(245,158,11,0.1)",
                                                    border: `1px solid ${overridden
                                                        ? "rgba(34,197,94,0.3)"
                                                        : alert.severity === "high"
                                                            ? "rgba(239,68,68,0.3)"
                                                            : "rgba(245,158,11,0.3)"}`,
                                                }, children: [_jsxs("div", { style: {
                                                            display: "flex",
                                                            justifyContent: "space-between",
                                                            alignItems: "flex-start",
                                                        }, children: [_jsxs("div", { children: [_jsxs("span", { style: {
                                                                            fontWeight: 700,
                                                                            color: overridden
                                                                                ? "#16a34a"
                                                                                : alert.severity === "high"
                                                                                    ? "#dc2626"
                                                                                    : "#b45309",
                                                                        }, children: [alert.severity === "high" ? "🔴" : "🟡", " ", alert.type.toUpperCase(), overridden && " (Overridden)"] }), _jsx("p", { style: {
                                                                            margin: "6px 0 0 0",
                                                                            color: "var(--ink)",
                                                                            fontSize: 14,
                                                                        }, children: alert.message }), alert.related_drugs.length > 0 && (_jsxs("p", { style: {
                                                                            margin: "4px 0 0 0",
                                                                            color: "var(--muted)",
                                                                            fontSize: 12,
                                                                        }, children: ["Related: ", alert.related_drugs.join(", ")] }))] }), canEdit && !overridden && (_jsx("button", { onClick: () => setSelectedAlertId(alert.id), style: {
                                                                    ...buttonSecondary,
                                                                    padding: "6px 12px",
                                                                    fontSize: 12,
                                                                }, children: "Override" }))] }), selectedAlertId === alert.id && (_jsxs("div", { style: { marginTop: 10 }, children: [_jsx("input", { type: "text", value: overrideReason, onChange: (e) => setOverrideReason(e.target.value), placeholder: "Reason for override (min 10 chars)", style: {
                                                                    ...inputStyle,
                                                                    marginBottom: 8,
                                                                } }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx("button", { onClick: () => addOverride(alert.id), style: {
                                                                            ...buttonPrimary,
                                                                            padding: "6px 12px",
                                                                            fontSize: 12,
                                                                        }, children: "Confirm Override" }), _jsx("button", { onClick: () => setSelectedAlertId(null), style: {
                                                                            ...buttonSecondary,
                                                                            padding: "6px 12px",
                                                                            fontSize: 12,
                                                                        }, children: "Cancel" })] })] }))] }, alert.id));
                                        }) }))] })), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }, children: [_jsxs("div", { style: cardStyle, children: [_jsx("h2", { style: {
                                                    margin: "0 0 8px 0",
                                                    fontSize: 14,
                                                    fontWeight: 700,
                                                    color: "var(--ink)",
                                                }, children: "\uD83D\uDD2C Investigations" }), _jsx("textarea", { value: investigations.join("\n"), onChange: (e) => setInvestigations(e.target.value
                                                    .split("\n")
                                                    .map((i) => i.trim())
                                                    .filter(Boolean)), placeholder: "One per line", disabled: isLocked, style: { ...inputStyle, minHeight: 80, resize: "vertical" } })] }), _jsxs("div", { style: cardStyle, children: [_jsx("h2", { style: {
                                                    margin: "0 0 8px 0",
                                                    fontSize: 14,
                                                    fontWeight: 700,
                                                    color: "var(--ink)",
                                                }, children: "Advice" }), _jsx("textarea", { value: advice.join("\n"), onChange: (e) => setAdvice(e.target.value
                                                    .split("\n")
                                                    .map((a) => a.trim())
                                                    .filter(Boolean)), placeholder: "One per line", disabled: isLocked, style: { ...inputStyle, minHeight: 80, resize: "vertical" } })] }), _jsxs("div", { style: cardStyle, children: [_jsx("h2", { style: {
                                                    margin: "0 0 8px 0",
                                                    fontSize: 14,
                                                    fontWeight: 700,
                                                    color: "var(--ink)",
                                                }, children: "\uD83D\uDCC5 Follow-up" }), _jsx("input", { type: "text", value: followUp, onChange: (e) => setFollowUp(e.target.value), placeholder: "e.g., After 1 week", disabled: isLocked, style: inputStyle })] })] }), _jsxs("div", { style: {
                                    ...cardStyle,
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                }, children: [_jsx("div", { style: { display: "flex", gap: 10 }, children: canEdit && (_jsxs(_Fragment, { children: [_jsx("button", { onClick: draftId ? updateDraft : createDraft, disabled: loading, style: buttonSecondary, children: loading ? "Saving..." : draftId ? "Save Draft" : "Create Draft" }), _jsx("button", { onClick: previewPDF, disabled: loading, style: buttonSecondary, children: "Preview PDF" })] })) }), _jsxs("div", { style: { display: "flex", gap: 10 }, children: [canEdit && (_jsxs(_Fragment, { children: [_jsx("button", { onClick: () => setMode("review"), style: buttonSecondary, children: "Review Mode" }), _jsx("button", { onClick: lockPrescription, disabled: loading, style: {
                                                            ...buttonPrimary,
                                                            background: "linear-gradient(135deg, #22c55e, #16a34a)",
                                                        }, children: "\uD83D\uDD12 Lock & Finalize" })] })), mode === "review" && (_jsxs(_Fragment, { children: [_jsx("button", { onClick: () => setMode("edit"), style: buttonSecondary, children: "Back to Edit" }), _jsx("button", { onClick: lockPrescription, disabled: loading, style: {
                                                            ...buttonPrimary,
                                                            background: "linear-gradient(135deg, #22c55e, #16a34a)",
                                                        }, children: "\uD83D\uDD12 Lock & Finalize" })] })), isLocked && (_jsx("button", { onClick: downloadPDF, style: buttonPrimary, children: "\uD83D\uDCE5 Download PDF" }))] })] }), isLocked && lockHash && (_jsxs("div", { style: {
                                    ...cardStyle,
                                    background: "rgba(34,197,94,0.1)",
                                    border: "1px solid rgba(34,197,94,0.3)",
                                }, children: [_jsx("h3", { style: {
                                            margin: "0 0 8px 0",
                                            fontSize: 14,
                                            fontWeight: 700,
                                            color: "#16a34a",
                                        }, children: "\uD83D\uDD10 Prescription Locked" }), _jsxs("p", { style: {
                                            margin: 0,
                                            fontSize: 12,
                                            color: "var(--muted)",
                                            wordBreak: "break-all",
                                        }, children: [_jsx("strong", { children: "Verification Hash:" }), " ", lockHash] }), _jsx("p", { style: {
                                            margin: "8px 0 0 0",
                                            fontSize: 11,
                                            color: "var(--muted)",
                                        }, children: "This prescription is now immutable. The hash above can be used to verify the prescription's integrity." })] }))] })] }), _jsx("style", { children: `
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      ` })] }));
}
