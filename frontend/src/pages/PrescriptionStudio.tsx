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

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../services/api";
import SidebarNav from "../components/SidebarNav";
import SmartComposer from "../components/SmartComposer";
import useDictation from "../hooks/useDictation";

// ============================================================
// Types
// ============================================================

interface Doctor {
  name: string;
  qualification: string;
  registration_no: string;
  clinic: string;
  phone: string;
}

interface Patient {
  name: string;
  age: number | null;
  sex: string;
  id?: string;
  phone?: string;
}

interface Visit {
  visit_datetime: string;
  complaints: string[];
}

interface Diagnosis {
  primary: string;
  provisional: string[];
}

interface RxItem {
  generic: string;
  brand?: string;
  strength?: string;
  form?: string;
  dose?: string;
  frequency: string;
  timing?: string;
  duration?: string;
  route?: string;
  instructions?: string;
}

interface SafetyAlert {
  id: string;
  type: string;
  severity: string;
  message: string;
  related_drugs: string[];
  rule_id?: string;
}

interface SafetyOverride {
  alert_id: string;
  reason: string;
  overridden_at: string;
}

interface PrescriptionDraft {
  id: string;
  status: "draft" | "locked";
  created_at: string;
  updated_at: string;
  doctor: Doctor;
  patient: Patient;
  visit: Visit;
  diagnosis: Diagnosis;
  rx_items: RxItem[];
  investigations: string[];
  advice: string[];
  follow_up?: string;
  safety_alerts: SafetyAlert[];
  safety_overrides: SafetyOverride[];
  lock?: {
    locked_at: string;
    hash: string;
    pdf_path?: string;
  };
  transcript?: string;
}

type Mode = "edit" | "review" | "locked";

// ============================================================
// Empty/Default Values
// ============================================================

const emptyDoctor: Doctor = {
  name: "",
  qualification: "",
  registration_no: "",
  clinic: "",
  phone: "",
};

const emptyPatient: Patient = {
  name: "",
  age: null,
  sex: "",
  id: "",
  phone: "",
};

const emptyVisit: Visit = {
  visit_datetime: new Date().toISOString(),
  complaints: [],
};

const emptyDiagnosis: Diagnosis = {
  primary: "",
  provisional: [],
};

