// frontend/src/api/medicine.ts
import type { CollectionKey, NormalizedTopic, SuggestResponse } from "./topics";
import { suggestByCollection, getTopicByCollection } from "./topics";

export type TopicResponse = NormalizedTopic;

export async function suggestMedicine(q: string, limit = 12, signal?: AbortSignal) {
  return suggestByCollection("medicine", q, limit, signal);
}

export async function getMedicineTopic(q: string, signal?: AbortSignal) {
  return getTopicByCollection("medicine", q, signal);
}

// Optional re-exports (handy)
export type { CollectionKey, SuggestResponse };
export { suggestByCollection, getTopicByCollection };
