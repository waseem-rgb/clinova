// frontend/src/App.tsx
import { Routes, Route, Navigate } from "react-router-dom";
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

// Shared layout with workspace drawer
import SharedLayout from "./components/SharedLayout";

export default function App() {
  return (
    <Routes>
      {/* Home - no drawer */}
      <Route path="/" element={<HomeSearch />} />

      {/* Topic view - no drawer */}
      <Route path="/topic/:collection" element={<TopicView />} />

      {/* Feature routes with workspace drawer */}
      <Route
        path="/lab"
        element={
          <SharedLayout>
            <LabInterpretation />
          </SharedLayout>
        }
      />
      <Route
        path="/ddx"
        element={
          <SharedLayout>
            <DifferentialDiagnosis />
          </SharedLayout>
        }
      />
      <Route
        path="/treatment"
        element={
          <SharedLayout>
            <TreatmentAdvisor />
          </SharedLayout>
        }
      />
      <Route
        path="/drug"
        element={
          <SharedLayout>
            <DrugDetails />
          </SharedLayout>
        }
      />
      <Route
        path="/interactions"
        element={
          <SharedLayout>
            <DrugInteractions />
          </SharedLayout>
        }
      />
      <Route
        path="/prescription"
        element={
          <SharedLayout>
            <PrescriptionStudio />
          </SharedLayout>
        }
      />
      <Route
        path="/image"
        element={
          <SharedLayout>
            <ImageInterpretation />
          </SharedLayout>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
