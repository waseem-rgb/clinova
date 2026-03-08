// frontend/src/App.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import DisclaimerBanner from "./components/DisclaimerBanner";
import BottomNav from "./components/BottomNav";
import HomeSearch from "./pages/HomeSearch";
import TopicView from "./pages/TopicView";

// Feature pages
import LabInterpretation from "./pages/LabInterpretation";
import DifferentialDiagnosis from "./pages/DifferentialDiagnosis";
import TreatmentAdvisor from "./pages/TreatmentAdvisor";
import DrugDetails from "./pages/DrugDetails";
import DrugInteractions from "./pages/DrugInteractions";
import PrescriptionStudio from "./pages/PrescriptionStudio";
import ImageInterpretation from "./pages/ImageInterpretation";

// Phase 3 modules
import EmergencyProtocols from "./pages/EmergencyProtocols";
import EmergencyProtocolDetail from "./pages/EmergencyProtocolDetail";
import Calculators from "./pages/Calculators";
import Learning from "./pages/Learning";
import TopicDetail from "./pages/TopicDetail";
import Topics from "./pages/Topics";

// Shared layout with workspace drawer
import SharedLayout from "./components/SharedLayout";

export default function App() {
  return (
    <>
      <Routes>
        {/* Home - no drawer */}
        <Route path="/" element={<HomeSearch />} />

        {/* Topic view - no drawer */}
        <Route path="/topic/:collection" element={<TopicView />} />

        {/* Topic library list - no drawer */}
        <Route path="/topics" element={<Topics />} />

        {/* Structured topic content - no drawer */}
        <Route path="/topics/:slug" element={<TopicDetail />} />

        {/* Emergency Protocols - no drawer (full-screen protocols) */}
        <Route path="/emergency" element={<EmergencyProtocols />} />
        <Route path="/emergency/:id" element={<EmergencyProtocolDetail />} />

        {/* Calculator Hub - no drawer */}
        <Route path="/calculators" element={<Calculators />} />

        {/* Learning & CME - no drawer */}
        <Route path="/learning" element={<Learning />} />

        {/* Feature routes with workspace drawer */}
        <Route path="/lab" element={<SharedLayout><LabInterpretation /></SharedLayout>} />
        <Route path="/ddx" element={<SharedLayout><DifferentialDiagnosis /></SharedLayout>} />
        <Route path="/treatment" element={<SharedLayout><TreatmentAdvisor /></SharedLayout>} />
        <Route path="/drug" element={<SharedLayout><DrugDetails /></SharedLayout>} />
        <Route path="/interactions" element={<SharedLayout><DrugInteractions /></SharedLayout>} />
        <Route path="/prescription" element={<SharedLayout><PrescriptionStudio /></SharedLayout>} />
        <Route path="/image" element={<SharedLayout><ImageInterpretation /></SharedLayout>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <DisclaimerBanner />
      <BottomNav />
    </>
  );
}
