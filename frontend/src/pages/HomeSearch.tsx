// frontend/src/pages/HomeSearch.tsx
import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cleanTopicTitle, suggestByCollection } from "../api/topic";
import type { CollectionKey } from "../api/topic";
import SidebarNav from "../components/SidebarNav";
import AutocompleteDropdown, { AutocompleteItem } from "../components/AutocompleteDropdown";

export default function HomeSearch() {
  const navigate = useNavigate();

  // NON-NEGOTIABLE: do not show subjects in UI.
  // Keep backend collection logic intact by using a silent default.
  const [collection] = useState<CollectionKey>("medicine");
  const [query, setQuery] = useState("");

  // Convert suggestions to AutocompleteItem format
  const fetchSuggestions = useCallback(
    async (q: string, signal: AbortSignal): Promise<AutocompleteItem[]> => {
      const list = await suggestByCollection(collection, q.trim(), 50, signal);
      return list.map((text, idx) => ({
        id: `${text}-${idx}`,
        text: cleanTopicTitle(text),
      }));
    },
    [collection]
  );

  function goToTopic(rawTitle: string) {
    const cleaned = cleanTopicTitle(rawTitle);
    if (!cleaned) return;
    // keep routing exactly same pattern; collection stays silent "medicine"
    navigate(`/topic/${collection}?q=${encodeURIComponent(cleaned)}`);
  }

  const handleSelect = useCallback(
    (item: AutocompleteItem) => {
      goToTopic(item.text);
    },
    [collection, navigate]
  );

  const handleSubmit = useCallback(
    (value: string) => {
      if (value.trim()) {
        goToTopic(value);
      }
    },
    [collection, navigate]
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg)", padding: "24px 24px 24px 0" }}>
      <div style={{ maxWidth: "100%", minWidth: 1280, margin: 0, display: "grid", gridTemplateColumns: "260px 1fr", gap: 28 }}>
        <SidebarNav />

        <div style={{ minHeight: "86vh", display: "grid", alignContent: "center" }}>
          <div style={{ maxWidth: 900, margin: "0 auto", width: "100%" }}>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div
                style={{
                  fontSize: 64,
                  fontWeight: 700,
                  letterSpacing: -1.2,
                  fontFamily: "var(--font-display)",
                  color: "var(--ink)",
                  background: "linear-gradient(135deg, var(--ink), var(--accent))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                MedCompanion
              </div>
              <div style={{ color: "var(--muted)", marginTop: 10, fontSize: 17 }}>
                Doctor-grade medical knowledge at your fingertips
              </div>
            </div>

            <div
              style={{
                borderRadius: 24,
                padding: "32px",
                background: "linear-gradient(180deg, var(--surface), var(--surface-2))",
                border: "1px solid var(--border)",
                boxShadow: "0 24px 48px rgba(15,23,42,0.1)",
              }}
            >
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <AutocompleteDropdown
                    query={query}
                    value={query}
                    onChange={setQuery}
                    fetchSuggestions={fetchSuggestions}
                    onSelect={handleSelect}
                    onSubmit={handleSubmit}
                    minChars={2}
                    debounceMs={200}
                    maxItems={12}
                    placeholder="Search medical topics... (e.g., epilepsy, diabetes, pneumonia)"
                    inputStyle={{
                      padding: "22px 24px",
                      fontSize: 20,
                      borderRadius: 18,
                    }}
                  />
                </div>
                <button
                  onClick={() => handleSubmit(query)}
                  disabled={!query.trim()}
                  style={{
                    padding: "22px 32px",
                    borderRadius: 18,
                    border: "1px solid rgba(14,165,164,0.4)",
                    background: query.trim()
                      ? "linear-gradient(135deg, var(--accent), var(--accent-2))"
                      : "var(--surface-2)",
                    color: query.trim() ? "#fff" : "var(--muted)",
                    cursor: query.trim() ? "pointer" : "not-allowed",
                    fontWeight: 800,
                    fontSize: 17,
                    boxShadow: query.trim() ? "0 12px 28px rgba(14,165,164,0.25)" : "none",
                    transition: "all 0.2s ease",
                  }}
                >
                  Search
                </button>
              </div>

              <div style={{ marginTop: 18, color: "var(--muted)", fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>Tip:</span> Use{" "}
                <kbd style={{ background: "var(--surface-2)", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>↑</kbd>{" "}
                <kbd style={{ background: "var(--surface-2)", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>↓</kbd>{" "}
                to navigate,{" "}
                <kbd style={{ background: "var(--surface-2)", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>Enter</kbd>{" "}
                to select,{" "}
                <kbd style={{ background: "var(--surface-2)", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>Esc</kbd>{" "}
                to close
              </div>
            </div>

            {/* Quick Links */}
            <div style={{ marginTop: 32 }}>
              <div style={{ color: "var(--ink)", fontWeight: 800, marginBottom: 14, fontSize: 15 }}>
                Popular Topics
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {[
                  "Hypertension",
                  "Type 2 Diabetes",
                  "Epilepsy",
                  "Pneumonia",
                  "Heart Failure",
                  "Asthma",
                  "COPD",
                  "Anemia",
                  "Hypothyroidism",
                  "Hyperlipidemia",
                ].map((topic) => (
                  <button
                    key={topic}
                    onClick={() => goToTopic(topic)}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--ink)",
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: 14,
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--accent)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 20, color: "var(--muted-2)", fontSize: 12, textAlign: "center" }}>
              Powered by Harrison's Principles of Internal Medicine and other trusted medical references
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
