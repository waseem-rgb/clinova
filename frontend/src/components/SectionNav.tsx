import React from "react";

type Props = {
  titles: string[];
  active: string | null;
  onSelect: (title: string) => void;
};

export function SectionNav({ titles, active, onSelect }: Props) {
  return (
    <div className="sectionNav">
      <div className="sectionNavHeader">SECTIONS</div>
      <div className="sectionNavList">
        {titles.map((t) => (
          <button
            key={t}
            className={`sectionNavItem ${active === t ? "active" : ""}`}
            onClick={() => onSelect(t)}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
