// frontend/src/api/workspace.ts
/**
 * API client for Clinical Workspace endpoints.
 */

import { API_BASE } from "../services/api";

// =============================================================================
// TYPES
// =============================================================================

export interface WorkspaceContext {
  age?: number | null;
  sex?: string | null;
  pregnancy?: string | null;
  symptoms?: string | null;
  duration?: string | null;
  severity?: string | null;
  setting?: string | null;
  comorbidities: string[];
  allergies: string[];
  current_meds: string[];
  renal_status?: string | null;
  hepatic_status?: string | null;
  active_condition?: string | null;
  selected_ddx: string[];
  selected_drugs: string[];
  lab_abnormalities: string[];
}

export interface WorkspaceOutputs {
  ddx_result?: any;
  treatment_result?: any;
  drug_detail_cache: Record<string, any>;
  interaction_result?: any;
  lab_result?: any;
}

export interface WorkspaceCase {
  case_id: string;
  client_id?: string | null;
  created_at: string;
  updated_at: string;
  context: WorkspaceContext;
  outputs: WorkspaceOutputs;
  last_action?: string | null;
}

export interface WorkspaceCreateResponse {
  case_id: string;
  created_at: string;
  context: WorkspaceContext;
  outputs: WorkspaceOutputs;
}

export interface WorkspacePatchRequest {
  context?: Partial<WorkspaceContext>;
  outputs?: Partial<WorkspaceOutputs>;
}

export interface WorkspaceHandoffRequest {
  action: string;
  active_condition?: string;
  selected_ddx?: string[];
  selected_drugs?: string[];
  target_feature: string;
}

// =============================================================================
// CLIENT ID MANAGEMENT
// =============================================================================

const CLIENT_ID_KEY = "medcompanion_client_id";

function generateClientId(): string {
  return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function getClientId(): string {
  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = generateClientId();
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

function getHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Client-Id": getClientId(),
  };
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Create a new workspace case.
 */
export async function createNewCase(): Promise<WorkspaceCreateResponse> {
  const res = await fetch(`${API_BASE}/workspace/new`, {
    method: "POST",
    headers: getHeaders(),
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to create workspace case: ${res.status} ${text}`);
  }
  
  return await res.json();
}

/**
 * Get a workspace case by ID.
 */
export async function getCase(caseId: string): Promise<WorkspaceCase> {
  const res = await fetch(`${API_BASE}/workspace/${caseId}`, {
    method: "GET",
    headers: getHeaders(),
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to get workspace case: ${res.status} ${text}`);
  }
  
  return await res.json();
}

/**
 * Get the most recent case for this client.
 */
export async function getLastCase(): Promise<WorkspaceCase | null> {
  const res = await fetch(`${API_BASE}/workspace/last`, {
    method: "GET",
    headers: getHeaders(),
  });
  
  if (res.status === 404) {
    return null;
  }
  
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to get last workspace case: ${res.status} ${text}`);
  }
  
  return await res.json();
}

/**
 * Partially update a workspace case.
 */
export async function patchCase(
  caseId: string,
  patch: WorkspacePatchRequest
): Promise<WorkspaceCase> {
  const res = await fetch(`${API_BASE}/workspace/${caseId}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(patch),
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to update workspace case: ${res.status} ${text}`);
  }
  
  return await res.json();
}

/**
 * Record a handoff action.
 */
export async function handoff(
  caseId: string,
  request: WorkspaceHandoffRequest
): Promise<WorkspaceCase> {
  const res = await fetch(`${API_BASE}/workspace/${caseId}/handoff`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(request),
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to record handoff: ${res.status} ${text}`);
  }
  
  return await res.json();
}

/**
 * Delete a workspace case.
 */
export async function deleteCase(caseId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/workspace/${caseId}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to delete workspace case: ${res.status} ${text}`);
  }
}
