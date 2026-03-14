// frontend/src/pages/DrugDatabase.tsx
// Clinova — Drug Database: mobile-first with curated categories + Add to Rx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../services/api";
import SidebarNav from "../components/SidebarNav";

interface DrugSummary {
  id: string;
  name: string;
  generic_name: string;
  drug_class: string | string[];
  route: string | string[];
  indications_preview?: string;
  completeness_score?: number;
  brand_names?: string | string[];
  india_brands?: string | string[];
  manufacturer?: string;
  has_curated?: boolean;
}

interface SuggestResult {
  id: string;
  name: string;
  generic_name: string;
  drug_class: string[];
  route: string[];
  india_brands: string[];
}

function parseField(val: string | string[] | undefined): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return [val]; }
}

function cleanClass(cls: string): string {
  return cls.replace(/ \[EPC\]/g, "").trim();
}

function cleanIndication(text: string): string {
  return text
    .replace(/^\d+\s+INDICATIONS AND USAGE\s*/i, "")
    .replace(/^INDICATIONS AND USAGE\s*/i, "")
    .replace(/^\d+\.\d+\s+/, "")
    .trim();
}

// Curated doctor-friendly categories (replaces 18 noisy FDA classes)
const DOCTOR_CATEGORIES = [
  { label: "Common", search: "antibiotic analgesic antidiabetic" },
  { label: "Antibiotic", search: "penicillin cephalosporin fluoroquinolone macrolide antibiotic" },
  { label: "Cardiac", search: "beta blocker ACE inhibitor calcium channel blocker antihypertensive" },
  { label: "Diabetes", search: "metformin insulin sulfonylurea DPP-4 SGLT2 antidiabetic" },
  { label: "Pain/Fever", search: "analgesic NSAID opioid acetaminophen ibuprofen" },
  { label: "Neuro/Psych", search: "antidepressant antipsychotic anticonvulsant benzodiazepine" },
  { label: "Respiratory", search: "bronchodilator inhaler corticosteroid antihistamine asthma" },
  { label: "GI", search: "omeprazole pantoprazole antacid antiemetic proton pump" },
];

function addToRx(drug: { id: string; name: string }) {
  try {
    const raw = localStorage.getItem("clinova_current_rx");
    const rx = raw ? JSON.parse(raw) : { patient: {}, drugs: [], createdAt: new Date().toISOString() };
    if (rx.drugs.some((d: any) => d.id === drug.id)) return; // already in Rx
    rx.drugs.push({ id: drug.id, name: drug.name, dose: "", frequency: "", duration: "", route: "Oral", instructions: "" });
    localStorage.setItem("clinova_current_rx", JSON.stringify(rx));
    window.dispatchEvent(new Event("rx-updated"));
  } catch {}
}

