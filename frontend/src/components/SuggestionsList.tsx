// frontend/src/components/SuggestionList.tsx
export type SuggestionItem = {
  title: string;
  chunk_count: number;
  page_count: number;
  pages: number[];
};

type Props = {
  items: SuggestionItem[];
  onPick: (title: string) => void;
  loading?: boolean;
  error?: string | null;
};

export default function SuggestionList({ items, onPick, loading, error }: Props) {
  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-white/70 text-sm mb-3 uppercase tracking-wide">Topics</div>

      {loading && <div className="text-white/70">Loading suggestions…</div>}
      {error && !loading && <div className="text-red-200">{error}</div>}

      {!loading && !error && items.length === 0 && (
        <div className="text-white/60">Start typing to see Harrison index topics…</div>
      )}

      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <button
            key={it.title}
            onClick={() => onPick(it.title)}
            className="text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-3"
          >
            <div className="text-white font-medium">{it.title}</div>
            <div className="text-white/60 text-sm mt-1">
              {it.chunk_count} chunks • {it.page_count} index pages
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
