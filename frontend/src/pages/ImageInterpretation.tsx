// frontend/src/pages/ImageInterpretation.tsx
import React, { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../services/api";
import SidebarNav from "../components/SidebarNav";

interface DifferentialItem {
  name: string;
  why: string;
  confidence: "low" | "medium" | "high";
}

interface AnalysisResult {
  summary: string;
  observations: string[];
  differentials: DifferentialItem[];
  red_flags: string[];
  recommended_next_steps: string[];
  limitations: string[];
  disclaimer: string;
}

export default function ImageInterpretation() {
  const nav = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [contextText, setContextText] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [bodySite, setBodySite] = useState("");
  const [duration, setDuration] = useState("");
  
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    if (!selectedFile.type.startsWith("image/")) {
      setErrorMsg("Please select an image file (JPEG, PNG, GIF, WebP, or BMP)");
      return;
    }

    // Validate file size (20MB max)
    if (selectedFile.size > 20 * 1024 * 1024) {
      setErrorMsg("File size must be less than 20MB");
      return;
    }

    setFile(selectedFile);
    setErrorMsg("");
    setResult(null);

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setPreview(event.target?.result as string);
    };
    reader.readAsDataURL(selectedFile);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith("image/")) {
      setFile(droppedFile);
      setErrorMsg("");
      setResult(null);

      const reader = new FileReader();
      reader.onload = (event) => {
        setPreview(event.target?.result as string);
      };
      reader.readAsDataURL(droppedFile);
    } else {
      setErrorMsg("Please drop an image file");
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const removeFile = useCallback(() => {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const analyzeImage = async () => {
    console.log("[Image] analyzeImage called with file:", file?.name, file?.size);
    if (!file) return;

    setBusy(true);
    setErrorMsg("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      console.log("[Image] File appended:", file.name, file.type, file.size);
      if (contextText.trim()) formData.append("context_text", contextText.trim());
      if (age.trim()) formData.append("age", age.trim());
      if (sex.trim()) formData.append("sex", sex.trim());
      if (bodySite.trim()) formData.append("body_site", bodySite.trim());
      if (duration.trim()) formData.append("duration", duration.trim());

      console.log("[Image] Sending request to:", `${API_BASE}/image/analyze`);
      const res = await fetch(`${API_BASE}/image/analyze`, {
        method: "POST",
        body: formData,
      });

      console.log("[Image] Response status:", res.status, res.statusText);
      if (!res.ok) {
        const errText = await res.text();
        console.error("[Image] Error response:", errText);
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const data = await res.json();
      console.log("[Image] Response data:", data);
      setResult(data);
    } catch (e: any) {
      setErrorMsg(e?.message || "Analysis failed");
    } finally {
      setBusy(false);
    }
  };

  const handleNewAnalysis = () => {
    removeFile();
    setContextText("");
    setAge("");
    setSex("");
    setBodySite("");
    setDuration("");
    setErrorMsg("");
  };

  const confidenceColor = (conf: string) => {
    switch (conf) {
      case "high":
        return "#059669";
      case "medium":
        return "#d97706";
      default:
        return "var(--muted)";
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg)", padding: "24px 24px 24px 0" }}>
      <div style={{ maxWidth: "100%", minWidth: 1200, margin: 0, display: "grid", gridTemplateColumns: "260px 1fr", gap: 24 }}>
        <SidebarNav />

        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={() => nav("/")}
              style={{
                border: "1px solid var(--border)",
                background: "var(--surface)",
                padding: "8px 12px",
                borderRadius: 12,
                cursor: "pointer",
                fontWeight: 800,
                color: "var(--ink)",
                boxShadow: "0 8px 18px rgba(15,23,42,0.08)",
              }}
            >
              ← Back
            </button>
            
            {result && (
              <button
                onClick={handleNewAnalysis}
                style={{
                  border: "1px solid var(--accent)",
                  background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                  padding: "8px 16px",
                  borderRadius: 12,
                  cursor: "pointer",
                  fontWeight: 800,
                  color: "#fff",
                  boxShadow: "0 8px 18px rgba(14,165,164,0.25)",
                }}
              >
                + New Analysis
              </button>
            )}
          </div>

          <h1
            style={{
              marginTop: 16,
              fontSize: 36,
              fontWeight: 700,
              color: "var(--ink)",
              letterSpacing: -0.6,
              fontFamily: "var(--font-display)",
            }}
          >
            Image Interpretation
          </h1>
          <p style={{ color: "var(--muted)", marginTop: 4 }}>
            AI-assisted analysis of medical/clinical images
          </p>

          <div
            style={{
              marginTop: 16,
              background: "var(--surface)",
              borderRadius: 18,
              border: "1px solid var(--border)",
              padding: 20,
              boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
            }}
          >
            {/* Upload Area */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => !preview && fileInputRef.current?.click()}
              style={{
                border: preview ? "1px solid var(--border)" : "2px dashed var(--border)",
                borderRadius: 16,
                padding: preview ? 0 : 40,
                textAlign: "center",
                cursor: preview ? "default" : "pointer",
                background: preview ? "transparent" : "var(--surface-2)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
              
              {!preview ? (
                <>
                  <div style={{ fontSize: 48, marginBottom: 12 }}></div>
                  <div style={{ fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
                    Drop an image here or click to upload
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>
                    Supports JPEG, PNG, GIF, WebP, BMP • Max 20MB
                  </div>
                </>
              ) : (
                <div style={{ position: "relative" }}>
                  <img
                    src={preview}
                    alt="Preview"
                    style={{
                      maxWidth: "100%",
                      maxHeight: 400,
                      display: "block",
                      margin: "0 auto",
                      borderRadius: 12,
                    }}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile();
                    }}
                    style={{
                      position: "absolute",
                      top: 12,
                      right: 12,
                      background: "rgba(0,0,0,0.7)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      padding: "6px 12px",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    ✕ Remove
                  </button>
                </div>
              )}
            </div>

            {/* Context Fields */}
            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontWeight: 700, color: "var(--ink)", fontSize: 13 }}>Age</span>
                <input
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="e.g., 45"
                  style={inputStyle}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontWeight: 700, color: "var(--ink)", fontSize: 13 }}>Sex</span>
                <select value={sex} onChange={(e) => setSex(e.target.value)} style={inputStyle}>
                  <option value="">Select...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontWeight: 700, color: "var(--ink)", fontSize: 13 }}>Body Site</span>
                <input
                  value={bodySite}
                  onChange={(e) => setBodySite(e.target.value)}
                  placeholder="e.g., left forearm"
                  style={inputStyle}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontWeight: 700, color: "var(--ink)", fontSize: 13 }}>Duration</span>
                <input
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="e.g., 2 weeks"
                  style={inputStyle}
                />
              </label>
            </div>

            <label style={{ display: "grid", gap: 4, marginTop: 12 }}>
              <span style={{ fontWeight: 700, color: "var(--ink)", fontSize: 13 }}>
                Additional Clinical Context (optional)
              </span>
              <textarea
                value={contextText}
                onChange={(e) => setContextText(e.target.value)}
                placeholder="e.g., Patient presents with itchy rash, history of atopic dermatitis..."
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </label>

            <button
              onClick={analyzeImage}
              disabled={!file || busy}
              style={{
                marginTop: 16,
                padding: "14px 24px",
                borderRadius: 12,
                border: "1px solid rgba(14,165,164,0.35)",
                background: !file || busy ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), var(--accent-2))",
                color: !file || busy ? "var(--muted)" : "#fff",
                fontWeight: 800,
                cursor: !file || busy ? "not-allowed" : "pointer",
                boxShadow: !file || busy ? "none" : "0 12px 28px rgba(14,165,164,0.3)",
                fontSize: 16,
              }}
            >
              {busy ? "🔄 Analyzing..." : "🔍 Analyze Image"}
            </button>

            {errorMsg && <div style={{ marginTop: 10, color: "#b91c1c" }}>{errorMsg}</div>}
          </div>

          {/* Results */}
          {result && (
            <div style={{ marginTop: 20, display: "grid", gap: 14 }}>
              {/* Summary */}
              <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16, marginBottom: 8 }}>Summary</div>
                <div style={{ color: "var(--ink)", lineHeight: 1.6 }}>{result.summary}</div>
              </div>

              {/* Observations */}
              <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16, marginBottom: 8 }}>Observations</div>
                <ul style={{ margin: 0, paddingLeft: 20, color: "var(--muted)" }}>
                  {result.observations.map((obs, idx) => (
                    <li key={idx} style={{ marginBottom: 4 }}>{obs}</li>
                  ))}
                </ul>
              </div>

              {/* Red Flags */}
              {result.red_flags.length > 0 && (
                <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid rgba(185,28,28,0.3)" }}>
                  <div style={{ fontWeight: 900, color: "#b91c1c", fontSize: 16, marginBottom: 8 }}>Red Flags</div>
                  <ul style={{ margin: 0, paddingLeft: 20, color: "#b91c1c" }}>
                    {result.red_flags.map((flag, idx) => (
                      <li key={idx} style={{ marginBottom: 4 }}>{flag}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Differentials */}
              <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16, marginBottom: 12 }}>Differential Diagnoses</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {result.differentials.map((diff, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: 12,
                        background: "var(--surface-2)",
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 800, color: "var(--ink)" }}>{diff.name}</span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            color: confidenceColor(diff.confidence),
                            textTransform: "uppercase",
                            padding: "2px 8px",
                            background: `${confidenceColor(diff.confidence)}15`,
                            borderRadius: 6,
                          }}
                        >
                          {diff.confidence}
                        </span>
                      </div>
                      <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13 }}>{diff.why}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Next Steps */}
              <div style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 16, marginBottom: 8 }}>Recommended Next Steps</div>
                <ul style={{ margin: 0, paddingLeft: 20, color: "var(--muted)" }}>
                  {result.recommended_next_steps.map((step, idx) => (
                    <li key={idx} style={{ marginBottom: 4 }}>{step}</li>
                  ))}
                </ul>
              </div>

              {/* Limitations */}
              <details style={{ background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }}>
                <summary style={{ fontWeight: 900, cursor: "pointer", color: "var(--ink)" }}>Limitations</summary>
                <ul style={{ margin: "8px 0 0 20px", color: "var(--muted)" }}>
                  {result.limitations.map((lim, idx) => (
                    <li key={idx} style={{ marginBottom: 4 }}>{lim}</li>
                  ))}
                </ul>
              </details>

              {/* Disclaimer */}
              <div
                style={{
                  background: "linear-gradient(135deg, rgba(234,88,12,0.08), rgba(234,88,12,0.04))",
                  borderRadius: 18,
                  padding: 16,
                  border: "1px solid rgba(234,88,12,0.25)",
                }}
              >
                <div style={{ fontWeight: 900, color: "#ea580c", fontSize: 14, marginBottom: 8 }}>Medical Disclaimer</div>
                <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>{result.disclaimer}</div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!result && !busy && !file && (
            <div style={{ marginTop: 24, padding: 24, textAlign: "center", color: "var(--muted)" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🏥</div>
              <div style={{ fontWeight: 700 }}>Upload a medical image to get AI-assisted analysis</div>
              <div style={{ marginTop: 8 }}>
                Supports skin lesions, X-rays, CT scans, and other clinical images.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--ink)",
  fontSize: 14,
};