export default function DrugDatabase() {
  const navigate = useNavigate();
  const [drugs, setDrugs] = useState<DrugSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rxToast, setRxToast] = useState("");

  // Suggest dropdown
  const [suggestions, setSuggestions] = useState<SuggestResult[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestIdx, setSuggestIdx] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Live suggest
  useEffect(() => {
    if (searchQuery.length < 2) { setSuggestions([]); setShowSuggest(false); return; }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/drugs/suggest?q=${encodeURIComponent(searchQuery)}&limit=8`, { signal: ac.signal });
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(data.results || []);
        setShowSuggest(true);
      } catch {}
    }, 150);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Close suggest on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSuggest(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const loadDrugs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "40" });
      if (debouncedSearch) params.set("q", debouncedSearch);
      const res = await fetch(`${API_BASE}/drugs/list?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDrugs(data.drugs); setTotal(data.total); setTotalPages(data.total_pages);
      }
    } catch {} finally { setLoading(false); }
  }, [page, debouncedSearch]);

  useEffect(() => { loadDrugs(); }, [loadDrugs]);
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  function handleCategoryClick(cat: typeof DOCTOR_CATEGORIES[0]) {
    if (activeCategory === cat.label) {
      setActiveCategory("");
      setSearchQuery("");
    } else {
      setActiveCategory(cat.label);
      setSearchQuery(cat.search.split(" ")[0]); // Use first keyword
    }
  }

  function handleAddToRx(e: React.MouseEvent, drug: DrugSummary) {
    e.stopPropagation();
    addToRx({ id: drug.id, name: drug.name });
    setRxToast(drug.name);
    setTimeout(() => setRxToast(""), 2000);
  }

  function handleSuggestAddRx(e: React.MouseEvent, s: SuggestResult) {
    e.stopPropagation();
    addToRx({ id: s.id, name: s.name });
    setRxToast(s.name);
    setTimeout(() => setRxToast(""), 2000);
  }

  function handleSuggestKey(e: React.KeyboardEvent) {
    if (!showSuggest || !suggestions.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSuggestIdx(p => p < suggestions.length - 1 ? p + 1 : 0); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSuggestIdx(p => p > 0 ? p - 1 : suggestions.length - 1); }
    else if (e.key === "Enter" && suggestIdx >= 0) { e.preventDefault(); navigate(`/drugs/${suggestions[suggestIdx].id}`); }
    else if (e.key === "Escape") setShowSuggest(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", display: "flex" }}>
      <div className="sidebar-collapse" style={{ width: 240, minWidth: 240, minHeight: "100vh" }}>
        <SidebarNav />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Hero — compact on mobile */}
        <div className="hero-section" style={{ padding: "0 20px", paddingBottom: 24 }}>
          <div style={{ maxWidth: 960, padding: "28px 0 0" }}>
            <h1 style={{ margin: 0, fontSize: 28, fontFamily: "var(--font-display)", fontStyle: "italic", color: "#fff", letterSpacing: -0.5 }}>
              Drug Database
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
              {total > 0 ? `${total.toLocaleString()} drugs` : "Loading..."} &middot; FDA labels &middot; India brands
            </p>
          </div>
        </div>

        <div style={{ maxWidth: 960, padding: "16px 16px 0" }}>
          {/* Search */}
          <div ref={searchRef} style={{ position: "relative", marginBottom: 12 }}>
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSuggestIdx(-1); setActiveCategory(""); }}
              onKeyDown={handleSuggestKey}
              onFocus={() => { if (suggestions.length > 0) setShowSuggest(true); }}
              placeholder="Search drug name, brand, or indication..."
              autoComplete="off"
              style={{
                width: "100%", padding: "12px 16px", fontSize: 15,
                border: "1.5px solid var(--border)", borderRadius: 12,
                background: "#fff", color: "var(--ink)", outline: "none",
                fontFamily: "var(--font-sans)",
              }}
            />
            {/* Suggest dropdown */}
            {showSuggest && suggestions.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
                background: "#fff", border: "1px solid var(--border)", borderRadius: 12,
                boxShadow: "0 8px 24px rgba(15,23,42,0.12)", zIndex: 1000, maxHeight: 360, overflowY: "auto",
              }}>
                {suggestions.map((s, i) => (
                  <div
                    key={s.id}
                    onClick={() => { setShowSuggest(false); navigate(`/drugs/${s.id}`); }}
                    onMouseEnter={() => setSuggestIdx(i)}
                    style={{
                      padding: "10px 14px", cursor: "pointer",
                      background: i === suggestIdx ? "rgba(15,118,110,0.04)" : "transparent",
                      borderBottom: i < suggestions.length - 1 ? "1px solid var(--border)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{s.name}</span>
                          {s.drug_class?.slice(0, 1).map((c, ci) => (
                            <span key={ci} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(15,118,110,0.06)", color: "var(--teal-700)", fontFamily: "var(--font-mono)" }}>
                              {cleanClass(c)}
                            </span>
                          ))}
                        </div>
                        {s.india_brands?.length > 0 && (
                          <div style={{ fontSize: 12, color: "var(--teal-700)", marginTop: 2, fontWeight: 500 }}>
                            {s.india_brands.slice(0, 3).join(", ")}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => handleSuggestAddRx(e, s)}
                        style={{
                          padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                          border: "1px solid var(--teal-700)", background: "transparent",
                          color: "var(--teal-700)", cursor: "pointer", whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        + Rx
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Doctor-friendly category chips — horizontal scroll on mobile */}
          <div style={{
            display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8,
            WebkitOverflowScrolling: "touch", msOverflowStyle: "none",
            scrollbarWidth: "none",
          }}>
            <button
              onClick={() => { setActiveCategory(""); setSearchQuery(""); }}
              style={pillStyle(!activeCategory)}
            >
              All
            </button>
            {DOCTOR_CATEGORIES.map(cat => (
              <button
                key={cat.label}
                onClick={() => handleCategoryClick(cat)}
                style={pillStyle(activeCategory === cat.label)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Drug grid */}
        <div style={{ maxWidth: 960, padding: "8px 16px 80px" }}>
          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 100, borderRadius: 12 }} />
              ))}
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                {drugs.map(drug => (
                  <DrugCard
                    key={drug.id}
                    drug={drug}
                    onClick={() => navigate(`/drugs/${drug.id}`)}
                    onAddRx={(e) => handleAddToRx(e, drug)}
                  />
                ))}
              </div>
              {drugs.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: 13 }}>
                  {debouncedSearch ? `No drugs match "${debouncedSearch}"` : "No drugs found."}
                </div>
              )}
              {totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={pageBtnStyle(page <= 1)}>Prev</button>
                  <span style={{ padding: "8px 14px", fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
                    {page} / {totalPages}
                  </span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={pageBtnStyle(page >= totalPages)}>Next</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Rx toast */}
      {rxToast && (
        <div style={{
          position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
          background: "var(--teal-900)", color: "#fff", padding: "10px 20px",
          borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 500,
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        }}>
          {rxToast} added to Rx
        </div>
      )}
    </div>
  );
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: "7px 14px", borderRadius: 999, cursor: "pointer", fontSize: 13,
    border: active ? "1.5px solid var(--teal-700)" : "1px solid var(--border)",
    background: active ? "var(--teal-50)" : "#fff",
    color: active ? "var(--teal-700)" : "var(--text-secondary)",
    fontWeight: active ? 600 : 500,
    whiteSpace: "nowrap", flexShrink: 0,
  };
}

function pageBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)",
    background: "#fff", fontSize: 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
    color: disabled ? "var(--text-muted)" : "var(--ink)",
  };
}

