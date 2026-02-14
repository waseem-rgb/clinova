# backend/app/main.py
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env file from backend directory
_env_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(_env_path)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_monograph import router as monograph_router
from app.api.routes_suggest import router as suggest_router
from app.api.lab import router as lab_router
from app.api.routes_ddx import router as ddx_router
from app.api.routes_drugs import router as drugs_router
from app.api.routes_interactions import router as interactions_router
from app.api.routes_rx import router as rx_router
from app.api.routes_search import router as search_router
from app.api.routes_topic import router as topic_router
from app.api.routes_treatment import router as treatment_router
from app.api.routes_assist import router as assist_router
from app.api.routes_field_suggest import router as field_suggest_router
from app.api.routes_image import router as image_router
from app.api.integrations import router as integrations_router
from app.prescription.router import router as prescription_router
from app.workspace.router import router as workspace_router

# Configure logging for integrations
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

app = FastAPI(title="MedCompanion API", version="0.1.0")


def _get_cors_origins() -> list:
    """
    Build CORS allowed origins list.
    
    Includes:
    - Production domains (always)
    - Local dev domains (always, safe for dev)
    - Integration origins from INTEGRATION_ALLOWED_ORIGINS env var
    """
    # Base origins - production and local dev
    origins = [
        "https://medcompanion.in",
        "https://www.medcompanion.in",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    
    # Add integration origins from environment
    integration_origins_raw = os.getenv("INTEGRATION_ALLOWED_ORIGINS", "")
    if integration_origins_raw:
        for origin in integration_origins_raw.split(","):
            origin = origin.strip()
            if origin and origin not in origins:
                # Safety check: don't allow wildcard in production
                if origin != "*":
                    origins.append(origin)
                else:
                    logging.warning("CORS wildcard (*) is not allowed - ignoring")
    
    return origins


# CORS - allow production domain, local dev, and configured integrations
app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount ALL routers under /api prefix for consistency
# This ensures nginx proxy /api/* -> backend works correctly
app.include_router(monograph_router, prefix="/api")
app.include_router(suggest_router, prefix="/api")
app.include_router(lab_router, prefix="/api")
app.include_router(assist_router, prefix="/api")
app.include_router(field_suggest_router, prefix="/api")
app.include_router(prescription_router, prefix="/api")
app.include_router(workspace_router, prefix="/api")
app.include_router(ddx_router, prefix="/api")
app.include_router(drugs_router, prefix="/api")
app.include_router(interactions_router, prefix="/api")
app.include_router(rx_router, prefix="/api")
app.include_router(search_router, prefix="/api")
app.include_router(topic_router, prefix="/api")
app.include_router(treatment_router, prefix="/api")
app.include_router(image_router, prefix="/api")

# Integrations router - API-key protected endpoints for external projects
app.include_router(integrations_router, prefix="/api")


@app.get("/health")
def health():
    """Root health check (non-API)."""
    return {"status": "ok"}


@app.get("/api/health")
def api_health():
    """API health check."""
    return {"status": "ok", "api": True}