const emptyRxItem: RxItem = {
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
  const [draftId, setDraftId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("edit");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Form state
  const [doctor, setDoctor] = useState<Doctor>(emptyDoctor);
  const [patient, setPatient] = useState<Patient>(emptyPatient);
  const [visit, setVisit] = useState<Visit>(emptyVisit);
  const [diagnosis, setDiagnosis] = useState<Diagnosis>(emptyDiagnosis);
  const [rxItems, setRxItems] = useState<RxItem[]>([{ ...emptyRxItem }]);
  const [investigations, setInvestigations] = useState<string[]>([]);
  const [advice, setAdvice] = useState<string[]>([]);
  const [followUp, setFollowUp] = useState("");
  const [transcript, setTranscript] = useState("");

  // Safety state
  const [safetyAlerts, setSafetyAlerts] = useState<SafetyAlert[]>([]);
  const [safetyOverrides, setSafetyOverrides] = useState<SafetyOverride[]>([]);
  const [showSafetyPanel, setShowSafetyPanel] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  // Lock state
  const [lockHash, setLockHash] = useState<string | null>(null);

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
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setDraftId(data.id);
      setSuccessMsg("Draft created");
      return data;
    } catch (e: unknown) {
      const err = e as Error;
      setErrorMsg(err?.message || "Failed to create draft");
    } finally {
      setLoading(false);
    }
  };

  const updateDraft = async () => {
    if (!draftId) return;
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
      if (!res.ok) throw new Error(await res.text());
      setSuccessMsg("Draft saved");
    } catch (e: unknown) {
      const err = e as Error;
      setErrorMsg(err?.message || "Failed to save draft");
    } finally {
      setLoading(false);
    }
  };

  const runSafetyCheck = async () => {
    if (rxItems.filter((r) => r.generic.trim()).length === 0) return;
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
      if (!res.ok) return;
      const data = await res.json();
      if (data.alerts && data.alerts.length > 0) {
        setSafetyAlerts(data.alerts);
        setShowSafetyPanel(true);
      }
    } catch (e) {
      console.error("Safety check error:", e);
    }
  };

  const parseTranscript = async () => {
    const text = dictation.finalTranscript || transcript;
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/prescription/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
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
        setRxItems(
          data.medications.map((m: Partial<RxItem>) => ({
            ...emptyRxItem,
            ...m,
          }))
        );
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
    } catch (e) {
      console.error("Parse error:", e);
    } finally {
      setLoading(false);
    }
  };

  const lockPrescription = async () => {
    if (!draftId) {
      // Create draft first
      const created = await createDraft();
      if (!created?.id) return;
      setDraftId(created.id);
      // Then try to lock
      await lockPrescriptionById(created.id);
    } else {
      await updateDraft();
      await lockPrescriptionById(draftId);
    }
  };

  const lockPrescriptionById = async (id: string) => {
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
    } catch (e: unknown) {
      const err = e as Error;
      setErrorMsg(err?.message || "Failed to lock");
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async () => {
    if (!draftId) return;
    window.open(`${API_BASE}/prescription/pdf/${draftId}/download`, "_blank");
  };

  const previewPDF = async () => {
    if (!draftId) {
      const created = await createDraft();
      if (created?.id) {
        window.open(
          `${API_BASE}/prescription/pdf/${created.id}/preview`,
          "_blank"
        );
      }
    } else {
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

  const removeMedication = (index: number) => {
    setRxItems(rxItems.filter((_, i) => i !== index));
  };

  const updateMedication = (
    index: number,
    field: keyof RxItem,
    value: string
  ) => {
    const updated = [...rxItems];
    updated[index] = { ...updated[index], [field]: value };
    setRxItems(updated);
  };

  // ============================================================
  // Safety Override Functions
  // ============================================================

  const addOverride = (alertId: string) => {
    if (!overrideReason || overrideReason.length < 10) {
      setErrorMsg("Override reason must be at least 10 characters");
      return;
    }
    const override: SafetyOverride = {
      alert_id: alertId,
      reason: overrideReason,
      overridden_at: new Date().toISOString(),
    };
    setSafetyOverrides([...safetyOverrides, override]);
    setOverrideReason("");
    setSelectedAlertId(null);
    setSuccessMsg("Alert overridden");
  };

  const isAlertOverridden = (alertId: string) => {
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

  const cardStyle: React.CSSProperties = {
    background: "var(--surface)",
    borderRadius: 18,
    border: "1px solid var(--border)",
    padding: 18,
    boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
    marginBottom: 16,
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 700,
    color: "var(--muted)",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: isLocked ? "var(--surface-2)" : "var(--surface)",
    color: "var(--ink)",
    fontSize: 14,
  };

  const buttonPrimary: React.CSSProperties = {
    padding: "10px 18px",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(14,165,164,0.3)",
  };

  const buttonSecondary: React.CSSProperties = {
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

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--page-bg)",
        padding: "24px 24px 24px 0",
      }}
    >
      <div
        style={{
          maxWidth: "100%",
          minWidth: 1200,
          margin: 0,
          display: "grid",
          gridTemplateColumns: "260px 1fr",
          gap: 24,
        }}
      >
        <SidebarNav />

        <div>
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <div>
              <button
                onClick={() => nav("/")}
                style={{
                  ...buttonSecondary,
                  padding: "8px 12px",
                  marginBottom: 8,
                }}
              >
                ← Back
              </button>
              <h1
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  color: "var(--ink)",
                  letterSpacing: -0.5,
                  fontFamily: "var(--font-display)",
                  margin: 0,
                }}
              >
                Prescription Studio
              </h1>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {/* Status Badge */}
              <span
                style={{
                  padding: "6px 12px",
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  background:
                    mode === "locked"
                      ? "rgba(34,197,94,0.15)"
                      : mode === "review"
                      ? "rgba(245,158,11,0.15)"
                      : "rgba(59,130,246,0.15)",
                  color:
                    mode === "locked"
                      ? "#22c55e"
                      : mode === "review"
                      ? "#f59e0b"
                      : "#3b82f6",
                }}
              >
                {mode === "locked" ? "Locked" : mode === "review" ? "Review" : "Draft"}
              </span>
            </div>
          </div>

          {/* Messages */}
          {errorMsg && (
            <div
              style={{
                ...cardStyle,
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.3)",
                color: "#dc2626",
                marginBottom: 16,
              }}
            >
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div
              style={{
                ...cardStyle,
                background: "rgba(34,197,94,0.1)",
                border: "1px solid rgba(34,197,94,0.3)",
                color: "#16a34a",
                marginBottom: 16,
              }}
            >
              ✓ {successMsg}
            </div>
          )}

          {/* Voice Dictation Section */}
          <div style={cardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--ink)",
                }}
              >
                Voice Dictation
              </h2>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() =>
                    dictation.listening ? dictation.stop() : dictation.start()
                  }
                  disabled={!dictation.supported || isLocked}
                  style={{
                    ...buttonPrimary,
                    background: dictation.listening
                      ? "#ef4444"
                      : "linear-gradient(135deg, var(--accent), var(--accent-2))",
                    boxShadow: dictation.listening
                      ? "0 4px 12px rgba(239,68,68,0.3)"
                      : "0 4px 12px rgba(14,165,164,0.3)",
                  }}
                >
                  {dictation.listening ? "⏹ Stop" : "▶ Start"} Dictation
                </button>
                <button
                  onClick={parseTranscript}
                  disabled={!transcript.trim() || loading || isLocked}
                  style={buttonSecondary}
                >
                  Parse Transcript
                </button>
              </div>
            </div>
            {dictation.listening && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                  color: "#ef4444",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#ef4444",
                    animation: "pulse 1s infinite",
                  }}
                />
                Listening...
              </div>
            )}
            <textarea
              value={transcript}
              onChange={(e) => {
                setTranscript(e.target.value);
                dictation.setFinalTranscript(e.target.value);
              }}
              placeholder="Speak or type your prescription notes here..."
              disabled={isLocked}
              style={{
                ...inputStyle,
                minHeight: 100,
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
            {dictation.interimTranscript && (
              <div
                style={{
                  marginTop: 8,
                  padding: 8,
                  background: "rgba(14,165,164,0.1)",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "var(--muted)",
                  fontStyle: "italic",
                }}
              >
                {dictation.interimTranscript}
              </div>
            )}
          </div>

          {/* Doctor & Patient Info */}
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
          >
            {/* Doctor Info */}
            <div style={cardStyle}>
              <h2
                style={{
                  margin: "0 0 12px 0",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--ink)",
                }}
              >
                Doctor Information
              </h2>
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Name *</label>
                  <input
                    type="text"
                    value={doctor.name}
                    onChange={(e) =>
                      setDoctor({ ...doctor, name: e.target.value })
                    }
                    placeholder="Dr. Name"
                    disabled={isLocked}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Registration No *</label>
                  <input
                    type="text"
                    value={doctor.registration_no}
                    onChange={(e) =>
                      setDoctor({ ...doctor, registration_no: e.target.value })
                    }
                    placeholder="Medical Council Reg. No."
                    disabled={isLocked}
                    style={inputStyle}
                  />
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  <div>
                    <label style={labelStyle}>Qualification</label>
                    <input
                      type="text"
                      value={doctor.qualification}
                      onChange={(e) =>
                        setDoctor({ ...doctor, qualification: e.target.value })
                      }
                      placeholder="MBBS, MD"
                      disabled={isLocked}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Phone</label>
                    <input
                      type="text"
                      value={doctor.phone}
                      onChange={(e) =>
                        setDoctor({ ...doctor, phone: e.target.value })
                      }
                      placeholder="Contact"
                      disabled={isLocked}
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Clinic/Hospital</label>
                  <input
                    type="text"
                    value={doctor.clinic}
                    onChange={(e) =>
                      setDoctor({ ...doctor, clinic: e.target.value })
                    }
                    placeholder="Clinic name & address"
                    disabled={isLocked}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* Patient Info */}
            <div style={cardStyle}>
              <h2
                style={{
                  margin: "0 0 12px 0",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--ink)",
                }}
              >
                🧑 Patient Information
              </h2>
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Name *</label>
                  <input
                    type="text"
                    value={patient.name}
                    onChange={(e) =>
                      setPatient({ ...patient, name: e.target.value })
                    }
                    placeholder="Patient name"
                    disabled={isLocked}
                    style={inputStyle}
                  />
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 10,
                  }}
                >
                  <div>
                    <label style={labelStyle}>Age *</label>
                    <input
                      type="number"
                      value={patient.age ?? ""}
                      onChange={(e) =>
                        setPatient({
                          ...patient,
                          age: e.target.value ? parseInt(e.target.value) : null,
                        })
                      }
                      placeholder="Age"
                      disabled={isLocked}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Sex *</label>
                    <select
                      value={patient.sex}
                      onChange={(e) =>
                        setPatient({ ...patient, sex: e.target.value })
                      }
                      disabled={isLocked}
                      style={inputStyle}
                    >
                      <option value="">Select</option>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>ID/UHID</label>
                    <input
                      type="text"
                      value={patient.id || ""}
                      onChange={(e) =>
                        setPatient({ ...patient, id: e.target.value })
                      }
                      placeholder="Patient ID"
                      disabled={isLocked}
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Complaints</label>
                  <SmartComposer
                    value={visit.complaints.join(", ")}
                    onChange={(v) =>
                      setVisit({
                        ...visit,
                        complaints: v
                          .split(",")
                          .map((c) => c.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="Chief complaints (comma separated)"
                    disabled={isLocked}
                    delimiter=","
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Diagnosis */}
          <div style={cardStyle}>
            <h2
              style={{
                margin: "0 0 12px 0",
                fontSize: 16,
                fontWeight: 700,
                color: "var(--ink)",
              }}
            >
              Diagnosis
            </h2>
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
            >
              <div>
                <label style={labelStyle}>Primary Diagnosis</label>
                <SmartComposer
                  value={diagnosis.primary}
                  onChange={(v) => setDiagnosis({ ...diagnosis, primary: v })}
                  placeholder="Primary diagnosis"
                  fieldType="diagnosis"
                  disabled={isLocked}
                />
              </div>
              <div>
                <label style={labelStyle}>Provisional / Differentials</label>
                <SmartComposer
                  value={diagnosis.provisional.join(", ")}
                  onChange={(v) =>
                    setDiagnosis({
                      ...diagnosis,
                      provisional: v
                        .split(",")
                        .map((d) => d.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="Other diagnoses (comma separated)"
                  fieldType="diagnosis"
                  delimiter=","
                  disabled={isLocked}
                />
              </div>
            </div>
          </div>

          {/* Medications Table */}
          <div style={cardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--ink)",
                }}
              >
                Medications (Rx)
              </h2>
              {canEdit && (
                <button onClick={addMedication} style={buttonSecondary}>
                  + Add Medication
                </button>
              )}
            </div>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "var(--surface-2)",
                      textAlign: "left",
                    }}
                  >
                    <th style={{ padding: 10, fontWeight: 700 }}>#</th>
                    <th style={{ padding: 10, fontWeight: 700, minWidth: 180 }}>
                      Drug Name
                    </th>
                    <th style={{ padding: 10, fontWeight: 700 }}>Strength</th>
                    <th style={{ padding: 10, fontWeight: 700 }}>Form</th>
                    <th style={{ padding: 10, fontWeight: 700 }}>Frequency</th>
                    <th style={{ padding: 10, fontWeight: 700 }}>Duration</th>
                    <th style={{ padding: 10, fontWeight: 700 }}>Timing</th>
                    <th style={{ padding: 10, fontWeight: 700 }}>
                      Instructions
                    </th>
                    {canEdit && (
                      <th style={{ padding: 10, fontWeight: 700 }}></th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rxItems.map((item, idx) => (
                    <tr
                      key={idx}
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <td style={{ padding: 8 }}>{idx + 1}</td>
                      <td style={{ padding: 8 }}>
                        <SmartComposer
                          value={item.generic}
                          onChange={(v) => updateMedication(idx, "generic", v)}
                          placeholder="Drug name"
                          fieldType="drug"
                          disabled={isLocked}
                        />
                      </td>
                      <td style={{ padding: 8 }}>
                        <input
                          type="text"
                          value={item.strength || ""}
                          onChange={(e) =>
                            updateMedication(idx, "strength", e.target.value)
                          }
                          placeholder="500mg"
                          disabled={isLocked}
                          style={{ ...inputStyle, width: 80 }}
                        />
                      </td>
                      <td style={{ padding: 8 }}>
                        <SmartComposer
                          value={item.form || ""}
                          onChange={(v) => updateMedication(idx, "form", v)}
                          placeholder="Tab"
                          fieldType="form"
                          disabled={isLocked}
                          style={{ width: 70 }}
                        />
                      </td>
                      <td style={{ padding: 8 }}>
                        <SmartComposer
                          value={item.frequency}
                          onChange={(v) => updateMedication(idx, "frequency", v)}
                          placeholder="OD"
                          fieldType="frequency"
                          disabled={isLocked}
                          style={{ width: 80 }}
                        />
                      </td>
                      <td style={{ padding: 8 }}>
                        <SmartComposer
                          value={item.duration || ""}
                          onChange={(v) => updateMedication(idx, "duration", v)}
                          placeholder="5 days"
                          fieldType="duration"
                          disabled={isLocked}
                          style={{ width: 80 }}
                        />
                      </td>
                      <td style={{ padding: 8 }}>
                        <SmartComposer
                          value={item.timing || ""}
                          onChange={(v) => updateMedication(idx, "timing", v)}
                          placeholder="After food"
                          fieldType="timing"
                          disabled={isLocked}
                          style={{ width: 90 }}
                        />
                      </td>
                      <td style={{ padding: 8 }}>
                        <input
                          type="text"
                          value={item.instructions || ""}
                          onChange={(e) =>
                            updateMedication(idx, "instructions", e.target.value)
                          }
                          placeholder="Notes"
                          disabled={isLocked}
                          style={{ ...inputStyle, width: 100 }}
                        />
                      </td>
                      {canEdit && (
                        <td style={{ padding: 8 }}>
                          <button
                            onClick={() => removeMedication(idx)}
                            style={{
                              background: "rgba(239,68,68,0.1)",
                              border: "none",
                              borderRadius: 6,
                              padding: "6px 10px",
                              cursor: "pointer",
                              color: "#dc2626",
                              fontWeight: 700,
                            }}
                          >
                            ✕
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Safety Alerts */}
          {safetyAlerts.length > 0 && (
            <div
              style={{
                ...cardStyle,
                background: "rgba(245,158,11,0.1)",
                border: "1px solid rgba(245,158,11,0.3)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#b45309",
                  }}
                >
                  Safety Alerts ({safetyAlerts.length})
                </h2>
                <button
                  onClick={() => setShowSafetyPanel(!showSafetyPanel)}
                  style={buttonSecondary}
                >
                  {showSafetyPanel ? "Hide" : "Show"} Details
                </button>
              </div>

              {showSafetyPanel && (
                <div style={{ marginTop: 12 }}>
                  {safetyAlerts.map((alert) => {
                    const overridden = isAlertOverridden(alert.id);
                    return (
                      <div
                        key={alert.id}
                        style={{
                          padding: 12,
                          marginBottom: 8,
                          borderRadius: 10,
                          background: overridden
                            ? "rgba(34,197,94,0.1)"
                            : alert.severity === "high"
                            ? "rgba(239,68,68,0.1)"
                            : "rgba(245,158,11,0.1)",
                          border: `1px solid ${
                            overridden
                              ? "rgba(34,197,94,0.3)"
                              : alert.severity === "high"
                              ? "rgba(239,68,68,0.3)"
                              : "rgba(245,158,11,0.3)"
                          }`,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                          }}
                        >
                          <div>
                            <span
                              style={{
                                fontWeight: 700,
                                color: overridden
                                  ? "#16a34a"
                                  : alert.severity === "high"
                                  ? "#dc2626"
                                  : "#b45309",
                              }}
                            >
                              {alert.severity === "high" ? "🔴" : "🟡"}{" "}
                              {alert.type.toUpperCase()}
                              {overridden && " (Overridden)"}
                            </span>
                            <p
                              style={{
                                margin: "6px 0 0 0",
                                color: "var(--ink)",
                                fontSize: 14,
                              }}
                            >
                              {alert.message}
                            </p>
                            {alert.related_drugs.length > 0 && (
                              <p
                                style={{
                                  margin: "4px 0 0 0",
                                  color: "var(--muted)",
                                  fontSize: 12,
                                }}
                              >
                                Related: {alert.related_drugs.join(", ")}
                              </p>
                            )}
                          </div>
                          {canEdit && !overridden && (
                            <button
                              onClick={() => setSelectedAlertId(alert.id)}
                              style={{
                                ...buttonSecondary,
                                padding: "6px 12px",
                                fontSize: 12,
                              }}
                            >
                              Override
                            </button>
                          )}
                        </div>

                        {/* Override form */}
                        {selectedAlertId === alert.id && (
                          <div style={{ marginTop: 10 }}>
                            <input
                              type="text"
                              value={overrideReason}
                              onChange={(e) => setOverrideReason(e.target.value)}
                              placeholder="Reason for override (min 10 chars)"
                              style={{
                                ...inputStyle,
                                marginBottom: 8,
                              }}
                            />
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                onClick={() => addOverride(alert.id)}
                                style={{
                                  ...buttonPrimary,
                                  padding: "6px 12px",
                                  fontSize: 12,
                                }}
                              >
                                Confirm Override
                              </button>
                              <button
                                onClick={() => setSelectedAlertId(null)}
                                style={{
                                  ...buttonSecondary,
                                  padding: "6px 12px",
                                  fontSize: 12,
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Investigations, Advice, Follow-up */}
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}
          >
            <div style={cardStyle}>
              <h2
                style={{
                  margin: "0 0 8px 0",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--ink)",
                }}
              >
                🔬 Investigations
              </h2>
              <textarea
                value={investigations.join("\n")}
                onChange={(e) =>
                  setInvestigations(
                    e.target.value
                      .split("\n")
                      .map((i) => i.trim())
                      .filter(Boolean)
                  )
                }
                placeholder="One per line"
                disabled={isLocked}
                style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
              />
            </div>
            <div style={cardStyle}>
              <h2
                style={{
                  margin: "0 0 8px 0",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--ink)",
                }}
              >
                Advice
              </h2>
              <textarea
                value={advice.join("\n")}
                onChange={(e) =>
                  setAdvice(
                    e.target.value
                      .split("\n")
                      .map((a) => a.trim())
                      .filter(Boolean)
                  )
                }
                placeholder="One per line"
                disabled={isLocked}
                style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
              />
            </div>
            <div style={cardStyle}>
              <h2
                style={{
                  margin: "0 0 8px 0",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--ink)",
                }}
              >
                📅 Follow-up
              </h2>
              <input
                type="text"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="e.g., After 1 week"
                disabled={isLocked}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div
            style={{
              ...cardStyle,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", gap: 10 }}>
              {canEdit && (
                <>
                  <button
                    onClick={draftId ? updateDraft : createDraft}
                    disabled={loading}
                    style={buttonSecondary}
                  >
                    {loading ? "Saving..." : draftId ? "Save Draft" : "Create Draft"}
                  </button>
                  <button
                    onClick={previewPDF}
                    disabled={loading}
                    style={buttonSecondary}
                  >
                    Preview PDF
                  </button>
                </>
              )}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              {canEdit && (
                <>
                  <button
                    onClick={() => setMode("review")}
                    style={buttonSecondary}
                  >
                    Review Mode
                  </button>
                  <button
                    onClick={lockPrescription}
                    disabled={loading}
                    style={{
                      ...buttonPrimary,
                      background: "linear-gradient(135deg, #22c55e, #16a34a)",
                    }}
                  >
                    🔒 Lock & Finalize
                  </button>
                </>
              )}
              {mode === "review" && (
                <>
                  <button onClick={() => setMode("edit")} style={buttonSecondary}>
                    Back to Edit
                  </button>
                  <button
                    onClick={lockPrescription}
                    disabled={loading}
                    style={{
                      ...buttonPrimary,
                      background: "linear-gradient(135deg, #22c55e, #16a34a)",
                    }}
                  >
                    🔒 Lock & Finalize
                  </button>
                </>
              )}
              {isLocked && (
                <button onClick={downloadPDF} style={buttonPrimary}>
                  📥 Download PDF
                </button>
              )}
            </div>
          </div>

          {/* Locked Info */}
          {isLocked && lockHash && (
            <div
              style={{
                ...cardStyle,
                background: "rgba(34,197,94,0.1)",
                border: "1px solid rgba(34,197,94,0.3)",
              }}
            >
              <h3
                style={{
                  margin: "0 0 8px 0",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#16a34a",
                }}
              >
                🔐 Prescription Locked
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: "var(--muted)",
                  wordBreak: "break-all",
                }}
              >
                <strong>Verification Hash:</strong> {lockHash}
              </p>
              <p
                style={{
                  margin: "8px 0 0 0",
                  fontSize: 11,
                  color: "var(--muted)",
                }}
              >
                This prescription is now immutable. The hash above can be used to verify the prescription's integrity.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* CSS Animation for pulse */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
