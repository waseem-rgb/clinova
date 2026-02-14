// frontend/src/pages/TopicView.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import SidebarNav from "../components/SidebarNav";
import { COLLECTIONS, cleanTopicTitle, getTopicByCollection } from "../api/topic";
import type { CollectionKey, TopicDoctorView, TopicResponse } from "../api/topic";

function isCollectionKey(x: any): x is CollectionKey {
  return x === "medicine" || x === "obgyn" || x === "pediatrics" || x === "surgery";
}

const DEFAULT_OPEN = new Set([
  "diagnostic_approach",
  "treatment_strategy",
  "clinical_pearls",
  "clinical_features",
]);
const KEY_SECTIONS = new Set(["diagnostic_approach", "treatment_strategy", "clinical_pearls", "clinical_features"]);

function hasSectionContent(section: TopicDoctorView["sections"][number]) {
  const content = (section.content || []).filter((c) => c && c.trim().length > 0);
  if (content.length > 0) return true;
  if (section.subsections?.some((s) => (s.content || []).some((c) => c && c.trim().length > 0))) return true;
  if (section.tables?.some((t) => (t.rows || []).length > 0)) return true;
  return false;
}

function SectionAccordion({ section }: { section: TopicDoctorView["sections"][number] }) {
  const openByDefault = DEFAULT_OPEN.has(section.id);
  return (
    <details open={openByDefault} style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 14 }}>
      <summary style={{ cursor: "pointer", fontWeight: 800, color: "var(--ink)" }}>{section.title}</summary>
      <div style={{ marginTop: 10, color: "var(--ink)" }}>
        {section.content?.map((p, idx) => (
          <p key={idx} style={{ margin: "8px 0", lineHeight: 1.6 }}>
            {p}
          </p>
        ))}

        {section.subsections?.map((sub, idx) => (
          <div key={idx} style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{sub.title}</div>
            {sub.content?.map((p, i) => (
              <p key={i} style={{ margin: "6px 0", lineHeight: 1.6 }}>
                {p}
              </p>
            ))}
          </div>
        ))}

        {section.tables?.map((tbl, idx) => (
          <div key={idx} style={{ marginTop: 12 }}>
            {tbl.title && <div style={{ fontWeight: 700, marginBottom: 6 }}>{tbl.title}</div>}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {tbl.columns.map((c, i) => (
                    <th
                      key={i}
                      style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tbl.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </details>
  );
}

function QuickViewCard({ quickView }: { quickView: TopicDoctorView["quick_view"] }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: 16,
        border: "1px solid var(--border)",
        padding: 16,
        boxShadow: "var(--shadow)",
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 10, color: "var(--ink)" }}>Clinical Quick View</div>
      <ul style={{ margin: 0, paddingLeft: 18, color: "var(--ink)" }}>
        {quickView.bullets?.slice(0, 8).map((b, i) => (
          <li key={i} style={{ marginBottom: 6, lineHeight: 1.5 }}>
            {b}
          </li>
        ))}
      </ul>
      {quickView.table && quickView.table.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                  Clinical Question
                </th>
                <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                  Practical Answer
                </th>
              </tr>
            </thead>
            <tbody>
              {quickView.table.map((row, idx) => (
                <tr key={idx}>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>{row.q}</td>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>{row.a}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ThresholdsTable({ rows }: { rows: TopicDoctorView["thresholds"] }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: 16,
        border: "1px solid var(--border)",
        padding: 16,
        boxShadow: "var(--shadow)",
        marginTop: 16,
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 10, color: "var(--ink)" }}>
        Interpretation / Key thresholds
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
              Finding / Threshold
            </th>
            <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
              Clinical meaning
            </th>
            <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
              Next step
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx}>
              <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>{r.finding}</td>
              <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>{r.meaning}</td>
              <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>{r.next_step}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EvidenceDrawer({ items }: { items: TopicResponse["evidence"]["items"] }) {
  if (!items || items.length === 0) return null;
  return (
    <details style={{ marginTop: 18 }}>
      <summary style={{ cursor: "pointer", fontWeight: 800, color: "var(--ink)" }}>Show evidence</summary>
      <div style={{ marginTop: 10 }}>
        {items.map((it) => (
          <div
            key={it.id}
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface)",
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
              {it.meta?.source}
              {it.meta?.chapter ? ` • ${it.meta.chapter}` : ""}
              {it.meta?.page_start ? ` • p.${it.meta.page_start}` : ""}
            </div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{it.text}</div>
          </div>
        ))}
      </div>
    </details>
  );
}

export default function TopicView() {
  const navigate = useNavigate();
  const params = useParams();
  const [sp] = useSearchParams();

  const collection: CollectionKey = useMemo(() => {
    const raw = params.collection;
    return isCollectionKey(raw) ? raw : "medicine";
  }, [params.collection]);

  const qRaw = sp.get("q") ?? "";
  const q = useMemo(() => cleanTopicTitle(qRaw), [qRaw]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<TopicResponse | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!q.trim()) {
      setErr("Missing topic query");
      setData(null);
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    (async () => {
      try {
        setErr(null);
        setLoading(true);

        const resp = await getTopicByCollection(collection, q, ac.signal);
        setData(resp);
      } catch (e: any) {
        if (e?.name !== "AbortError") setErr(e?.message ?? "Failed to fetch topic");
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [collection, q]);

  const collectionLabel = COLLECTIONS.find((c) => c.key === collection)?.label ?? "Medicine";

  const doctorView = data?.doctor_view;
  const sections = useMemo(() => doctorView?.sections ?? [], [doctorView]);
  const filteredSections = useMemo(() => sections.filter(hasSectionContent), [sections]);
  const thresholds = useMemo(() => doctorView?.thresholds ?? [], [doctorView]);
  const hasKeySections = useMemo(
    () => filteredSections.some((section) => section.id && KEY_SECTIONS.has(section.id)),
    [filteredSections]
  );
  const hasPearlSection = useMemo(
    () => filteredSections.some((section) => section.id === "clinical_pearls"),
    [filteredSections]
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg)", padding: "24px 24px 24px 0" }}>
      <div style={{ maxWidth: "100%", minWidth: 1200, margin: 0, display: "grid", gridTemplateColumns: "260px 1fr", gap: 24 }}>
        <SidebarNav />

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <button
              onClick={() => navigate("/")}
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
            <div style={{ fontWeight: 800, color: "var(--muted)" }}>{collectionLabel}</div>
          </div>

          <div
            style={{
              background: "var(--surface)",
              borderRadius: 18,
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow)",
              padding: 22,
            }}
          >
            <div
              style={{
                fontSize: 40,
                fontWeight: 700,
                letterSpacing: -0.8,
                marginBottom: 6,
                color: "var(--ink)",
                fontFamily: "var(--font-display)",
              }}
            >
              {q || "Topic"}
            </div>

            <div style={{ color: "var(--muted)", marginBottom: 16 }}>Doctor-friendly structured topic view</div>

            {(loading || (!err && !doctorView)) && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontWeight: 700 }}>
                <span className="hourglass" aria-hidden style={{ fontSize: 24, lineHeight: 1, display: "inline-block" }}>
                  ⏳
                </span>
                Loading topic…
              </div>
            )}
            {err && <div style={{ color: "#b91c1c", fontWeight: 700 }}>{err}</div>}

            {!loading && !err && doctorView && (
              <div style={{ marginTop: 10 }}>
                <QuickViewCard quickView={doctorView.quick_view} />
                <ThresholdsTable rows={thresholds} />

                {!hasKeySections && (
                  <div
                    style={{
                      marginTop: 16,
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "var(--surface-2)",
                      fontWeight: 700,
                      color: "var(--muted)",
                    }}
                  >
                    No structured evidence found for this topic. Try expanding evidence.
                  </div>
                )}

                {filteredSections.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    {filteredSections.map((section) => (
                      <SectionAccordion key={section.id} section={section} />
                    ))}
                  </div>
                )}

                {!hasPearlSection && doctorView.pearls && doctorView.pearls.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>Clinical pearls & pitfalls</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {doctorView.pearls.map((p, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {doctorView.takeaway && doctorView.takeaway.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>Key takeaway</div>
                    {doctorView.takeaway.map((t, i) => (
                      <p key={i} style={{ margin: "6px 0" }}>{t}</p>
                    ))}
                  </div>
                )}

                <EvidenceDrawer items={data?.evidence?.items ?? []} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