function DrugCard({ drug, onClick, onAddRx }: { drug: DrugSummary; onClick: () => void; onAddRx: (e: React.MouseEvent) => void }) {
  const classes = parseField(drug.drug_class).map(cleanClass);
  const routes = parseField(drug.route);
  const india = parseField(drug.india_brands);
  const indiaPrev = drug.indications_preview ? cleanIndication(drug.indications_preview) : "";

  return (
    <div
      onClick={onClick}
      style={{
        padding: "14px 16px", border: "1px solid var(--border)",
        borderRadius: 12, background: "#fff", cursor: "pointer", textAlign: "left",
        transition: "all 0.12s ease",
        display: "flex", flexDirection: "column", gap: 5,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)", lineHeight: 1.3, flex: 1 }}>{drug.name}</div>
        <button
          onClick={onAddRx}
          style={{
            padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700,
            border: "1px solid var(--teal-700)", background: "transparent",
            color: "var(--teal-700)", cursor: "pointer", whiteSpace: "nowrap",
            flexShrink: 0, marginLeft: 8,
          }}
        >
          + Rx
        </button>
      </div>

      {/* India brands first — most useful for Indian doctors */}
      {india.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--teal-700)", fontWeight: 500 }}>
          {india.slice(0, 3).join(", ")}
        </div>
      )}

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {classes.slice(0, 2).map((cls, i) => (
          <span key={i} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(15,118,110,0.06)", color: "var(--teal-700)", fontFamily: "var(--font-mono)", fontWeight: 500 }}>{cls}</span>
        ))}
        {routes.slice(0, 1).map((r, i) => (
          <span key={`r${i}`} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(0,0,0,0.04)", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{r}</span>
        ))}
      </div>

      {indiaPrev && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{indiaPrev}</div>
      )}

      {/* If no India brands, show manufacturer */}
      {india.length === 0 && drug.manufacturer && (
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{drug.manufacturer}</div>
      )}
    </div>
  );
}
