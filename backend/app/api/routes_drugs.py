from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.api.schemas import DrugResolveResponse, DrugSearchResponse
from app.services.drugs_curated import (
    resolve_name,
    search_suggestions,
    get_drug_details,
    get_drug_categories,
    get_drugs_by_category,
)

router = APIRouter(tags=["drugs"])


# ---------------------------------------------------------------------------
# Quick drug lookup schema (for popup)
# ---------------------------------------------------------------------------

class DrugQuickInfo(BaseModel):
    drug_name: str
    adult_dose: str
    pediatric_dose: str
    renal_adjustment: str
    brands_india: List[str]
    found: bool = True


@router.get("/drugs/search", response_model=DrugSearchResponse)
async def drugs_search(q: str = Query("", min_length=1)):
    return DrugSearchResponse(query=q, suggestions=search_suggestions(q, limit=12))


@router.get("/drugs/resolve", response_model=DrugResolveResponse)
async def drugs_resolve(name: str = Query("", min_length=1)):
    resolved = resolve_name(name)
    return DrugResolveResponse(
        query=name,
        canonical=resolved.get("canonical") or name,
        matched=resolved.get("matched") or name,
        confidence=resolved.get("confidence") or 0.0,
    )


@router.get("/drugs/quick/{name}", response_model=DrugQuickInfo)
async def drugs_quick(name: str):
    """Quick drug lookup from curated database — adult/pediatric dose, renal adjustment, Indian brands."""
    details = get_drug_details(name)
    if not details:
        return DrugQuickInfo(
            drug_name=name,
            adult_dose="Drug not found in curated database",
            pediatric_dose="Not available",
            renal_adjustment="Not available",
            brands_india=[],
            found=False,
        )

    dosing = {}
    for section in details.get("sections", []):
        if section.get("key") == "dosing":
            for bullet in section.get("bullets", []):
                if "**Adult**" in bullet:
                    dosing["adult"] = bullet.replace("**Adult**: ", "")
                elif "**Pediatric**" in bullet:
                    dosing["pediatric"] = bullet.replace("**Pediatric**: ", "")
                elif "**Renal**" in bullet:
                    dosing["renal"] = bullet.replace("**Renal**: ", "")

    header = details.get("header", {})
    return DrugQuickInfo(
        drug_name=header.get("canonical_generic_name", name),
        adult_dose=dosing.get("adult", "See full monograph"),
        pediatric_dose=dosing.get("pediatric", "See full monograph"),
        renal_adjustment=dosing.get("renal", "See full monograph"),
        brands_india=header.get("common_brand_names", []),
        found=True,
    )


@router.get("/drugs/categories")
async def drugs_categories():
    """Return all therapeutic categories with drug counts."""
    return get_drug_categories()


@router.get("/drugs/category/{category}")
async def drugs_by_category(category: str):
    """Return all drugs in a specific therapeutic category."""
    result = get_drugs_by_category(category)
    if not result:
        raise HTTPException(status_code=404, detail=f"No drugs found in category '{category}'")
    return result


@router.get("/drugs/{name}")
async def drugs_detail(name: str):
    """Full drug monograph from curated clinical database."""
    result = get_drug_details(name)
    if not result:
        raise HTTPException(status_code=404, detail=f"Drug '{name}' not found in curated database")
    return result
