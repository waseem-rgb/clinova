"""
Prescription PDF Generator - Medico-legally valid PDF prescriptions.

Generates professional PDF prescriptions with:
- Doctor header (name, qualification, reg no)
- Patient information
- Diagnosis
- Medication table with proper formatting
- Advice, investigations, follow-up
- Signature line
- Prescription ID + tamper-evident hash
- Legal disclaimer

Uses reportlab for PDF generation.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import List, Optional, Tuple

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm, cm
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        HRFlowable, KeepTogether
    )
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

from .models import PrescriptionDraft, LockInfo, PrescriptionStatus


# PDF storage directory
PDF_DIR = Path(__file__).resolve().parents[1] / "data" / "prescriptions" / "pdfs"


def _ensure_pdf_dir():
    """Ensure the PDF directory exists"""
    PDF_DIR.mkdir(parents=True, exist_ok=True)


def generate_prescription_hash(draft: PrescriptionDraft) -> str:
    """
    Generate SHA256 hash of canonical prescription JSON.
    This hash is tamper-evident - any change to the prescription will change the hash.
    """
    canonical = {
        "id": draft.id,
        "doctor": {
            "name": draft.doctor.name,
            "qualification": draft.doctor.qualification,
            "registration_no": draft.doctor.registration_no,
            "clinic": draft.doctor.clinic,
            "phone": draft.doctor.phone,
        },
        "patient": {
            "name": draft.patient.name,
            "age": draft.patient.age,
            "sex": draft.patient.sex,
            "id": draft.patient.id,
        },
        "visit": {
            "datetime": draft.visit.datetime.isoformat() if draft.visit.datetime else None,
            "complaints": draft.visit.complaints,
        },
        "diagnosis": {
            "primary": draft.diagnosis.primary,
            "provisional": draft.diagnosis.provisional,
        },
        "rx_items": [
            {
                "generic": item.generic,
                "brand": item.brand,
                "strength": item.strength,
                "form": item.form,
                "dose": item.dose,
                "frequency": item.frequency,
                "timing": item.timing,
                "duration": item.duration,
                "route": item.route,
                "instructions": item.instructions,
            }
            for item in draft.rx_items
        ],
        "investigations": draft.investigations,
        "advice": draft.advice,
        "follow_up": draft.follow_up,
    }
    
    json_str = json.dumps(canonical, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(json_str.encode('utf-8')).hexdigest()


def generate_pdf(draft: PrescriptionDraft) -> Tuple[Optional[bytes], Optional[str]]:
    """
    Generate a PDF for the prescription.
    
    Args:
        draft: The prescription draft to generate PDF for
    
    Returns:
        Tuple of (pdf_bytes, error_message)
        If successful, error_message is None
        If failed, pdf_bytes is None
    """
    if not REPORTLAB_AVAILABLE:
        return None, "PDF generation not available. Install reportlab: pip install reportlab"
    
    try:
        buffer = BytesIO()
        
        # Create document
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=15*mm,
            leftMargin=15*mm,
            topMargin=15*mm,
            bottomMargin=20*mm
        )
        
        # Styles
        styles = getSampleStyleSheet()
        
        style_header = ParagraphStyle(
            'Header',
            parent=styles['Normal'],
            fontSize=14,
            fontName='Helvetica-Bold',
            spaceAfter=2*mm
        )
        
        style_subheader = ParagraphStyle(
            'SubHeader',
            parent=styles['Normal'],
            fontSize=10,
            fontName='Helvetica',
            spaceAfter=1*mm,
            textColor=colors.gray
        )
        
        style_section = ParagraphStyle(
            'Section',
            parent=styles['Normal'],
            fontSize=11,
            fontName='Helvetica-Bold',
            spaceBefore=4*mm,
            spaceAfter=2*mm
        )
        
        style_normal = ParagraphStyle(
            'NormalText',
            parent=styles['Normal'],
            fontSize=10,
            fontName='Helvetica',
            spaceAfter=1*mm
        )
        
        style_rx = ParagraphStyle(
            'RxText',
            parent=styles['Normal'],
            fontSize=14,
            fontName='Helvetica-Bold',
            alignment=1,  # Center
            spaceBefore=3*mm,
            spaceAfter=3*mm
        )
        
        style_small = ParagraphStyle(
            'Small',
            parent=styles['Normal'],
            fontSize=8,
            fontName='Helvetica',
            textColor=colors.gray
        )
        
        style_disclaimer = ParagraphStyle(
            'Disclaimer',
            parent=styles['Normal'],
            fontSize=7,
            fontName='Helvetica-Oblique',
            textColor=colors.gray,
            spaceBefore=5*mm
        )
        
        # Build document content
        content = []
        
        # ========== Doctor Header ==========
        doctor_name = f"Dr. {draft.doctor.name}"
        if draft.doctor.qualification:
            doctor_name += f", {draft.doctor.qualification}"
        content.append(Paragraph(doctor_name, style_header))
        content.append(Paragraph(f"Reg. No: {draft.doctor.registration_no}", style_subheader))
        
        if draft.doctor.clinic:
            content.append(Paragraph(draft.doctor.clinic, style_subheader))
        if draft.doctor.phone:
            content.append(Paragraph(f"Tel: {draft.doctor.phone}", style_subheader))
        
        content.append(HRFlowable(width="100%", thickness=1, color=colors.gray))
        content.append(Spacer(1, 3*mm))
        
        # ========== Patient Block ==========
        visit_date = draft.visit.datetime.strftime("%d-%m-%Y %H:%M") if draft.visit.datetime else "N/A"
        patient_sex = {"M": "Male", "F": "Female"}.get(draft.patient.sex, draft.patient.sex)
        
        patient_data = [
            ["Patient:", draft.patient.name, "Age/Sex:", f"{draft.patient.age} yrs / {patient_sex}"],
            ["Date:", visit_date, "ID:", draft.patient.id or "N/A"],
        ]
        
        patient_table = Table(patient_data, colWidths=[50, 180, 50, 100])
        patient_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
        ]))
        content.append(patient_table)
        content.append(Spacer(1, 2*mm))
        
        # ========== Complaints ==========
        if draft.visit.complaints:
            content.append(Paragraph("Complaints:", style_section))
            complaints_text = ", ".join(draft.visit.complaints)
            content.append(Paragraph(complaints_text, style_normal))
        
        # ========== Diagnosis ==========
        if draft.diagnosis.primary or draft.diagnosis.provisional:
            content.append(Paragraph("Diagnosis:", style_section))
            if draft.diagnosis.primary:
                content.append(Paragraph(f"<b>Primary:</b> {draft.diagnosis.primary}", style_normal))
            if draft.diagnosis.provisional:
                prov_text = ", ".join(draft.diagnosis.provisional)
                content.append(Paragraph(f"<b>Provisional:</b> {prov_text}", style_normal))
        
        content.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey))
        
        # ========== Rx Symbol ==========
        content.append(Paragraph("℞", style_rx))
        
        # ========== Medication Table ==========
        if draft.rx_items:
            med_header = ["#", "Drug", "Dose/Strength", "Frequency", "Duration", "Instructions"]
            med_data = [med_header]
            
            for idx, item in enumerate(draft.rx_items, 1):
                drug_name = item.generic
                if item.brand:
                    drug_name = f"{item.brand} ({item.generic})"
                if item.form:
                    drug_name += f" {item.form}"
                
                dose_strength = item.dose or item.strength or "-"
                frequency = item.frequency
                if item.timing:
                    frequency += f" ({item.timing})"
                duration = item.duration or "-"
                instructions = item.instructions or item.route or "-"
                
                med_data.append([
                    str(idx),
                    drug_name,
                    dose_strength,
                    frequency,
                    duration,
                    instructions
                ])
            
            med_table = Table(med_data, colWidths=[20, 140, 60, 70, 50, 80])
            med_table.setStyle(TableStyle([
                # Header style
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f0f0f0')),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 9),
                # Body style
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
                # Alignment
                ('ALIGN', (0, 0), (0, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                # Padding
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                # Grid
                ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ]))
            content.append(med_table)
        else:
            content.append(Paragraph("<i>No medications prescribed</i>", style_normal))
        
        content.append(Spacer(1, 4*mm))
        
        # ========== Investigations ==========
        if draft.investigations:
            content.append(Paragraph("Investigations:", style_section))
            for inv in draft.investigations:
                content.append(Paragraph(f"• {inv}", style_normal))
        
        # ========== Advice ==========
        if draft.advice:
            content.append(Paragraph("Advice:", style_section))
            for adv in draft.advice:
                content.append(Paragraph(f"• {adv}", style_normal))
        
        # ========== Follow-up ==========
        if draft.follow_up:
            content.append(Paragraph("Follow-up:", style_section))
            content.append(Paragraph(draft.follow_up, style_normal))
        
        content.append(Spacer(1, 10*mm))
        
        # ========== Signature Line ==========
        sig_data = [
            ["", ""],
            ["", "_" * 30],
            ["", "Signature"],
        ]
        sig_table = Table(sig_data, colWidths=[300, 120])
        sig_table.setStyle(TableStyle([
            ('ALIGN', (1, 0), (1, -1), 'CENTER'),
            ('FONTNAME', (1, 2), (1, 2), 'Helvetica'),
            ('FONTSIZE', (1, 2), (1, 2), 9),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
        ]))
        content.append(sig_table)
        
        content.append(Spacer(1, 8*mm))
        content.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey))
        
        # ========== Footer with Hash ==========
        rx_hash = draft.lock.hash if draft.lock else generate_prescription_hash(draft)
        generated_time = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
        
        footer_text = f"Rx ID: {draft.id} | Generated: {generated_time}"
        content.append(Paragraph(footer_text, style_small))
        
        hash_text = f"Verification Hash: {rx_hash[:16]}...{rx_hash[-8:]}"
        content.append(Paragraph(hash_text, style_small))
        
        # ========== Disclaimer ==========
        disclaimer = (
            "DISCLAIMER: This prescription is digitally generated. The prescribing physician "
            "is responsible for its accuracy. Pharmacists should verify before dispensing. "
            "This document is valid only with the physician's signature or digital authentication."
        )
        content.append(Paragraph(disclaimer, style_disclaimer))
        
        # Build PDF
        doc.build(content)
        
        pdf_bytes = buffer.getvalue()
        buffer.close()
        
        return pdf_bytes, None
        
    except Exception as e:
        return None, f"PDF generation failed: {str(e)}"


def save_pdf(draft: PrescriptionDraft, pdf_bytes: bytes) -> str:
    """
    Save PDF bytes to file.
    
    Args:
        draft: The prescription draft
        pdf_bytes: PDF content as bytes
    
    Returns:
        Path to saved PDF file (relative to data directory)
    """
    _ensure_pdf_dir()
    
    filename = f"rx_{draft.id}.pdf"
    filepath = PDF_DIR / filename
    
    with filepath.open("wb") as f:
        f.write(pdf_bytes)
    
    # Return relative path
    return f"prescriptions/pdfs/{filename}"


def get_pdf_path(draft_id: str) -> Optional[Path]:
    """
    Get the full path to a prescription PDF.
    
    Args:
        draft_id: Prescription ID
    
    Returns:
        Path object if file exists, None otherwise
    """
    filepath = PDF_DIR / f"rx_{draft_id}.pdf"
    if filepath.exists():
        return filepath
    return None


def lock_prescription(draft: PrescriptionDraft) -> Tuple[PrescriptionDraft, List[str]]:
    """
    Lock a prescription and generate PDF.
    
    This:
    1. Validates the prescription can be locked
    2. Generates the hash
    3. Generates the PDF
    4. Saves the PDF
    5. Updates the draft with lock info
    
    Args:
        draft: The prescription draft to lock
    
    Returns:
        Tuple of (updated_draft, errors)
        If errors is empty, lock was successful
    """
    # Check if already locked
    if draft.status == PrescriptionStatus.LOCKED:
        return draft, ["Prescription is already locked"]
    
    # Validate
    can_lock, errors = draft.can_lock()
    if not can_lock:
        return draft, errors
    
    # Generate hash
    rx_hash = generate_prescription_hash(draft)
    
    # Generate PDF
    pdf_bytes, pdf_error = generate_pdf(draft)
    if pdf_error:
        return draft, [pdf_error]
    
    # Save PDF
    pdf_path = save_pdf(draft, pdf_bytes)
    
    # Update draft with lock info
    draft.status = PrescriptionStatus.LOCKED
    draft.lock = LockInfo(
        locked_at=datetime.utcnow(),
        locked_by=draft.doctor.name,
        hash=rx_hash,
        pdf_path=pdf_path
    )
    draft.updated_at = datetime.utcnow()
    
    return draft, []
