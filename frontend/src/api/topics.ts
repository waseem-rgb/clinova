// Compatibility shim for older imports expecting "./topics"
export type CollectionKey = "medicine" | "obgyn" | "surgery" | "pediatrics" | string;

export type SuggestItem = {
  id?: string;
  title?: string;
  topic?: string;
  score?: number;
};

export type SuggestResponse = {
  items?: SuggestItem[];
  suggestions?: SuggestItem[];
  results?: SuggestItem[];
} | any;

export type NormalizedTopic = {
  title?: string;
  topic?: string;
  sections?: Array<{ title: string; content: string }>;
  outline?: Array<{ id: string; title: string }>;
  raw?: any;
} | any;

export * from "./topic";
