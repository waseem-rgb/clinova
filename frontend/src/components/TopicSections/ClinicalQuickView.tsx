// frontend/src/components/TopicSections/ClinicalQuickView.tsx
import React from "react";
import type { TopicContent } from "../../types/topic";

interface Props {
  data: TopicContent["clinicalQuickView"];
}

export default function ClinicalQuickView({ data }: Props) {
  return (
    <div>
      {/* Summary bullets */}
      <div style={{ marginBottom: 28 }}>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
          textTransform: "uppercase", color: "#8B949E", marginBottom: 12,
        }}>
          Key Points
        </div>
        <ol style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          {data.summary.map((point, i) => (
            <li key={i} style={{
              fontSize: 14,
              lineHeight: 1.65,
              color: "#1A2B3C",
              paddingLeft: 4,
            }}>
              {point}
            </li>
          ))}
        </ol>
      </div>

      {/* Q&A Table */}
      <div>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
          textTransform: "uppercase", color: "#8B949E", marginBottom: 10,
        }}>
          Clinical Q&amp;A
        </div>
        <div style={{
          border: "1px solid #D0D7DE",
          borderRadius: 8,
          overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{
                  background: "#F6F8FA",
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.07em",
                  textTransform: "uppercase", color: "#8B949E",
                  padding: "10px 14px", textAlign: "left",
                  borderBottom: "1px solid #D0D7DE",
                  borderRight: "1px solid #D0D7DE",
                  width: "40%",
                }}>
                  Clinical Question
                </th>
                <th style={{
                  background: "#F6F8FA",
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.07em",
                  textTransform: "uppercase", color: "#8B949E",
                  padding: "10px 14px", textAlign: "left",
                  borderBottom: "1px solid #D0D7DE",
                }}>
                  Practical Answer
                </th>
              </tr>
            </thead>
            <tbody>
              {data.qna.map((item, i) => (
                <tr
                  key={i}
                  style={{ transition: "background 0.1s ease" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#F9FAFB"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <td style={{
                    padding: "10px 14px",
                    borderBottom: i < data.qna.length - 1 ? "1px solid #F0F1F2" : "none",
                    borderRight: "1px solid #D0D7DE",
                    verticalAlign: "top",
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: "#57606A",
                    fontWeight: 500,
                    width: "40%",
                  }}>
                    {item.question}
                  </td>
                  <td style={{
                    padding: "10px 14px",
                    borderBottom: i < data.qna.length - 1 ? "1px solid #F0F1F2" : "none",
                    verticalAlign: "top",
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: "#1A2B3C",
                  }}>
                    {item.answer}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
