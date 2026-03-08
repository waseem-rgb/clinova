// frontend/src/api/emergency.ts
// Emergency Protocols API client — Clinova

export interface EmergencyTimer {
  id: string;
  label: string;
  description: string;
  minutes: number;
  critical: boolean;
}

export interface DoseCalc {
  drug: string;
  mg_per_kg?: number;
  mL_per_kg?: number;
  max_mg?: number;
  max_mL?: number;
  fixed_dose_mg?: number;
  route: string;
  concentration_mg_per_mL?: number;
  note?: string;
}

export interface ProtocolStep {
  id: number;
  phase: "immediate" | "assessment" | "treatment" | "monitoring" | "referral";
  text: string;
  critical: boolean;
  details: string;
  timer_id?: string;
  dose_calc?: DoseCalc;
}

export interface ProtocolMedication {
  name: string;
  dose: string;
  route: string;
  note?: string;
}

export interface EmergencyProtocol {
  id: string;
  name: string;
  icon: string;
  category: "CRITICAL" | "URGENT";
  color: string;
  summary: string;
  tags: string[];
  timers: EmergencyTimer[];
  steps: ProtocolStep[];
  medications: ProtocolMedication[];
  red_flags: string[];
  pre_referral: string[];
  referral_indications: string[];
}

export interface EmergencyProtocolSummary {
  id: string;
  name: string;
  icon: string;
  category: "CRITICAL" | "URGENT";
  color: string;
  summary: string;
  tags: string[];
  step_count: number;
  medication_count: number;
}

export interface ProtocolListResponse {
  protocols: EmergencyProtocolSummary[];
  total: number;
}

const BASE = "/api/emergency";

export async function fetchProtocols(signal?: AbortSignal): Promise<ProtocolListResponse> {
  const res = await fetch(`${BASE}/protocols`, { signal });
  if (!res.ok) throw new Error(`Failed to load protocols: ${res.status}`);
  return res.json();
}

export async function fetchProtocol(id: string, signal?: AbortSignal): Promise<EmergencyProtocol> {
  const res = await fetch(`${BASE}/protocols/${encodeURIComponent(id)}`, { signal });
  if (!res.ok) throw new Error(`Protocol not found: ${id}`);
  return res.json();
}

export async function searchProtocols(q: string, signal?: AbortSignal): Promise<ProtocolListResponse> {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}
