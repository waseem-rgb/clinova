# Doctor-grade Lab Interpretation with Workspace Integration
"""
Lab Interpretation endpoints with workspace persistence.

Lab results now persist to workspace case for:
1. Context carry-forward to other features (DDx, Treatment, etc.)
2. Lab abnormalities influence clinical suggestions
3. Case memory for follow-up visits

Run server:
  uvicorn app.main:app --reload --reload-dir app --port 9000

Example with workspace integration:
  curl -sS -X POST "http://127.0.0.1:9000/api/lab/analyze?debug=true&case_id=uuid-here" \
    -F "files=@/path/to/lab_report.pdf" \
    -F "age=50" -F "sex=male" -F "pregnancy=unknown" \
    -F "known_dx=DM, CKD" -F "current_meds=ACE inhibitor" \
    -F "chief_complaint=fever"
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, Header, Query, UploadFile
from fastapi.responses import JSONResponse

from app.lab.engine import build_response
from app.lab.extract import extract_tests_from_pdfs, infer_abnormalities
from app.api.schemas import LabAnalyzeResponse
from app.workspace.store import get_store

router = APIRouter(prefix="/lab", tags=["lab"])


def _format_abnormality_for_context(abnormality: Dict[str, Any]) -> str:
    """Format a lab abnormality for workspace context storage."""
    test = abnormality.get("test", "Unknown test")
    value = abnormality.get("value_raw", "")
    flag = abnormality.get("flag", "")
    unit = abnormality.get("unit", "")
    
    # Format: "Test: Value Unit (Flag)"
    parts = [test]
    if value:
        parts.append(f": {value}")
    if unit:
        parts.append(f" {unit}")
    if flag:
        parts.append(f" ({flag})")
    
    return "".join(parts)


def _save_to_workspace(
    case_id: str,
    lab_result: Dict[str, Any],
    abnormalities: List[Dict[str, Any]],
) -> Optional[str]:
    """
    Save lab results to workspace case.
    
    Returns error message if failed, None if successful.
    """
    try:
        store = get_store()
        
        # Format abnormalities for context
        abnormality_strings = [
            _format_abnormality_for_context(a) for a in abnormalities
        ]
        
        # Update workspace with lab results
        updated_case = store.update_case(
            case_id=case_id,
            context_updates={
                "lab_abnormalities": abnormality_strings,
            },
            outputs_updates={
                "lab_result": lab_result,
            },
            last_action="lab_analyzed",
        )
        
        if not updated_case:
            return f"Workspace case {case_id} not found"
        
        return None  # Success
    except Exception as e:
        return f"Failed to save to workspace: {str(e)}"


@router.post("/parse")
async def parse_lab_report(
    files: List[UploadFile] = File(...),
):
    """
    Parse lab report PDF(s) and extract test values.
    
    This is a raw extraction endpoint - use /analyze for full interpretation.
    """
    pdf_bytes_list: List[bytes] = []
    for f in files:
        b = await f.read()
        if b:
            pdf_bytes_list.append(b)

    extracted_tests, debug_info = extract_tests_from_pdfs(pdf_bytes_list)

    response: Dict[str, Any] = {
        "extracted_tests": extracted_tests,
        "extracted_tests_count": len(extracted_tests),
        "debug": debug_info,
    }

    return JSONResponse(response)


@router.post("/analyze", response_model=LabAnalyzeResponse)
async def analyze_lab_report(
    include_evidence: bool = Query(False),
    debug: bool = Query(False),
    case_id: Optional[str] = Query(None, description="Workspace case ID to persist results"),
    files: List[UploadFile] = File(...),
    age: Optional[str] = Form(None),
    sex: Optional[str] = Form(None),
    pregnancy: Optional[str] = Form(None),
    known_dx: Optional[str] = Form(None),
    current_meds: Optional[str] = Form(None),
    chief_complaint: Optional[str] = Form(None),
    x_client_id: Optional[str] = Header(None, alias="X-Client-Id"),
):
    """
    Analyze lab report PDF(s) with clinical interpretation.
    
    Optionally persists results to workspace case for context carry-forward.
    
    Args:
        include_evidence: Include RAG evidence in response
        debug: Include debug information
        case_id: Optional workspace case ID to persist results
        files: Lab report PDF file(s)
        age: Patient age
        sex: Patient sex (male/female)
        pregnancy: Pregnancy status
        known_dx: Known diagnoses (comma-separated)
        current_meds: Current medications (comma-separated)
        chief_complaint: Chief complaint/reason for labs
        x_client_id: Client ID header for workspace lookups
    
    Returns:
        Full lab analysis with abnormalities, interpretations, and recommendations.
    """
    pdf_bytes_list: List[bytes] = []
    filenames: List[str] = []

    for f in files:
        b = await f.read()
        if not b:
            continue
        pdf_bytes_list.append(b)
        filenames.append(f.filename or "uploaded.pdf")

    extracted_tests, debug_info = extract_tests_from_pdfs(pdf_bytes_list)

    context = {
        "age": age,
        "sex": sex,
        "pregnancy": pregnancy,
        "known_dx": known_dx,
        "current_meds": current_meds,
        "chief_complaint": chief_complaint,
    }

    response = build_response(extracted_tests, context, include_evidence)
    
    # Get abnormalities for workspace storage
    abnormalities = infer_abnormalities(extracted_tests)
    
    # =======================================================================
    # WORKSPACE INTEGRATION
    # =======================================================================
    workspace_info: Dict[str, Any] = {}
    
    # If case_id provided, save to workspace
    if case_id:
        error = _save_to_workspace(case_id, response, abnormalities)
        if error:
            workspace_info["workspace_error"] = error
            workspace_info["workspace_saved"] = False
        else:
            workspace_info["workspace_saved"] = True
            workspace_info["workspace_case_id"] = case_id
    else:
        workspace_info["workspace_saved"] = False
        workspace_info["workspace_note"] = "No case_id provided - results not persisted"
    
    # Add workspace info to response
    response["workspace"] = workspace_info
    
    # Add lab impact notes for clinical decision support
    if abnormalities:
        response["clinical_impact"] = _generate_clinical_impact(abnormalities, context)

    if debug:
        response["debug"] = {
            "extraction_method_stats": debug_info,
            "range_parse_examples": debug_info.get("range_parse_examples", []),
            "garbage_dropped_examples": debug_info.get("garbage_dropped_examples", []),
            "counts": {
                "total_extracted_tests": response.get("extracted_tests_count", 0),
                "total_abnormalities": response.get("abnormalities_count", 0),
                "total_dropped_garbage": debug_info.get("dropped_garbage_count", 0),
                "lines_dropped_narrative_count": debug_info.get("lines_dropped_narrative_count", 0),
                "urine_qual_positive_count": debug_info.get("urine_qual_positive_count", 0),
            },
            "sample_dropped_narrative_lines": debug_info.get("sample_dropped_narrative_lines", []),
            "warnings": [],
        }
        if response.get("extracted_tests_count", 0) == 0:
            response["debug"]["warnings"].append(
                "No lab values detected—try another PDF or check if scanned image PDF requires OCR (not enabled)."
            )

    return JSONResponse(response)


def _generate_clinical_impact(
    abnormalities: List[Dict[str, Any]],
    context: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Generate clinical impact notes based on abnormalities.
    
    This helps other features (DDx, Treatment) understand lab context.
    """
    impacts = []
    considerations = []
    
    # Categorize abnormalities
    renal_markers = ["creatinine", "bun", "urea", "egfr"]
    hepatic_markers = ["ast", "alt", "sgot", "sgpt", "bilirubin", "alp", "ggt"]
    infection_markers = ["wbc", "neutrophil", "crp", "esr", "procalcitonin"]
    anemia_markers = ["hemoglobin", "hb", "hematocrit", "hct", "rbc"]
    dm_markers = ["glucose", "hba1c", "fasting glucose"]
    lipid_markers = ["cholesterol", "triglyceride", "ldl", "hdl"]
    
    renal_abnormal = False
    hepatic_abnormal = False
    infection_suspected = False
    anemia_present = False
    dm_uncontrolled = False
    
    for abnormality in abnormalities:
        test_lower = (abnormality.get("test") or "").lower()
        flag = abnormality.get("flag")
        
        if any(m in test_lower for m in renal_markers):
            if flag == "H" or "creatinine" in test_lower:
                renal_abnormal = True
        
        if any(m in test_lower for m in hepatic_markers):
            if flag == "H":
                hepatic_abnormal = True
        
        if any(m in test_lower for m in infection_markers):
            if flag == "H":
                infection_suspected = True
        
        if any(m in test_lower for m in anemia_markers):
            if flag == "L":
                anemia_present = True
        
        if any(m in test_lower for m in dm_markers):
            if flag == "H":
                dm_uncontrolled = True
    
    # Generate impact statements
    if renal_abnormal:
        impacts.append({
            "category": "Renal Function",
            "finding": "Abnormal renal markers detected",
            "clinical_significance": "May require dose adjustments for renally-cleared drugs",
            "action_items": [
                "Check eGFR before prescribing nephrotoxic drugs",
                "Adjust doses for renal impairment as needed",
                "Avoid NSAIDs if CKD suspected",
            ],
        })
        considerations.append("Consider renal dose adjustments")
    
    if hepatic_abnormal:
        impacts.append({
            "category": "Hepatic Function",
            "finding": "Elevated liver enzymes",
            "clinical_significance": "May affect drug metabolism and hepatotoxic drug safety",
            "action_items": [
                "Review medication list for hepatotoxic drugs",
                "Consider hepatic dose adjustments",
                "Monitor LFTs if continuing hepatically-metabolized drugs",
            ],
        })
        considerations.append("Consider hepatic dose adjustments")
    
    if infection_suspected:
        impacts.append({
            "category": "Infection",
            "finding": "Elevated infection markers",
            "clinical_significance": "Suggests active infection or inflammatory process",
            "action_items": [
                "Consider source of infection",
                "May need empiric antibiotics pending cultures",
                "Monitor response to treatment",
            ],
        })
        considerations.append("Infection workup may be indicated")
    
    if anemia_present:
        impacts.append({
            "category": "Hematology",
            "finding": "Anemia detected",
            "clinical_significance": "May affect treatment choices and require workup",
            "action_items": [
                "Determine anemia etiology (iron studies, B12, folate)",
                "Consider transfusion threshold",
                "Avoid myelosuppressive drugs if severe",
            ],
        })
        considerations.append("Anemia workup recommended")
    
    if dm_uncontrolled:
        impacts.append({
            "category": "Metabolic",
            "finding": "Uncontrolled glucose/diabetes",
            "clinical_significance": "Affects infection risk, wound healing, medication choices",
            "action_items": [
                "Review diabetes medications",
                "Consider glycemic control optimization",
                "Monitor for diabetic complications",
            ],
        })
        considerations.append("Optimize glycemic control")
    
    return {
        "impact_count": len(impacts),
        "impacts": impacts,
        "prescribing_considerations": considerations,
        "summary": f"{len(impacts)} clinical impact(s) identified from lab abnormalities" if impacts else "No major clinical impacts identified",
    }


@router.get("/workspace/{case_id}")
async def get_lab_from_workspace(case_id: str):
    """
    Get saved lab results from workspace case.
    
    Useful for retrieving previously analyzed lab results.
    """
    store = get_store()
    case = store.get_case(case_id)
    
    if not case:
        return JSONResponse(
            status_code=404,
            content={"error": f"Workspace case {case_id} not found"},
        )
    
    lab_result = case.outputs.lab_result
    lab_abnormalities = case.context.lab_abnormalities
    
    if not lab_result:
        return JSONResponse(
            content={
                "case_id": case_id,
                "has_lab_results": False,
                "message": "No lab results found for this case",
                "lab_abnormalities": lab_abnormalities,
            }
        )
    
    return JSONResponse(
        content={
            "case_id": case_id,
            "has_lab_results": True,
            "lab_result": lab_result,
            "lab_abnormalities": lab_abnormalities,
            "analyzed_at": case.updated_at.isoformat() if case.updated_at else None,
        }
    )
