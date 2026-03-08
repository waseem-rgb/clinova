// frontend/src/components/TopicCard.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark } from "lucide-react";

export interface TopicCardProps {
  slug: string;
  title: string;
  icd10?: string;
  specialty?: string[];
  tags?: string[];
  isBookmarked?: boolean;
  onBookmarkToggle?: (slug: string) => void;
  compact?: boolean; // for recently-viewed horizontal row
}

export default function TopicCard({
  slug, title, icd10, specialty, tags,
  isBookmarked, onBookmarkToggle, compact,
}: TopicCardProps) {
  const navigate = useNavigate();

  if (compact) {
    return (
      <div
        onClick={() => navigate(`/topics/${slug}`)}
        style={{
          flexShrink: 0,
          width: 200,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "10px 12px",
          cursor: "pointer",
          transition: "border-color 0.12s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--brand-border)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
      >
        {icd10 && (
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
            color: "var(--brand)", marginBottom: 5,
          }}>
            {icd10}
          </div>
        )}
        <div style={{
          fontWeight: 600, fontSize: 12.5, color: "var(--text-primary)",
          lineHeight: 1.35, marginBottom: 4,
        }}>
          {title}
        </div>
        {specialty?.[0] && (
          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {specialty[0]}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={() => navigate(`/topics/${slug}`)}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "16px",
        cursor: "pointer",
        transition: "border-color 0.15s, box-shadow 0.15s",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--brand-border)";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(10,110,94,0.07)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* ICD-10 + bookmark */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {icd10 ? (
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
            color: "var(--brand)", border: "1px solid var(--brand-border)",
            borderRadius: 3, padding: "2px 6px",
          }}>
            {icd10}
          </span>
        ) : <span />}

        {onBookmarkToggle && (
          <button
            onClick={(e) => { e.stopPropagation(); onBookmarkToggle(slug); }}
            title={isBookmarked ? "Remove bookmark" : "Bookmark"}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 2,
              color: isBookmarked ? "var(--brand)" : "var(--text-muted)",
              transition: "color 0.1s",
            }}
          >
            <Bookmark size={14} fill={isBookmarked ? "currentColor" : "none"} />
          </button>
        )}
      </div>

      {/* Title */}
      <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)", lineHeight: 1.4 }}>
        {title}
      </div>

      {/* Specialty chips */}
      {specialty && specialty.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {specialty.slice(0, 2).map((s, i) => (
            <span key={i} style={{
              fontSize: 10, padding: "2px 7px", fontWeight: 500,
              background: "var(--bg-raised)", border: "1px solid var(--border)",
              borderRadius: 4, color: "var(--text-muted)",
            }}>
              {s}
            </span>
          ))}
          {specialty.length > 2 && (
            <span style={{ fontSize: 10, color: "var(--text-subtle)" }}>
              +{specialty.length - 2}
            </span>
          )}
        </div>
      )}

      {/* Hashtag tags */}
      {tags && tags.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {tags.slice(0, 5).map((tag, i) => (
            <span key={i} style={{
              fontSize: 10, color: "var(--text-subtle)",
              fontFamily: "var(--font-mono)",
            }}>
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: "auto", paddingTop: 4,
        fontSize: 12, color: "var(--brand)", fontWeight: 500, textAlign: "right",
      }}>
        View →
      </div>
    </div>
  );
}
