import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// frontend/src/pages/ImageInterpretation.tsx
import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../services/api";
import SidebarNav from "../components/SidebarNav";
export default function ImageInterpretation() {
    const nav = useNavigate();
    const fileInputRef = useRef(null);
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [contextText, setContextText] = useState("");
    const [age, setAge] = useState("");
    const [sex, setSex] = useState("");
    const [bodySite, setBodySite] = useState("");
    const [duration, setDuration] = useState("");
    const [busy, setBusy] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [result, setResult] = useState(null);
    const handleFileChange = useCallback((e) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile)
            return;
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
            setPreview(event.target?.result);
        };
        reader.readAsDataURL(selectedFile);
    }, []);
    const handleDrop = useCallback((e) => {
        e.preventDefault();
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && droppedFile.type.startsWith("image/")) {
            setFile(droppedFile);
            setErrorMsg("");
            setResult(null);
            const reader = new FileReader();
            reader.onload = (event) => {
                setPreview(event.target?.result);
            };
            reader.readAsDataURL(droppedFile);
        }
        else {
            setErrorMsg("Please drop an image file");
        }
    }, []);
    const handleDragOver = useCallback((e) => {
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
        if (!file)
            return;
        setBusy(true);
        setErrorMsg("");
        setResult(null);
        try {
            const formData = new FormData();
            formData.append("file", file);
            console.log("[Image] File appended:", file.name, file.type, file.size);
            if (contextText.trim())
                formData.append("context_text", contextText.trim());
            if (age.trim())
                formData.append("age", age.trim());
            if (sex.trim())
                formData.append("sex", sex.trim());
            if (bodySite.trim())
                formData.append("body_site", bodySite.trim());
            if (duration.trim())
                formData.append("duration", duration.trim());
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
        }
        catch (e) {
            setErrorMsg(e?.message || "Analysis failed");
        }
        finally {
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
    const confidenceColor = (conf) => {
        switch (conf) {
            case "high":
                return "#059669";
            case "medium":
                return "#d97706";
            default:
                return "var(--muted)";
        }
    };
    return (_jsx("div", { style: { minHeight: "100vh", background: "var(--page-bg)", padding: "24px 24px 24px 0" }, children: _jsxs("div", { style: { maxWidth: "100%", minWidth: 1200, margin: 0, display: "grid", gridTemplateColumns: "260px 1fr", gap: 24 }, children: [_jsx(SidebarNav, {}), _jsxs("div", { children: [_jsxs("div", { style: { display: "flex", gap: 10, alignItems: "center" }, children: [_jsx("button", { onClick: () => nav("/"), style: {
                                        border: "1px solid var(--border)",
                                        background: "var(--surface)",
                                        padding: "8px 12px",
                                        borderRadius: 12,
                                        cursor: "pointer",
                                        fontWeight: 800,
                                        color: "var(--ink)",
                                        boxShadow: "0 8px 18px rgba(15,23,42,0.08)",
                                    }, children: "\u2190 Back" }), result && (_jsx("button", { onClick: handleNewAnalysis, style: {
                                        border: "1px solid var(--accent)",
                                        background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                                        padding: "8px 16px",
                                        borderRadius: 12,
                                        cursor: "pointer",
                                        fontWeight: 800,
                                        color: "#fff",
                                        boxShadow: "0 8px 18px rgba(14,165,164,0.25)",
                                    }, children: "+ New Analysis" }))] }), _jsx("h1", { style: {
                                marginTop: 16,
                                fontSize: 36,
                                fontWeight: 700,
                                color: "var(--ink)",
                                letterSpacing: -0.6,
                                fontFamily: "var(--font-display)",
                            }, children: "Image Interpretation" }), _jsx("p", { style: { color: "var(--muted)", marginTop: 4 }, children: "AI-assisted analysis of medical/clinical images" }), _jsxs("div", { style: {
                                marginTop: 16,
                                background: "var(--surface)",
                                borderRadius: 18,
                                border: "1px solid var(--border)",
                                padding: 20,
                                boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
                            }, children: [_jsxs("div", { onDrop: handleDrop, onDragOver: handleDragOver, onClick: () => !preview && fileInputRef.current?.click(), style: {
                                        border: preview ? "1px solid var(--border)" : "2px dashed var(--border)",
                                        borderRadius: 16,
                                        padding: preview ? 0 : 40,
                                        textAlign: "center",
                                        cursor: preview ? "default" : "pointer",
                                        background: preview ? "transparent" : "var(--surface-2)",
                                        position: "relative",
                                        overflow: "hidden",
                                    }, children: [_jsx("input", { ref: fileInputRef, type: "file", accept: "image/*", onChange: handleFileChange, style: { display: "none" } }), !preview ? (_jsxs(_Fragment, { children: [_jsx("div", { style: { fontSize: 48, marginBottom: 12 } }), _jsx("div", { style: { fontWeight: 700, color: "var(--ink)", marginBottom: 4 }, children: "Drop an image here or click to upload" }), _jsx("div", { style: { color: "var(--muted)", fontSize: 13 }, children: "Supports JPEG, PNG, GIF, WebP, BMP \u2022 Max 20MB" })] })) : (_jsxs("div", { style: { position: "relative" }, children: [_jsx("img", { src: preview, alt: "Preview", style: {
                                                        maxWidth: "100%",
                                                        maxHeight: 400,
                                                        display: "block",
                                                        margin: "0 auto",
                                                        borderRadius: 12,
                                                    } }), _jsx("button", { onClick: (e) => {
                                                        e.stopPropagation();
                                                        removeFile();
                                                    }, style: {
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
                                                    }, children: "\u2715 Remove" })] }))] }), _jsxs("div", { style: { marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }, children: [_jsxs("label", { style: { display: "grid", gap: 4 }, children: [_jsx("span", { style: { fontWeight: 700, color: "var(--ink)", fontSize: 13 }, children: "Age" }), _jsx("input", { value: age, onChange: (e) => setAge(e.target.value), placeholder: "e.g., 45", style: inputStyle })] }), _jsxs("label", { style: { display: "grid", gap: 4 }, children: [_jsx("span", { style: { fontWeight: 700, color: "var(--ink)", fontSize: 13 }, children: "Sex" }), _jsxs("select", { value: sex, onChange: (e) => setSex(e.target.value), style: inputStyle, children: [_jsx("option", { value: "", children: "Select..." }), _jsx("option", { value: "male", children: "Male" }), _jsx("option", { value: "female", children: "Female" }), _jsx("option", { value: "other", children: "Other" })] })] }), _jsxs("label", { style: { display: "grid", gap: 4 }, children: [_jsx("span", { style: { fontWeight: 700, color: "var(--ink)", fontSize: 13 }, children: "Body Site" }), _jsx("input", { value: bodySite, onChange: (e) => setBodySite(e.target.value), placeholder: "e.g., left forearm", style: inputStyle })] }), _jsxs("label", { style: { display: "grid", gap: 4 }, children: [_jsx("span", { style: { fontWeight: 700, color: "var(--ink)", fontSize: 13 }, children: "Duration" }), _jsx("input", { value: duration, onChange: (e) => setDuration(e.target.value), placeholder: "e.g., 2 weeks", style: inputStyle })] })] }), _jsxs("label", { style: { display: "grid", gap: 4, marginTop: 12 }, children: [_jsx("span", { style: { fontWeight: 700, color: "var(--ink)", fontSize: 13 }, children: "Additional Clinical Context (optional)" }), _jsx("textarea", { value: contextText, onChange: (e) => setContextText(e.target.value), placeholder: "e.g., Patient presents with itchy rash, history of atopic dermatitis...", rows: 3, style: { ...inputStyle, resize: "vertical" } })] }), _jsx("button", { onClick: analyzeImage, disabled: !file || busy, style: {
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
                                    }, children: busy ? "🔄 Analyzing..." : "🔍 Analyze Image" }), errorMsg && _jsx("div", { style: { marginTop: 10, color: "#b91c1c" }, children: errorMsg })] }), result && (_jsxs("div", { style: { marginTop: 20, display: "grid", gap: 14 }, children: [_jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", fontSize: 16, marginBottom: 8 }, children: "Summary" }), _jsx("div", { style: { color: "var(--ink)", lineHeight: 1.6 }, children: result.summary })] }), _jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", fontSize: 16, marginBottom: 8 }, children: "Observations" }), _jsx("ul", { style: { margin: 0, paddingLeft: 20, color: "var(--muted)" }, children: result.observations.map((obs, idx) => (_jsx("li", { style: { marginBottom: 4 }, children: obs }, idx))) })] }), result.red_flags.length > 0 && (_jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid rgba(185,28,28,0.3)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "#b91c1c", fontSize: 16, marginBottom: 8 }, children: "Red Flags" }), _jsx("ul", { style: { margin: 0, paddingLeft: 20, color: "#b91c1c" }, children: result.red_flags.map((flag, idx) => (_jsx("li", { style: { marginBottom: 4 }, children: flag }, idx))) })] })), _jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", fontSize: 16, marginBottom: 12 }, children: "Differential Diagnoses" }), _jsx("div", { style: { display: "grid", gap: 10 }, children: result.differentials.map((diff, idx) => (_jsxs("div", { style: {
                                                    padding: 12,
                                                    background: "var(--surface-2)",
                                                    borderRadius: 12,
                                                    border: "1px solid var(--border)",
                                                }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [_jsx("span", { style: { fontWeight: 800, color: "var(--ink)" }, children: diff.name }), _jsx("span", { style: {
                                                                    fontSize: 11,
                                                                    fontWeight: 800,
                                                                    color: confidenceColor(diff.confidence),
                                                                    textTransform: "uppercase",
                                                                    padding: "2px 8px",
                                                                    background: `${confidenceColor(diff.confidence)}15`,
                                                                    borderRadius: 6,
                                                                }, children: diff.confidence })] }), _jsx("div", { style: { marginTop: 6, color: "var(--muted)", fontSize: 13 }, children: diff.why })] }, idx))) })] }), _jsxs("div", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("div", { style: { fontWeight: 900, color: "var(--ink)", fontSize: 16, marginBottom: 8 }, children: "Recommended Next Steps" }), _jsx("ul", { style: { margin: 0, paddingLeft: 20, color: "var(--muted)" }, children: result.recommended_next_steps.map((step, idx) => (_jsx("li", { style: { marginBottom: 4 }, children: step }, idx))) })] }), _jsxs("details", { style: { background: "var(--surface)", borderRadius: 18, padding: 16, border: "1px solid var(--border)" }, children: [_jsx("summary", { style: { fontWeight: 900, cursor: "pointer", color: "var(--ink)" }, children: "Limitations" }), _jsx("ul", { style: { margin: "8px 0 0 20px", color: "var(--muted)" }, children: result.limitations.map((lim, idx) => (_jsx("li", { style: { marginBottom: 4 }, children: lim }, idx))) })] }), _jsxs("div", { style: {
                                        background: "linear-gradient(135deg, rgba(234,88,12,0.08), rgba(234,88,12,0.04))",
                                        borderRadius: 18,
                                        padding: 16,
                                        border: "1px solid rgba(234,88,12,0.25)",
                                    }, children: [_jsx("div", { style: { fontWeight: 900, color: "#ea580c", fontSize: 14, marginBottom: 8 }, children: "Medical Disclaimer" }), _jsx("div", { style: { color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }, children: result.disclaimer })] })] })), !result && !busy && !file && (_jsxs("div", { style: { marginTop: 24, padding: 24, textAlign: "center", color: "var(--muted)" }, children: [_jsx("div", { style: { fontSize: 48, marginBottom: 12 }, children: "\uD83C\uDFE5" }), _jsx("div", { style: { fontWeight: 700 }, children: "Upload a medical image to get AI-assisted analysis" }), _jsx("div", { style: { marginTop: 8 }, children: "Supports skin lesions, X-rays, CT scans, and other clinical images." })] }))] })] }) }));
}
const inputStyle = {
    padding: 10,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "var(--ink)",
    fontSize: 14,
};
