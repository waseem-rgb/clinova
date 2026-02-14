import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// frontend/src/app/router.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import HomeSearch from "../pages/HomeSearch";
import TopicView from "../pages/TopicView";
import LabInterpretation from "../pages/LabInterpretation";
import DifferentialDiagnosis from "../pages/DifferentialDiagnosis";
import TreatmentAdvisor from "../pages/TreatmentAdvisor";
import DrugDetails from "../pages/DrugDetails";
import DrugInteractions from "../pages/DrugInteractions";
import PrescriptionStudio from "../pages/PrescriptionStudio";
import ImageInterpretation from "../pages/ImageInterpretation";
export default function Router() {
    return (_jsx(BrowserRouter, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(HomeSearch, {}) }), _jsx(Route, { path: "/topic/:collection", element: _jsx(TopicView, {}) }), _jsx(Route, { path: "/lab", element: _jsx(LabInterpretation, {}) }), _jsx(Route, { path: "/ddx", element: _jsx(DifferentialDiagnosis, {}) }), _jsx(Route, { path: "/treatment", element: _jsx(TreatmentAdvisor, {}) }), _jsx(Route, { path: "/drug", element: _jsx(DrugDetails, {}) }), _jsx(Route, { path: "/interactions", element: _jsx(DrugInteractions, {}) }), _jsx(Route, { path: "/prescription", element: _jsx(PrescriptionStudio, {}) }), _jsx(Route, { path: "/image", element: _jsx(ImageInterpretation, {}) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }) }));
}
