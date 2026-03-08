// frontend/src/components/LatestArticlesPanel.tsx
// Clinova — Latest peer-reviewed articles panel (SerpAPI Google Scholar)
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Article, ArticleSearchResponse } from "../api/articles";
import { searchArticles } from "../api/articles";

// ─── Shimmer skeleton ────────────────────────────────────────────────────────

function ArticleSkeleton() {
  return (
    <div style={{
      padding: "14px 0",
      borderBottom: "1px solid #E8ECF0",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      {[100, 70, 85].map((w, i) => (
        <div
          key={i}
          style={{
            height: i === 0 ? 14 : 11,
            width: `${w}%`,
            borderRadius: 6,
            background: "linear-gradient(90deg, #E8ECF0 25%, #F0F1F2 50%, #E8ECF0 75%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.4s infinite",
          }}
        />
      ))}
    </div>
  );
}

// ─── Single article card ─────────────────────────────────────────────────────

function ArticleCard({ article }: { article: Article }) {
  const [hovered, setHovered] = useState(false);

  const authorList =
    article.authors.length > 0
      ? article.authors.slice(0, 3).map((a) => a.name).join(", ") +
        (article.authors.length > 3 ? " et al." : "")
      : null;

  const yearMatch = article.summary.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : null;
  const journal = article.summary.replace(/·?\s*20\d{2}\s*·?/, "").trim().replace(/^·\s*|·\s*$/, "").trim();

  return (
    <a
      href={article.link || "#"}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "block",
        padding: "14px 0",
        borderBottom: "1px solid #E8ECF0",
        textDecoration: "none",
        transition: "all 0.12s ease",
      }}
    >
      {/* Title + arrow */}
      <div style={{
        fontWeight: 600,
        fontSize: 13,
        color: hovered ? "#0A6E5E" : "#1A2B3C",
        lineHeight: 1.45,
        marginBottom: 5,
        transition: "color 0.12s ease",
      }}>
        {article.title}
        <span style={{
          display: "inline-block",
          marginLeft: 4,
          fontSize: 11,
          opacity: 0.6,
          verticalAlign: "middle",
        }}>
          ↗
        </span>
      </div>

      {/* Snippet */}
      {article.snippet && (
        <div style={{
          fontSize: 12,
          color: "#57606A",
          lineHeight: 1.5,
          marginBottom: 6,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as React.CSSProperties["WebkitBoxOrient"],
          overflow: "hidden",
        }}>
          {article.snippet}
        </div>
      )}

      {/* Meta row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {year && (
          <span style={{
            fontSize: 10, fontWeight: 700,
            padding: "2px 7px", borderRadius: 3,
            background: "rgba(10,110,94,0.08)",
            border: "1px solid rgba(10,110,94,0.2)",
            color: "#0A6E5E",
          }}>
            {year}
          </span>
        )}
        {journal && (
          <span style={{
            fontSize: 11, color: "#8B949E",
            maxWidth: 150, whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {journal}
          </span>
        )}
        {authorList && (
          <span style={{
            fontSize: 11, color: "#8B949E",
            maxWidth: 140, whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {authorList}
          </span>
        )}
        {article.cited_by != null && (
          <span style={{
            marginLeft: "auto",
            fontSize: 10, color: "#8B949E",
            whiteSpace: "nowrap",
          }}>
            Cited by {article.cited_by.toLocaleString()}
          </span>
        )}
      </div>
    </a>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

interface LatestArticlesPanelProps {
  topic: string;
}

export default function LatestArticlesPanel({ topic }: LatestArticlesPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ArticleSearchResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await searchArticles(q, 6, ac.signal);
      setResult(data);
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setError(e?.message ?? "Failed to load articles.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (topic.trim()) load(topic);
    return () => abortRef.current?.abort();
  }, [topic, load]);

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <div style={{
        background: "#F6F8FA",
        borderRadius: 12,
        border: "1px solid #D0D7DE",
        padding: "18px 16px",
        margin: "18px 14px",
        position: "sticky",
        top: 18,
      }}>
        {/* Panel header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
          paddingBottom: 12,
          borderBottom: "1px solid #E8ECF0",
        }}>
          <div>
            <div style={{
              fontWeight: 700, fontSize: 14,
              color: "#1A2B3C",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              📰 Latest Articles
            </div>
            <div style={{ fontSize: 11, color: "#8B949E", marginTop: 3 }}>
              Google Scholar · sorted by date
            </div>
          </div>

          {!loading && result?.configured && (
            <a
              href={`https://scholar.google.com/scholar?q=${encodeURIComponent(topic + " clinical management")}&as_ylo=2020&scisbd=1`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 11, fontWeight: 600,
                color: "#0A6E5E",
                textDecoration: "none",
                padding: "4px 10px",
                border: "1px solid rgba(10,110,94,0.2)",
                borderRadius: 6,
                background: "rgba(10,110,94,0.06)",
                whiteSpace: "nowrap",
              }}
            >
              View all ↗
            </a>
          )}
        </div>

        {/* Loading skeletons */}
        {loading && (
          <div>
            {[1, 2, 3, 4].map((i) => (
              <ArticleSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div style={{ padding: "14px 0", textAlign: "center", color: "#CF222E", fontSize: 13 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontWeight: 600, marginBottom: 8, color: "#1A2B3C" }}>{error}</div>
            <button
              onClick={() => load(topic)}
              style={{
                padding: "6px 16px", borderRadius: 6,
                border: "1px solid #D0D7DE",
                background: "#FFFFFF",
                color: "#57606A",
                cursor: "pointer", fontSize: 12, fontWeight: 600,
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* API key not configured */}
        {!loading && !error && result && !result.configured && (
          <div style={{
            padding: "18px 14px", borderRadius: 10,
            background: "#FFFFFF",
            border: "1px dashed #D0D7DE",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🔑</div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#1A2B3C", marginBottom: 6 }}>
              SerpAPI key not configured
            </div>
            <div style={{ fontSize: 12, color: "#57606A", lineHeight: 1.5 }}>
              Add{" "}
              <code style={{ background: "rgba(0,0,0,0.04)", padding: "1px 5px", borderRadius: 3, color: "#1A2B3C" }}>
                SERP_API_KEY
              </code>{" "}
              to{" "}
              <code style={{ background: "rgba(0,0,0,0.04)", padding: "1px 5px", borderRadius: 3, color: "#1A2B3C" }}>
                backend/.env
              </code>{" "}
              to enable live article search.
            </div>
          </div>
        )}

        {/* Articles list */}
        {!loading && !error && result?.configured && (
          <>
            {result.articles.length === 0 ? (
              <div style={{ padding: "24px 0", textAlign: "center", color: "#8B949E", fontSize: 13 }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
                No recent articles found for this topic.
              </div>
            ) : (
              <div>
                {result.articles.map((article, idx) => (
                  <ArticleCard key={article.result_id || idx} article={article} />
                ))}
              </div>
            )}

            <div style={{
              marginTop: 12, paddingTop: 10,
              borderTop: "1px solid #E8ECF0",
              fontSize: 10, color: "#8B949E", textAlign: "center",
            }}>
              Results via Google Scholar · For research use only
            </div>
          </>
        )}
      </div>
    </>
  );
}
