// frontend/src/App.tsx
import { useState, useEffect } from "react";
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
import DrugDoseCalculator from "./pages/DrugDoseCalculator";
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

function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  if (online) return null;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
      background: "#fbbf24", color: "#78350f", textAlign: "center",
      padding: "8px 16px", fontSize: 13, fontWeight: 600,
    }}>
      You are offline — showing cached content only
    </div>
  );
}

export default function App() {
  return (
    <>
      <OfflineBanner />
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
        <Route path="/dose-calculator" element={<SharedLayout><DrugDoseCalculator /></SharedLayout>} />
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
