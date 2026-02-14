# backend/app/api/routes_image.py
"""
Image Interpretation API - Uses OpenAI Vision for medical image analysis.
"""
from __future__ import annotations

import base64
import os
from typing import Optional, List

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

router = APIRouter(tags=["image"])

# Allowed image MIME types
ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/jpg", 
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
}

# Max file size: 20MB
MAX_FILE_SIZE = 20 * 1024 * 1024


class DifferentialItem(BaseModel):
    name: str
    why: str
    confidence: str  # "low" | "medium" | "high"


class ImageAnalysisResponse(BaseModel):
    summary: str
    observations: List[str]
    differentials: List[DifferentialItem]
    red_flags: List[str]
    recommended_next_steps: List[str]
    limitations: List[str]
    disclaimer: str


SYSTEM_PROMPT = """You are a medical imaging analysis assistant helping physicians interpret clinical images.

IMPORTANT DISCLAIMERS:
- This is an AI-assisted preliminary analysis tool for educational purposes
- All findings require verification by qualified healthcare professionals
- Do NOT make definitive diagnoses
- Always recommend appropriate clinical correlation

When analyzing the image:
1. Describe observable findings objectively
2. List possible differential diagnoses with reasoning and confidence level
3. Highlight any red flags that need immediate attention
4. Suggest appropriate next steps for workup
5. Note any limitations of the analysis

Output your analysis in the following JSON structure:
{
  "summary": "Brief overall impression (1-2 sentences)",
  "observations": ["List of objective findings from the image"],
  "differentials": [
    {"name": "Condition name", "why": "Supporting evidence from image", "confidence": "low|medium|high"}
  ],
  "red_flags": ["Any urgent/concerning findings"],
  "recommended_next_steps": ["Suggested workup, tests, or referrals"],
  "limitations": ["Limitations of this analysis"],
  "disclaimer": "Standard medical disclaimer"
}

Consider patient context if provided (age, sex, body site, duration of symptoms).
Be thorough but concise. Focus on clinically relevant findings."""


async def analyze_with_openai_vision(
    image_base64: str,
    mime_type: str,
    context_text: Optional[str] = None,
    age: Optional[str] = None,
    sex: Optional[str] = None,
    body_site: Optional[str] = None,
    duration: Optional[str] = None,
) -> ImageAnalysisResponse:
    """Call OpenAI Vision API to analyze the image."""
    try:
        from openai import OpenAI
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="OpenAI library not installed. Run: pip install openai"
        )

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY environment variable not set"
        )

    client = OpenAI(api_key=api_key)

    # Build context from optional fields
    context_parts = []
    if age:
        context_parts.append(f"Patient age: {age}")
    if sex:
        context_parts.append(f"Sex: {sex}")
    if body_site:
        context_parts.append(f"Body site/location: {body_site}")
    if duration:
        context_parts.append(f"Duration: {duration}")
    if context_text:
        context_parts.append(f"Additional context: {context_text}")
    
    context_str = "\n".join(context_parts) if context_parts else "No additional patient context provided."

    user_message = f"""Please analyze this medical/clinical image.

Patient Context:
{context_str}

Provide your analysis in the specified JSON format."""

    try:
        response = client.chat.completions.create(
            model="gpt-4o",  # Use vision-capable model
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_message},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{image_base64}",
                                "detail": "high",
                            },
                        },
                    ],
                },
            ],
            max_tokens=2000,
            temperature=0.3,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content
        if not content:
            raise HTTPException(status_code=500, detail="Empty response from OpenAI")

        import json
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            # Try to extract JSON from response
            import re
            json_match = re.search(r'\{[\s\S]*\}', content)
            if json_match:
                data = json.loads(json_match.group())
            else:
                raise HTTPException(status_code=500, detail="Failed to parse JSON response")

        # Validate and build response
        return ImageAnalysisResponse(
            summary=data.get("summary", "Unable to generate summary"),
            observations=data.get("observations", []),
            differentials=[
                DifferentialItem(
                    name=d.get("name", "Unknown"),
                    why=d.get("why", ""),
                    confidence=d.get("confidence", "low"),
                )
                for d in data.get("differentials", [])
            ],
            red_flags=data.get("red_flags", []),
            recommended_next_steps=data.get("recommended_next_steps", []),
            limitations=data.get("limitations", [
                "AI analysis may miss subtle findings",
                "Cannot replace clinical examination",
                "Limited by image quality and angle",
            ]),
            disclaimer=data.get("disclaimer", 
                "This AI-assisted analysis is for educational purposes only and does not constitute medical advice. "
                "All findings must be verified by qualified healthcare professionals. Clinical correlation is required."
            ),
        )

    except Exception as e:
        if "openai" in str(type(e).__module__).lower():
            raise HTTPException(status_code=502, detail=f"OpenAI API error: {str(e)}")
        raise


@router.post("/image/analyze", response_model=ImageAnalysisResponse)
async def analyze_image(
    file: UploadFile = File(..., description="Image file to analyze"),
    context_text: Optional[str] = Form(None, description="Additional clinical context"),
    age: Optional[str] = Form(None, description="Patient age (e.g., '45' or '45 years')"),
    sex: Optional[str] = Form(None, description="Patient sex (male/female/other)"),
    body_site: Optional[str] = Form(None, description="Body site or location"),
    duration: Optional[str] = Form(None, description="Duration of symptoms/condition"),
):
    """
    Analyze a medical/clinical image using AI vision.
    
    - **file**: Image file (JPEG, PNG, GIF, WebP, BMP) - max 20MB
    - **context_text**: Optional additional clinical context
    - **age**: Optional patient age
    - **sex**: Optional patient sex
    - **body_site**: Optional body site/location being imaged
    - **duration**: Optional duration of symptoms
    
    Returns structured analysis with:
    - Summary
    - Observations
    - Differential diagnoses with confidence levels
    - Red flags
    - Recommended next steps
    - Limitations and disclaimer
    """
    # Validate content type
    content_type = file.content_type or ""
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{content_type}'. Allowed: {', '.join(ALLOWED_MIME_TYPES)}"
        )

    # Read file content
    content = await file.read()
    
    # Validate file size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB"
        )

    # Validate it's actually an image
    if len(content) < 100:
        raise HTTPException(status_code=400, detail="File appears to be empty or too small")

    # Convert to base64 for OpenAI Vision API
    image_base64 = base64.b64encode(content).decode("utf-8")

    # Analyze with OpenAI Vision
    result = await analyze_with_openai_vision(
        image_base64=image_base64,
        mime_type=content_type,
        context_text=context_text,
        age=age,
        sex=sex,
        body_site=body_site,
        duration=duration,
    )

    # Note: We do NOT persist the image by default (as per requirements)
    
    return result
