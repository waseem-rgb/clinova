// frontend/src/api/topic.ts
import { apiGet } from "./client";

export type CollectionKey = "medicine" | "obgyn" | "pediatrics" | "surgery";

export const COLLECTIONS: Array<{ key: CollectionKey; label: string }> = [
  { key: "medicine", label: "Medicine" },
  { key: "obgyn", label: "OBGYN" },
  { key: "pediatrics", label: "Pediatrics" },
  { key: "surgery", label: "Surgery" },
];

type SuggestResponse = { suggestions: string[] } | string[];

export type TopicEvidenceItem = {
  id: string;
  text: string;
  meta: {
    source?: string;
    chapter?: string;
    page_start?: number;
    page_end?: number;
  };
};

export type TopicDoctorView = {
  quick_view: {
    bullets: string[];
    table?: Array<{ q: string; a: string }>;
  };
  thresholds?: Array<{ finding: string; meaning: string; next_step: string }>;
  sections: Array<{
    id: string;
    title: string;
    content: string[];
    subsections?: Array<{ title: string; content: string[] }>;
    tables?: Array<{ title?: string; columns: string[]; rows: string[][] }>;
  }>;
  pearls?: string[];
  takeaway?: string[];
};

export type TopicResponse = {
  topic: string;
  doctor_view: TopicDoctorView;
  evidence: { items: TopicEvidenceItem[]; hidden_by_default: boolean };
  timings: {
    cache_hit: { topic: boolean; evidence: boolean; transform: boolean };
    retrieval_ms: number;
    dedup_ms: number;
    llm_ms: number;
    total_ms: number;
  };
};

/** Clean index-like strings to doctor-friendly topic titles */
export function cleanTopicTitle(input: string): string {
  let s = String(input || "").trim();

  // Remove page markers like "3412t", "2786f", "2541t"
  s = s.replace(/\b\d{1,4}\s*[tTfF]\b/g, "").trim();

  // Remove double commas/spaces caused by removal
  s = s.replace(/\s*,\s*,+/g, ", ");
  s = s.replace(/,\s*$/g, "");

  // Fix patterns like "epidemiology of, Schnitzler's syndrome" -> "epidemiology of Schnitzler's syndrome"
  s = s.replace(/\bof,\s+/gi, "of ");
  s = s.replace(/\bfor,\s+/gi, "for ");
  s = s.replace(/\bin,\s+/gi, "in ");

  // If looks like "topic), something" -> keep topic
  s = s.replace(/\)\s*,\s*.+$/g, ")");

  // If looks like "topic, diagnosis of ..." keep only first phrase
  const parts = s
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const tail = parts.slice(1).join(" ").toLowerCase();
    const looksLikeIndexTail =
      /(diagnosis|classification|treatment|management|approach|evaluation|epidemiology|prevention|therapy|surgery|complications|pregnancy|travelers|stockpile|synovectomy)/i.test(
        tail
      );
    if (looksLikeIndexTail) s = parts[0];
  }

  s = s.replace(/\s{2,}/g, " ").trim();
  // Drop dangling stopwords (e.g., "hypercalcemia in")
  const stopwords = new Set(["in", "of", "for", "and", "or", "with", "without", "to", "from", "by", "on", "at"]);
  let tailParts = s.split(" ");
  while (tailParts.length && stopwords.has(tailParts[tailParts.length - 1].toLowerCase())) {
    tailParts = tailParts.slice(0, -1);
  }
  s = tailParts.join(" ").trim();
  s = s.replace(/[\s\-\–\(\)\[\]/]+$/g, "").trim();
  return s;
}

/**
 * Safely call apiGet() regardless of whether your apiGet signature is:
 *   apiGet<T>(path, signal?)
 * OR
 *   apiGet<T>(path, { signal }?)
 */
async function apiGetSafe<T>(path: string, signal?: AbortSignal): Promise<T> {
  const fn: any = apiGet as any;

  try {
    // Try (path, {signal}) first
    return await fn(path, signal ? { signal } : undefined);
  } catch {
    // Fallback to (path, signal)
    return await fn(path, signal);
  }
}

export async function suggestByCollection(
  collection: CollectionKey,
  q: string,
  limit = 20,
  signal?: AbortSignal
): Promise<string[]> {
  const qs = new URLSearchParams();
  qs.set("q", q);
  qs.set("limit", String(limit));

  // Path WITHOUT /api/ prefix - http.ts adds /api base
  const data = await apiGetSafe<SuggestResponse>(`/suggest/${collection}?${qs.toString()}`, signal);

  let list: string[] = [];
  if (Array.isArray(data)) list = data.map(String);
  else if (data && typeof data === "object" && Array.isArray((data as any).suggestions)) {
    list = (data as any).suggestions.map(String);
  }

  // Clean + de-duplicate + remove empty
  const cleaned = list
    .map(cleanTopicTitle)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const item of cleaned) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

export async function getTopicByCollection(
  collection: CollectionKey,
  q: string,
  signal?: AbortSignal
): Promise<TopicResponse> {
  const qs = new URLSearchParams();
  qs.set("q", q);

  // Path WITHOUT /api/ prefix - http.ts adds /api base
  return await apiGetSafe<TopicResponse>(`/topic/${collection}?${qs.toString()}`, signal);
}
