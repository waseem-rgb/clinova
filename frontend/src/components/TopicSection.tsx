import React from "react";

type Props = {
  title: string;
  content: string;
};

/**
 * For now: render as readable text (pre-wrap).
 * Later we can add a markdown renderer; not needed to ship the MVP.
 */
export function TopicSection({ title, content }: Props) {
  return (
    <div className="topicSection">
      <div className="topicSectionTitle">{title}</div>
      <div className="topicSectionBody">{content}</div>
    </div>
  );
}
