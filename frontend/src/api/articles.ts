// frontend/src/api/articles.ts
// Clinova — Latest Articles API client (SerpAPI Google Scholar proxy)

export interface ArticleAuthor {
  name: string;
  link?: string;
}

export interface Article {
  title: string;
  link: string;
  snippet: string;
  authors: ArticleAuthor[];
  /** e.g. "Journal of Medicine · 2023" */
  summary: string;
  cited_by: number | null;
  result_id: string;
}

export interface ArticleSearchResponse {
  configured: boolean;
  articles: Article[];
  query: string;
  total?: number;
}

export async function searchArticles(
  topic: string,
  num = 6,
  signal?: AbortSignal,
): Promise<ArticleSearchResponse> {
  const params = new URLSearchParams({ q: topic, num: String(num) });
  const res = await fetch(`/api/articles/search?${params}`, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Articles fetch failed: ${res.status}`);
  }
  return res.json();
}
