// frontend/src/components/SearchBox.tsx
import { useEffect, useMemo, useState } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  placeholder?: string;
};

export default function SearchBox({ value, onChange, onSearch, placeholder }: Props) {
  const [local, setLocal] = useState(value);

  useEffect(() => setLocal(value), [value]);

  const canSearch = useMemo(() => local.trim().length >= 2, [local]);

  return (
    <div className="flex gap-3 items-center">
      <input
        className="w-full rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-lg text-white outline-none focus:ring-2 focus:ring-white/20"
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSearch) onSearch();
        }}
        placeholder={placeholder ?? "Search a topic (e.g., Epilepsy, Asthma, Stroke)"}
      />
      <button
        className="rounded-2xl px-6 py-4 bg-white/15 text-white hover:bg-white/20 disabled:opacity-40"
        onClick={() => canSearch && onSearch()}
        disabled={!canSearch}
      >
        Search
      </button>
    </div>
  );
}
