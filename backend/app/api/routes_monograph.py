from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.schemas import DoctorMonographResponse
from app.rag.routing import ROUTES
from app.rag.doctor_output_builder import generate_monograph
from app.rag.query_engine import retrieve
from app.rag.llm_client import llm_generate
from app.services.topics import get_topic

router = APIRouter()


async def run_feature(
    feature_key: str,
    q: str,
    mode: str,
    max_sections: int,
    k: int,
    timeout_s: int,
) -> DoctorMonographResponse:
    route = ROUTES[feature_key]

    sections, evidence, doctor_view_md = await generate_monograph(
        route=route,
        query=q,
        retrieve_fn=retrieve,
        llm_fn=llm_generate,
        mode=mode,
        max_sections=max_sections,
        k_per_section=k,
        max_evidence_per_section=6 if mode == "fast" else 10,
        timeout_s=timeout_s,
    )

    return DoctorMonographResponse(
        feature=route.feature,
        query=q,
        collection=route.collection,
        doctor_view_md=doctor_view_md,
        sections=sections,
        evidence=evidence,
        debug=None,
    )


@router.get("/topic/medicine")
async def topic_medicine(
    q: str = Query(..., min_length=2),
    debug: bool = Query(False),
):
    return await get_topic(q, debug=debug)


@router.get("/topic/obgyn")
async def topic_obgyn(
    q: str = Query(..., min_length=2),
    debug: bool = Query(False),
):
    return await get_topic(q, debug=debug)


@router.get("/topic/surgery")
async def topic_surgery(
    q: str = Query(..., min_length=2),
    debug: bool = Query(False),
):
    return await get_topic(q, debug=debug)


@router.get("/topic/pediatrics")
async def topic_peds(
    q: str = Query(..., min_length=2),
    debug: bool = Query(False),
):
    return await get_topic(q, debug=debug)


@router.get("/drug/details", response_model=DoctorMonographResponse)
async def drug_details(
    q: str = Query(..., min_length=2),
    mode: str = Query("fast", description="fast|full"),
    max_sections: int = Query(8, ge=2, le=50),
    k: int = Query(8, ge=3, le=20),
    timeout_s: int = Query(35, ge=10, le=120),
):
    return await run_feature("drug_details", q, mode, max_sections, k, timeout_s)


@router.get("/drug/interactions", response_model=DoctorMonographResponse)
async def drug_interactions(
    q: str = Query(..., min_length=2),
    mode: str = Query("fast", description="fast|full"),
    max_sections: int = Query(8, ge=2, le=50),
    k: int = Query(8, ge=3, le=20),
    timeout_s: int = Query(35, ge=10, le=120),
):
    return await run_feature("drug_interactions", q, mode, max_sections, k, timeout_s)
