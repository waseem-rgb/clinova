// frontend/src/types/topic.ts
// Clinova — Medical topic content schema

export interface ClinicalQnA {
  question: string;
  answer: string;
}

export interface EtiologyCategory {
  category: string;
  causes: string[];
}

export interface FeatureItem {
  feature: string;
  severity: "mild" | "moderate" | "severe" | "all";
  note?: string;
}

export interface SeverityLevel {
  level: "mild" | "moderate" | "severe";
  criteria: string;
  management: string;
}

export interface DiagnosticStep {
  step: number;
  action: string;
  rationale: string;
  atPHC: boolean;
}

export interface Investigation {
  name: string;
  purpose: string;
  interpretation: string;
  tier: "PHC" | "CHC" | "District" | "Referral";
  cost?: "free" | "low" | "moderate" | "high";
}

export interface DDxItem {
  diagnosis: string;
  distinguishingFeature: string;
}

export interface TreatmentDrug {
  name: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  notes?: string;
}

export interface TreatmentContext {
  facility: "PHC" | "CHC" | "District";
  approach: string;
  drugs: TreatmentDrug[];
}

export interface TreatmentOption {
  drug?: string;
  intervention?: string;
  dose?: string;
  duration?: string;
  evidence: "A" | "B" | "C" | "Expert";
  note?: string;
}

export interface SpecialPopulation {
  population: "Pregnancy" | "Pediatric" | "Elderly" | "Renal" | "Hepatic";
  modification: string;
  caution?: string;
}

export interface MonitoringPoint {
  parameter: string;
  frequency: string;
  target?: string;
  action: string;
}

export interface Reference {
  citation: string;
  url?: string;
  year: number;
}

export interface TopicContent {
  id: string;
  slug: string;
  title: string;
  icd10: string;
  specialty: string[];
  lastReviewed: string;
  evidenceLevel: "A" | "B" | "C" | "Expert";

  clinicalQuickView: {
    summary: string[];
    qna: ClinicalQnA[];
  };

  definition: {
    text: string;
    keyThreshold?: string;
  };

  etiology: {
    categories: EtiologyCategory[];
    riskFactors: string[];
    commonCauses: string[];
    rareCauses?: string[];
  };

  pathophysiology: {
    summary: string;
    keyMechanisms: string[];
    clinicalRelevance: string;
  };

  clinicalFeatures: {
    symptoms: FeatureItem[];
    signs: FeatureItem[];
    redFlags: string[];
    severity: SeverityLevel[];
  };

  diagnosticApproach: {
    stepByStep: DiagnosticStep[];
    keyInvestigations: Investigation[];
    diagnosticAlgorithm?: string;
    differentialDiagnosis: DDxItem[];
  };

  treatment: {
    principles: string[];
    byContext: TreatmentContext[];
    firstLine: TreatmentOption[];
    secondLine: TreatmentOption[];
    specialPopulations: SpecialPopulation[];
    monitoring: MonitoringPoint[];
    whenToRefer: string[];
    pitfalls: string[];
  };

  clinicalPearlsAndPitfalls: {
    pearls: string[];
    pitfalls: string[];
  };

  keyTakeaway: string[];

  references?: Reference[];
}

// ── Topic index entry (lightweight) ──────────────────────────────────────────

export interface TopicIndexEntry {
  slug: string;
  title: string;
  icd10: string;
  specialty: string[];
  tags: string[];
}

export interface TopicIndex {
  topics: TopicIndexEntry[];
}
