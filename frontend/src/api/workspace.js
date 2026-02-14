// frontend/src/api/workspace.ts
/**
 * API client for Clinical Workspace endpoints.
 */
import { API_BASE } from "../services/api";
// =============================================================================
// CLIENT ID MANAGEMENT
// =============================================================================
const CLIENT_ID_KEY = "medcompanion_client_id";
function generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
export function getClientId() {
    let clientId = localStorage.getItem(CLIENT_ID_KEY);
    if (!clientId) {
        clientId = generateClientId();
        localStorage.setItem(CLIENT_ID_KEY, clientId);
    }
    return clientId;
}
function getHeaders() {
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
export async function createNewCase() {
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
export async function getCase(caseId) {
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
export async function getLastCase() {
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
export async function patchCase(caseId, patch) {
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
export async function handoff(caseId, request) {
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
export async function deleteCase(caseId) {
    const res = await fetch(`${API_BASE}/workspace/${caseId}`, {
        method: "DELETE",
        headers: getHeaders(),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to delete workspace case: ${res.status} ${text}`);
    }
}
