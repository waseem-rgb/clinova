import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * For now: render as readable text (pre-wrap).
 * Later we can add a markdown renderer; not needed to ship the MVP.
 */
export function TopicSection({ title, content }) {
    return (_jsxs("div", { className: "topicSection", children: [_jsx("div", { className: "topicSectionTitle", children: title }), _jsx("div", { className: "topicSectionBody", children: content })] }));
}
