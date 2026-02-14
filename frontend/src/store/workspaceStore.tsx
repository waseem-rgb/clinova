// frontend/src/store/workspaceStore.tsx
/**
 * DOCTOR-GRADE Workspace Store using React Context.
 *
 * Manages clinical case state across all feature pages.
 *
 * Key features:
 * - Auto-resume: Automatically resumes last case on app load
 * - Optimistic reset: "New Case" clears UI immediately (no loading delay)
 * - Background sync: API calls happen in background without blocking UI
 * - Graceful fallback: If server unavailable, continues working locally
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
} from "react";
import type { ReactNode } from "react";
import {
  createNewCase,
  getCase,
  getLastCase,
  patchCase,
  handoff as apiHandoff,
  getClientId,
} from "../api/workspace";
import type {
  WorkspaceCase,
  WorkspaceContext,
  WorkspaceOutputs,
  WorkspaceHandoffRequest,
} from "../api/workspace";

// =============================================================================
// STATE TYPES
// =============================================================================

interface WorkspaceState {
  clientId: string;
  caseId: string | null;
  context: WorkspaceContext;
  outputs: WorkspaceOutputs;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  lastSyncedAt: number | null;
}

type WorkspaceAction =
  | { type: "INIT_START" }
  | { type: "INIT_SUCCESS"; payload: WorkspaceCase }
  | { type: "INIT_NEW"; payload: WorkspaceCase }
  | { type: "INIT_ERROR"; payload: string }
  | { type: "UPDATE_CONTEXT"; payload: Partial<WorkspaceContext> }
  | { type: "UPDATE_OUTPUTS"; payload: Partial<WorkspaceOutputs> }
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCESS"; payload: WorkspaceCase }
  | { type: "SAVE_ERROR"; payload: string }
  | { type: "RESET_CASE"; payload: WorkspaceCase }
  | { type: "RESET_OPTIMISTIC" }  // Optimistic reset - clear UI immediately
  | { type: "RESET_CONFIRM"; payload: { case_id: string } }  // Confirm with actual case_id
  | { type: "CLEAR_ERROR" };

// =============================================================================
// INITIAL STATE
// =============================================================================

const EMPTY_CONTEXT: WorkspaceContext = {
  age: null,
  sex: null,
  pregnancy: null,
  symptoms: null,
  duration: null,
  severity: null,
  setting: null,
  comorbidities: [],
  allergies: [],
  current_meds: [],
  renal_status: null,
  hepatic_status: null,
  active_condition: null,
  selected_ddx: [],
  selected_drugs: [],
  lab_abnormalities: [],
};

const EMPTY_OUTPUTS: WorkspaceOutputs = {
  ddx_result: null,
  treatment_result: null,
  drug_detail_cache: {},
  interaction_result: null,
  lab_result: null,
};

const initialState: WorkspaceState = {
  clientId: "",
  caseId: null,
  context: EMPTY_CONTEXT,
  outputs: EMPTY_OUTPUTS,
  isLoading: true,
  isSaving: false,
  error: null,
  lastSyncedAt: null,
};

// =============================================================================
// REDUCER
// =============================================================================

function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction
): WorkspaceState {
  switch (action.type) {
    case "INIT_START":
      return { ...state, isLoading: true, error: null };

    case "INIT_SUCCESS":
    case "INIT_NEW":
      return {
        ...state,
        isLoading: false,
        caseId: action.payload.case_id,
        context: action.payload.context,
        outputs: action.payload.outputs,
        lastSyncedAt: Date.now(),
        error: null,
      };

    case "INIT_ERROR":
      return {
        ...state,
        isLoading: false,
        error: action.payload,
      };

    case "UPDATE_CONTEXT":
      return {
        ...state,
        context: { ...state.context, ...action.payload },
      };

    case "UPDATE_OUTPUTS":
      return {
        ...state,
        outputs: {
          ...state.outputs,
          ...action.payload,
          drug_detail_cache: {
            ...state.outputs.drug_detail_cache,
            ...(action.payload.drug_detail_cache || {}),
          },
        },
      };

    case "SAVE_START":
      return { ...state, isSaving: true };

    case "SAVE_SUCCESS":
      return {
        ...state,
        isSaving: false,
        context: action.payload.context,
        outputs: action.payload.outputs,
        lastSyncedAt: Date.now(),
        error: null,
      };

    case "SAVE_ERROR":
      return {
        ...state,
        isSaving: false,
        error: action.payload,
      };

    case "RESET_CASE":
      return {
        ...state,
        caseId: action.payload.case_id,
        context: action.payload.context,
        outputs: action.payload.outputs,
        lastSyncedAt: Date.now(),
        isLoading: false,
        error: null,
      };

    // OPTIMISTIC RESET: Immediately clear UI without waiting for API
    case "RESET_OPTIMISTIC":
      return {
        ...state,
        caseId: null,  // Will be set when API returns
        context: EMPTY_CONTEXT,
        outputs: EMPTY_OUTPUTS,
        isLoading: false,  // UI is ready immediately
        isSaving: true,    // Background API call in progress
        error: null,
        lastSyncedAt: null,
      };

    // CONFIRM RESET: API returned, set the actual case_id
    case "RESET_CONFIRM":
      return {
        ...state,
        caseId: action.payload.case_id,
        isSaving: false,
        lastSyncedAt: Date.now(),
      };

    case "CLEAR_ERROR":
      return { ...state, error: null };

    default:
      return state;
  }
}

// =============================================================================
// CONTEXT
// =============================================================================

interface WorkspaceContextValue extends WorkspaceState {
  // Actions
  updateContext: (updates: Partial<WorkspaceContext>) => void;
  updateOutputs: (updates: Partial<WorkspaceOutputs>) => void;
  saveCase: () => Promise<void>;
  newCase: () => Promise<void>;
  performHandoff: (request: WorkspaceHandoffRequest) => Promise<void>;
  clearError: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

// =============================================================================
// PROVIDER
// =============================================================================

interface WorkspaceProviderProps {
  children: ReactNode;
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const [state, dispatch] = useReducer(workspaceReducer, {
    ...initialState,
    clientId: getClientId(),
  });

  // Initialize: Try to resume last case or create new
  useEffect(() => {
    async function init() {
      dispatch({ type: "INIT_START" });
      
      try {
        // Try to get last case for this client
        const lastCase = await getLastCase();
        
        if (lastCase) {
          dispatch({ type: "INIT_SUCCESS", payload: lastCase });
        } else {
          // Create new case
          const newCaseData = await createNewCase();
          dispatch({
            type: "INIT_NEW",
            payload: {
              case_id: newCaseData.case_id,
              client_id: state.clientId,
              created_at: newCaseData.created_at,
              updated_at: newCaseData.created_at,
              context: newCaseData.context,
              outputs: newCaseData.outputs,
              last_action: null,
            },
          });
        }
      } catch (error: any) {
        dispatch({
          type: "INIT_ERROR",
          payload: error?.message || "Failed to initialize workspace",
        });
      }
    }

    init();
  }, []);

  // Update context locally
  const updateContext = useCallback((updates: Partial<WorkspaceContext>) => {
    dispatch({ type: "UPDATE_CONTEXT", payload: updates });
  }, []);

  // Update outputs locally
  const updateOutputs = useCallback((updates: Partial<WorkspaceOutputs>) => {
    dispatch({ type: "UPDATE_OUTPUTS", payload: updates });
  }, []);

  // Save current state to server
  // Handles case where caseId is null (after optimistic reset)
  const saveCase = useCallback(async () => {
    dispatch({ type: "SAVE_START" });
    
    try {
      if (!state.caseId) {
        // No case_id yet - create one first
        const newCaseData = await createNewCase();
        // Now patch with current state
        const updated = await patchCase(newCaseData.case_id, {
          context: state.context,
          outputs: state.outputs,
        });
        dispatch({ type: "SAVE_SUCCESS", payload: updated });
      } else {
        // Normal save - we have a case_id
        const updated = await patchCase(state.caseId, {
          context: state.context,
          outputs: state.outputs,
        });
        dispatch({ type: "SAVE_SUCCESS", payload: updated });
      }
    } catch (error: any) {
      dispatch({
        type: "SAVE_ERROR",
        payload: error?.message || "Failed to save workspace",
      });
    }
  }, [state.caseId, state.context, state.outputs]);

  // Create new case (reset) - OPTIMISTIC UPDATE
  // UI clears immediately, API call happens in background
  const newCase = useCallback(async () => {
    // STEP 1: Optimistic reset - clear UI immediately (no waiting!)
    dispatch({ type: "RESET_OPTIMISTIC" });
    
    // STEP 2: Create case in background
    try {
      const newCaseData = await createNewCase();
      // STEP 3: Confirm with actual case_id from server
      dispatch({
        type: "RESET_CONFIRM",
        payload: { case_id: newCaseData.case_id },
      });
    } catch (error: any) {
      // If API fails, we still have a clean UI - just log the error
      // User can continue working, and we'll create case on next save
      console.warn("Failed to create new case on server:", error?.message);
      dispatch({
        type: "SAVE_ERROR",
        payload: error?.message || "Case creation pending - will sync on save",
      });
    }
  }, []);

  // Perform handoff action
  const performHandoff = useCallback(
    async (request: WorkspaceHandoffRequest) => {
      if (!state.caseId) return;

      dispatch({ type: "SAVE_START" });
      
      try {
        const updated = await apiHandoff(state.caseId, request);
        dispatch({ type: "SAVE_SUCCESS", payload: updated });
      } catch (error: any) {
        dispatch({
          type: "SAVE_ERROR",
          payload: error?.message || "Failed to perform handoff",
        });
      }
    },
    [state.caseId]
  );

  // Clear error
  const clearError = useCallback(() => {
    dispatch({ type: "CLEAR_ERROR" });
  }, []);

  const value: WorkspaceContextValue = {
    ...state,
    updateContext,
    updateOutputs,
    saveCase,
    newCase,
    performHandoff,
    clearError,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

// =============================================================================
// HOOK
// =============================================================================

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}

// =============================================================================
// SELECTOR HOOKS
// =============================================================================

export function useWorkspaceContext(): WorkspaceContext {
  const { context } = useWorkspace();
  return context;
}

export function useWorkspaceOutputs(): WorkspaceOutputs {
  const { outputs } = useWorkspace();
  return outputs;
}

export function useWorkspaceLoading(): boolean {
  const { isLoading, isSaving } = useWorkspace();
  return isLoading || isSaving;
}

export function useWorkspaceError(): string | null {
  const { error } = useWorkspace();
  return error;
}
