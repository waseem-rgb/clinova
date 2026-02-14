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
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeSearch />} />
        <Route path="/topic/:collection" element={<TopicView />} />
        <Route path="/lab" element={<LabInterpretation />} />
        <Route path="/ddx" element={<DifferentialDiagnosis />} />
        <Route path="/treatment" element={<TreatmentAdvisor />} />
        <Route path="/drug" element={<DrugDetails />} />
        <Route path="/interactions" element={<DrugInteractions />} />
        <Route path="/prescription" element={<PrescriptionStudio />} />
        <Route path="/image" element={<ImageInterpretation />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
