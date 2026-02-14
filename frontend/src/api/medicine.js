import { suggestByCollection, getTopicByCollection } from "./topics";
export async function suggestMedicine(q, limit = 12, signal) {
    return suggestByCollection("medicine", q, limit, signal);
}
export async function getMedicineTopic(q, signal) {
    return getTopicByCollection("medicine", q, signal);
}
export { suggestByCollection, getTopicByCollection };
