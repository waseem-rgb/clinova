export type EvidenceItem = {
  book: string;
  collection: string;
  page?: number | null;
  chapter?: string | null;
  section?: string | null;
  snippet: string;
  chunk_id?: string | null;
  score?: number | null;
  meta: Record<string, any>;
};

export type SectionOut = {
  title: string;
  content_md: string;
  evidence: EvidenceItem[];
};

export type DoctorMonographResponse = {
  feature: string;
  query: string;
  collection: string;
  doctor_view_md: string;
  sections: SectionOut[];
  evidence: EvidenceItem[];
  debug?: Record<string, any> | null;
};
