# backend/app/services/calculators.py
"""
Medical calculator engine for Clinova.

22 validated clinical calculators with correct medical formulas,
interpretation categories, and color-coded risk stratification.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Renal dose adjustment helper
# ---------------------------------------------------------------------------

_RENAL_DOSE_TABLE: List[Dict[str, Any]] = [
    {
        "drug": "Metformin",
        "normal": "500-1000 mg BD",
        "mild_30_59": "500 mg BD (max 1000 mg/day)",
        "moderate_15_29": "Avoid",
        "severe_lt15": "Contraindicated",
    },
    {
        "drug": "Amoxicillin",
        "normal": "500 mg TDS",
        "mild_30_59": "500 mg BD",
        "moderate_15_29": "500 mg OD",
        "severe_lt15": "250 mg OD",
    },
    {
        "drug": "Ciprofloxacin",
        "normal": "500 mg BD",
        "mild_30_59": "250-500 mg BD",
        "moderate_15_29": "250 mg BD",
        "severe_lt15": "250 mg OD",
    },
    {
        "drug": "Levofloxacin",
        "normal": "500-750 mg OD",
        "mild_30_59": "250-500 mg OD",
        "moderate_15_29": "250 mg OD or q48h",
        "severe_lt15": "250 mg q48h",
    },
    {
        "drug": "Gentamicin",
        "normal": "5 mg/kg/day",
        "mild_30_59": "Extend interval to q12-24h",
        "moderate_15_29": "Extend interval to q24-48h",
        "severe_lt15": "Avoid or per levels",
    },
    {
        "drug": "Vancomycin",
        "normal": "15-20 mg/kg q12h",
        "mild_30_59": "15 mg/kg q24h",
        "moderate_15_29": "15 mg/kg q48h",
        "severe_lt15": "Per trough levels only",
    },
    {
        "drug": "Enoxaparin (treatment)",
        "normal": "1 mg/kg BD",
        "mild_30_59": "1 mg/kg OD",
        "moderate_15_29": "Avoid or use UFH",
        "severe_lt15": "Contraindicated, use UFH",
    },
    {
        "drug": "Atenolol",
        "normal": "50-100 mg OD",
        "mild_30_59": "25-50 mg OD",
        "moderate_15_29": "25 mg OD or alternate days",
        "severe_lt15": "Avoid",
    },
    {
        "drug": "Digoxin",
        "normal": "0.125-0.25 mg OD",
        "mild_30_59": "0.125 mg OD",
        "moderate_15_29": "0.0625 mg OD",
        "severe_lt15": "Avoid or per levels",
    },
    {
        "drug": "Ranitidine",
        "normal": "150 mg BD",
        "mild_30_59": "150 mg OD",
        "moderate_15_29": "150 mg OD",
        "severe_lt15": "150 mg alternate days",
    },
    {
        "drug": "Gabapentin",
        "normal": "300-600 mg TDS",
        "mild_30_59": "200-300 mg BD",
        "moderate_15_29": "100-300 mg OD",
        "severe_lt15": "100 mg OD or alternate days",
    },
    {
        "drug": "Acyclovir",
        "normal": "800 mg 5x/day (zoster)",
        "mild_30_59": "800 mg TDS",
        "moderate_15_29": "800 mg BD",
        "severe_lt15": "800 mg OD",
    },
    {
        "drug": "Spironolactone",
        "normal": "25-50 mg OD",
        "mild_30_59": "12.5-25 mg OD (monitor K+)",
        "moderate_15_29": "Avoid",
        "severe_lt15": "Contraindicated",
    },
    {
        "drug": "Allopurinol",
        "normal": "300 mg OD",
        "mild_30_59": "200 mg OD",
        "moderate_15_29": "100 mg OD",
        "severe_lt15": "100 mg alternate days",
    },
]


def get_renal_dose_adjustments(crcl: float) -> List[Dict[str, str]]:
    """Return drug dose adjustments for common drugs at the given CrCl (mL/min)."""
    adjustments: List[Dict[str, str]] = []
    for row in _RENAL_DOSE_TABLE:
        if crcl >= 60:
            dose = row["normal"]
            stage = "Normal (CrCl >= 60)"
        elif crcl >= 30:
            dose = row["mild_30_59"]
            stage = "Mild-Moderate (CrCl 30-59)"
        elif crcl >= 15:
            dose = row["moderate_15_29"]
            stage = "Moderate-Severe (CrCl 15-29)"
        else:
            dose = row["severe_lt15"]
            stage = "Severe (CrCl < 15)"
        adjustments.append({
            "drug": row["drug"],
            "recommended_dose": dose,
            "renal_stage": stage,
        })
    return adjustments


# ---------------------------------------------------------------------------
# Individual calculator functions
# ---------------------------------------------------------------------------

def calc_bmi(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """BMI with Asian cutoffs (WHO Western Pacific / IAP-India)."""
    weight = float(inputs["weight_kg"])
    height_cm = float(inputs["height_cm"])
    height_m = height_cm / 100.0
    bmi = weight / (height_m ** 2)

    # Asian cutoffs
    if bmi < 18.5:
        cat, color = "Underweight", "yellow"
    elif bmi < 23.0:
        cat, color = "Normal", "green"
    elif bmi < 25.0:
        cat, color = "Overweight (Asian cutoff)", "orange"
    elif bmi < 30.0:
        cat, color = "Obese Class I (Asian cutoff)", "red"
    else:
        cat, color = "Obese Class II+", "red"

    return {
        "result": round(bmi, 1),
        "unit": "kg/m\u00b2",
        "category": cat,
        "color": color,
        "interpretation": f"BMI {bmi:.1f} kg/m\u00b2 \u2014 {cat}. Asian cutoffs: overweight \u226523, obese \u226525.",
        "formula": "Weight(kg) / Height(m)\u00b2",
    }


def calc_bsa(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """BSA via Mosteller formula."""
    weight = float(inputs["weight_kg"])
    height_cm = float(inputs["height_cm"])
    bsa = math.sqrt((weight * height_cm) / 3600.0)

    if bsa < 1.5:
        cat, color = "Below average", "yellow"
    elif bsa <= 2.0:
        cat, color = "Average", "green"
    else:
        cat, color = "Above average", "yellow"

    return {
        "result": round(bsa, 2),
        "unit": "m\u00b2",
        "category": cat,
        "color": color,
        "interpretation": f"BSA {bsa:.2f} m\u00b2 (Mosteller). Average adult ~1.7 m\u00b2.",
        "formula": "\u221a(Weight(kg) \u00d7 Height(cm) / 3600)",
    }


def calc_ibw(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Ideal Body Weight \u2014 Devine formula."""
    height_cm = float(inputs["height_cm"])
    sex = inputs.get("sex", "male").lower()

    inches = height_cm / 2.54
    if inches < 60:
        inches = 60  # formula not validated below 5 feet

    if sex == "female":
        ibw = 45.5 + 2.3 * (inches - 60)
    else:
        ibw = 50.0 + 2.3 * (inches - 60)

    return {
        "result": round(ibw, 1),
        "unit": "kg",
        "category": "Ideal Body Weight",
        "color": "green",
        "interpretation": f"IBW (Devine) for {'female' if sex == 'female' else 'male'} at {height_cm} cm: {ibw:.1f} kg.",
        "formula": "Male: 50 + 2.3\u00d7(inches\u221260), Female: 45.5 + 2.3\u00d7(inches\u221260)",
    }


def calc_abw(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Adjusted Body Weight."""
    actual = float(inputs["weight_kg"])
    height_cm = float(inputs["height_cm"])
    sex = inputs.get("sex", "male").lower()

    inches = height_cm / 2.54
    if inches < 60:
        inches = 60

    ibw = (45.5 if sex == "female" else 50.0) + 2.3 * (inches - 60)
    abw = ibw + 0.4 * (actual - ibw)

    return {
        "result": round(abw, 1),
        "unit": "kg",
        "category": "Adjusted Body Weight",
        "color": "green",
        "interpretation": f"ABW {abw:.1f} kg (IBW {ibw:.1f} kg, actual {actual} kg). Use ABW for drug dosing in obese patients.",
        "formula": "IBW + 0.4 \u00d7 (Actual Weight \u2212 IBW)",
    }


def calc_crcl(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Creatinine Clearance \u2014 Cockcroft-Gault."""
    age = float(inputs["age"])
    weight = float(inputs["weight_kg"])
    scr = float(inputs["serum_creatinine"])
    sex = inputs.get("sex", "male").lower()

    crcl = ((140 - age) * weight) / (72 * scr)
    if sex == "female":
        crcl *= 0.85

    if crcl >= 90:
        cat, color = "Normal", "green"
    elif crcl >= 60:
        cat, color = "Mild impairment (CKD 2)", "yellow"
    elif crcl >= 30:
        cat, color = "Moderate impairment (CKD 3)", "orange"
    elif crcl >= 15:
        cat, color = "Severe impairment (CKD 4)", "red"
    else:
        cat, color = "Kidney failure (CKD 5)", "red"

    dose_adjustments = get_renal_dose_adjustments(crcl)

    return {
        "result": round(crcl, 1),
        "unit": "mL/min",
        "category": cat,
        "color": color,
        "interpretation": f"CrCl {crcl:.1f} mL/min \u2014 {cat}. Review drug dosing for renal impairment.",
        "formula": "[(140\u2212age) \u00d7 weight(kg)] / [72 \u00d7 SCr(mg/dL)] \u00d7 0.85 if female",
        "dose_adjustments": dose_adjustments,
    }


def calc_egfr_ckdepi(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """eGFR CKD-EPI 2021 (race-free)."""
    age = float(inputs["age"])
    scr = float(inputs["serum_creatinine"])
    sex = inputs.get("sex", "male").lower()

    # CKD-EPI 2021 race-free equation
    if sex == "female":
        kappa = 0.7
        alpha = -0.241
        female_mult = 1.012
    else:
        kappa = 0.9
        alpha = -0.302
        female_mult = 1.0

    scr_kappa = scr / kappa
    min_val = min(scr_kappa, 1.0)
    max_val = max(scr_kappa, 1.0)

    egfr = 142 * (min_val ** alpha) * (max_val ** -1.200) * (0.9938 ** age) * female_mult

    if egfr >= 90:
        cat, color = "Normal (G1)", "green"
    elif egfr >= 60:
        cat, color = "Mildly decreased (G2)", "yellow"
    elif egfr >= 45:
        cat, color = "Mild-moderate decrease (G3a)", "orange"
    elif egfr >= 30:
        cat, color = "Moderate-severe decrease (G3b)", "orange"
    elif egfr >= 15:
        cat, color = "Severely decreased (G4)", "red"
    else:
        cat, color = "Kidney failure (G5)", "red"

    return {
        "result": round(egfr, 1),
        "unit": "mL/min/1.73m\u00b2",
        "category": cat,
        "color": color,
        "interpretation": f"eGFR {egfr:.1f} mL/min/1.73m\u00b2 \u2014 {cat}.",
        "formula": "CKD-EPI 2021 (race-free): 142 \u00d7 min(SCr/\u03ba,1)^\u03b1 \u00d7 max(SCr/\u03ba,1)^-1.200 \u00d7 0.9938^age [\u00d71.012 if female]",
    }


def calc_corrected_calcium(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Corrected Calcium for albumin."""
    ca = float(inputs["calcium"])
    albumin = float(inputs["albumin"])

    corrected = ca + 0.8 * (4.0 - albumin)

    if corrected < 8.5:
        cat, color = "Hypocalcemia", "red"
    elif corrected <= 10.5:
        cat, color = "Normal", "green"
    elif corrected <= 12.0:
        cat, color = "Mild hypercalcemia", "orange"
    else:
        cat, color = "Severe hypercalcemia", "red"

    return {
        "result": round(corrected, 1),
        "unit": "mg/dL",
        "category": cat,
        "color": color,
        "interpretation": f"Corrected Ca {corrected:.1f} mg/dL (measured {ca}, albumin {albumin}) \u2014 {cat}.",
        "formula": "Corrected Ca = Ca + 0.8 \u00d7 (4.0 \u2212 Albumin)",
    }


def calc_anion_gap(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Anion Gap with albumin correction."""
    na = float(inputs["sodium"])
    cl = float(inputs["chloride"])
    hco3 = float(inputs["bicarbonate"])
    albumin = float(inputs.get("albumin", 4.0))

    ag = na - (cl + hco3)
    # Corrected AG: add 2.5 for each 1 g/dL albumin below 4.0
    corrected_ag = ag + 2.5 * (4.0 - albumin)

    if corrected_ag <= 12:
        cat, color = "Normal", "green"
    elif corrected_ag <= 20:
        cat, color = "Elevated", "orange"
    else:
        cat, color = "High (consider HAGMA)", "red"

    return {
        "result": round(corrected_ag, 1),
        "unit": "mEq/L",
        "category": cat,
        "color": color,
        "interpretation": f"AG {ag:.1f}, albumin-corrected AG {corrected_ag:.1f} mEq/L \u2014 {cat}. Normal 8\u201312. If elevated, consider MUDPILES (Methanol, Uremia, DKA, Propylene glycol, INH/Iron, Lactic acidosis, Ethylene glycol, Salicylates).",
        "formula": "AG = Na \u2212 (Cl + HCO\u2083); Corrected AG = AG + 2.5 \u00d7 (4.0 \u2212 Albumin)",
    }


def calc_corrected_sodium(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Corrected Sodium for hyperglycemia."""
    na = float(inputs["sodium"])
    glucose = float(inputs["glucose"])

    corrected = na + 1.6 * ((glucose - 100) / 100)

    if corrected < 135:
        cat, color = "Hyponatremia", "red"
    elif corrected <= 145:
        cat, color = "Normal", "green"
    else:
        cat, color = "Hypernatremia", "red"

    return {
        "result": round(corrected, 1),
        "unit": "mEq/L",
        "category": cat,
        "color": color,
        "interpretation": f"Corrected Na {corrected:.1f} mEq/L (measured {na}, glucose {glucose} mg/dL) \u2014 {cat}.",
        "formula": "Corrected Na = Na + 1.6 \u00d7 ((Glucose \u2212 100) / 100)",
    }


def calc_serum_osmolality(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Calculated Serum Osmolality."""
    na = float(inputs["sodium"])
    glucose = float(inputs["glucose"])
    bun = float(inputs["bun"])

    osm = 2 * na + glucose / 18.0 + bun / 2.8

    if osm < 275:
        cat, color = "Low (hypoosmolar)", "orange"
    elif osm <= 295:
        cat, color = "Normal", "green"
    else:
        cat, color = "High (hyperosmolar)", "red"

    return {
        "result": round(osm, 1),
        "unit": "mOsm/kg",
        "category": cat,
        "color": color,
        "interpretation": f"Calculated osmolality {osm:.1f} mOsm/kg \u2014 {cat}. Normal 275\u2013295. Osmolar gap = measured \u2212 calculated (if >10, consider toxic alcohols).",
        "formula": "2 \u00d7 Na + Glucose/18 + BUN/2.8",
    }


def calc_meld(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """MELD and MELD-Na score for liver disease."""
    cr = max(float(inputs["creatinine"]), 1.0)
    cr = min(cr, 4.0)
    bili = max(float(inputs["bilirubin"]), 1.0)
    inr = max(float(inputs["inr"]), 1.0)
    na = float(inputs.get("sodium", 140))
    na = max(min(na, 140), 125)

    meld = 10 * (0.957 * math.log(cr) + 0.378 * math.log(bili) + 1.120 * math.log(inr) + 0.643)
    meld = round(meld)
    meld = max(meld, 6)
    meld = min(meld, 40)

    # MELD-Na
    if meld > 11:
        meld_na = meld + 1.32 * (137 - na) - 0.033 * meld * (137 - na)
    else:
        meld_na = meld
    meld_na = round(max(min(meld_na, 40), 6))

    if meld <= 9:
        cat, color = "Low (1.9% 3-month mortality)", "green"
    elif meld <= 19:
        cat, color = "Moderate (6% 3-month mortality)", "yellow"
    elif meld <= 29:
        cat, color = "High (19.6% 3-month mortality)", "orange"
    else:
        cat, color = "Very high (52.6% 3-month mortality)", "red"

    return {
        "result": meld,
        "unit": "points",
        "category": cat,
        "color": color,
        "interpretation": f"MELD {meld}, MELD-Na {meld_na} \u2014 {cat}. MELD-Na may better predict waitlist mortality.",
        "formula": "MELD = 10 \u00d7 [0.957\u00d7ln(Cr) + 0.378\u00d7ln(Bili) + 1.120\u00d7ln(INR) + 0.643]",
        "meld_na": meld_na,
    }


def calc_cha2ds2vasc(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """CHA\u2082DS\u2082-VASc score for AF stroke risk."""
    score = 0
    score += int(inputs.get("chf", 0))                  # +1
    score += int(inputs.get("hypertension", 0))          # +1
    score += 2 * int(inputs.get("age_75_plus", 0))       # +2
    score += int(inputs.get("diabetes", 0))              # +1
    score += 2 * int(inputs.get("stroke_tia", 0))        # +2
    score += int(inputs.get("vascular_disease", 0))      # +1
    score += int(inputs.get("age_65_74", 0))             # +1
    score += int(inputs.get("female", 0))                # +1

    if score == 0:
        cat, color = "Low risk \u2014 no anticoagulation", "green"
    elif score == 1:
        cat, color = "Low-moderate \u2014 consider anticoagulation", "yellow"
    else:
        cat, color = "Moderate-high \u2014 anticoagulation recommended", "red"

    annual_stroke = {0: 0.2, 1: 0.6, 2: 2.2, 3: 3.2, 4: 4.8, 5: 7.2, 6: 9.7, 7: 11.2, 8: 10.8, 9: 12.2}

    return {
        "result": score,
        "unit": "points (0\u20139)",
        "category": cat,
        "color": color,
        "interpretation": f"CHA\u2082DS\u2082-VASc {score} \u2014 annual stroke risk ~{annual_stroke.get(score, '>12')}%. {cat}.",
        "formula": "CHF+1, HTN+1, Age\u226575+2, DM+1, Stroke/TIA+2, Vascular dz+1, Age 65\u201374+1, Female+1",
    }


def calc_hasbled(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """HAS-BLED bleeding risk score."""
    score = 0
    score += int(inputs.get("hypertension_uncontrolled", 0))  # H
    score += int(inputs.get("renal_disease", 0))               # A
    score += int(inputs.get("liver_disease", 0))               # A
    score += int(inputs.get("stroke_history", 0))              # S
    score += int(inputs.get("bleeding_history", 0))            # B
    score += int(inputs.get("labile_inr", 0))                  # L
    score += int(inputs.get("elderly_65", 0))                  # E
    score += int(inputs.get("drugs_antiplatelet_nsaid", 0))    # D
    score += int(inputs.get("alcohol", 0))                     # D

    if score <= 1:
        cat, color = "Low bleeding risk", "green"
    elif score == 2:
        cat, color = "Moderate bleeding risk", "yellow"
    else:
        cat, color = "High bleeding risk \u2014 caution with anticoagulation", "red"

    return {
        "result": score,
        "unit": "points (0\u20139)",
        "category": cat,
        "color": color,
        "interpretation": f"HAS-BLED {score} \u2014 {cat}. High score does not contraindicate anticoagulation but warrants closer monitoring.",
        "formula": "HTN(uncontrolled)+1, Abnormal renal/liver +1 each, Stroke+1, Bleeding+1, Labile INR+1, Elderly+1, Drugs/Alcohol +1 each",
    }


def calc_curb65(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """CURB-65 pneumonia severity."""
    score = 0
    score += int(inputs.get("confusion", 0))               # C
    score += int(inputs.get("bun_gt19", 0))                 # U (BUN >19 mg/dL or urea >7 mmol/L)
    score += int(inputs.get("rr_gte30", 0))                 # R
    score += int(inputs.get("bp_low", 0))                   # B (SBP <90 or DBP <=60)
    score += int(inputs.get("age_gte65", 0))                # 65

    if score <= 1:
        cat, color = "Low severity \u2014 consider outpatient", "green"
    elif score == 2:
        cat, color = "Moderate \u2014 consider short inpatient or supervised outpatient", "yellow"
    elif score == 3:
        cat, color = "Severe \u2014 hospitalize", "orange"
    else:
        cat, color = "Very severe \u2014 consider ICU", "red"

    mortality = {0: 0.6, 1: 2.7, 2: 6.8, 3: 14.0, 4: 27.8, 5: 27.8}

    return {
        "result": score,
        "unit": "points (0\u20135)",
        "category": cat,
        "color": color,
        "interpretation": f"CURB-65 = {score} \u2014 30-day mortality ~{mortality.get(score, 28)}%. {cat}.",
        "formula": "Confusion+1, BUN>19+1, RR\u226530+1, SBP<90 or DBP\u226460+1, Age\u226565+1",
    }


def calc_gcs(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Glasgow Coma Scale."""
    eye = int(inputs.get("eye", 4))       # 1-4
    verbal = int(inputs.get("verbal", 5)) # 1-5
    motor = int(inputs.get("motor", 6))   # 1-6

    eye = max(1, min(eye, 4))
    verbal = max(1, min(verbal, 5))
    motor = max(1, min(motor, 6))

    gcs = eye + verbal + motor

    if gcs >= 13:
        cat, color = "Mild brain injury", "green"
    elif gcs >= 9:
        cat, color = "Moderate brain injury", "orange"
    else:
        cat, color = "Severe brain injury", "red"

    return {
        "result": gcs,
        "unit": f"(E{eye} V{verbal} M{motor})",
        "category": cat,
        "color": color,
        "interpretation": f"GCS {gcs}/15 (E{eye}V{verbal}M{motor}) \u2014 {cat}. Intubation consideration if GCS \u22648.",
        "formula": "Eye (1\u20134) + Verbal (1\u20135) + Motor (1\u20136)",
    }


def calc_parkland(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Parkland formula for burns resuscitation."""
    weight = float(inputs["weight_kg"])
    tbsa = float(inputs["tbsa_percent"])

    total_24h = 4 * weight * tbsa  # mL of Ringer's Lactate in 24h
    first_8h = total_24h / 2
    next_16h = total_24h / 2

    first_8h_rate = first_8h / 8  # mL/hr

    if tbsa < 15:
        cat, color = "Minor burn", "yellow"
    elif tbsa < 30:
        cat, color = "Moderate burn", "orange"
    else:
        cat, color = "Major burn", "red"

    return {
        "result": round(total_24h),
        "unit": "mL RL in 24h",
        "category": cat,
        "color": color,
        "interpretation": f"Total 24h fluid: {total_24h:.0f} mL RL. First 8h: {first_8h:.0f} mL ({first_8h_rate:.0f} mL/hr), Next 16h: {next_16h:.0f} mL ({next_16h/16:.0f} mL/hr). Titrate to UOP 0.5\u20131 mL/kg/hr.",
        "formula": "4 \u00d7 Weight(kg) \u00d7 %TBSA",
        "first_8h_ml": round(first_8h),
        "next_16h_ml": round(next_16h),
        "first_8h_rate_ml_hr": round(first_8h_rate),
    }


def calc_qtc(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """QTc \u2014 Bazett formula."""
    qt_ms = float(inputs["qt_ms"])
    hr = float(inputs["heart_rate"])

    rr_sec = 60.0 / hr
    qtc = qt_ms / math.sqrt(rr_sec)

    if qtc < 440:
        cat, color = "Normal", "green"
    elif qtc < 470:
        cat, color = "Borderline prolonged", "yellow"
    elif qtc < 500:
        cat, color = "Prolonged \u2014 review medications", "orange"
    else:
        cat, color = "Markedly prolonged \u2014 high risk of Torsades", "red"

    return {
        "result": round(qtc),
        "unit": "ms",
        "category": cat,
        "color": color,
        "interpretation": f"QTc (Bazett) {qtc:.0f} ms \u2014 {cat}. QTc >500 ms: significant risk of Torsades de Pointes.",
        "formula": "QTc = QT / \u221a(RR in seconds); RR = 60/HR",
    }


def calc_pediatric_dose(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Pediatric dose by weight."""
    weight = float(inputs["weight_kg"])
    dose_per_kg = float(inputs["dose_per_kg"])
    frequency = int(inputs.get("frequency_per_day", 1))
    unit = inputs.get("dose_unit", "mg")

    single_dose = weight * dose_per_kg
    daily_dose = single_dose * frequency

    max_dose = inputs.get("max_single_dose")
    capped = False
    if max_dose is not None:
        max_dose = float(max_dose)
        if single_dose > max_dose:
            single_dose = max_dose
            daily_dose = single_dose * frequency
            capped = True

    cap_note = " (capped at max single dose)" if capped else ""

    return {
        "result": round(single_dose, 1),
        "unit": unit,
        "category": "Pediatric dose",
        "color": "green",
        "interpretation": f"Single dose: {single_dose:.1f} {unit}{cap_note}. Daily total: {daily_dose:.1f} {unit}/day ({frequency}x/day).",
        "formula": "Weight(kg) \u00d7 dose_per_kg",
        "daily_dose": round(daily_dose, 1),
    }


def calc_iv_drip_rate(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """IV drip rate in drops/min."""
    volume_ml = float(inputs["volume_ml"])
    time_hours = float(inputs["time_hours"])
    drop_factor = float(inputs.get("drop_factor", 20))  # drops/mL (standard 20, micro 60)

    drops_per_min = (volume_ml * drop_factor) / (time_hours * 60)
    ml_per_hr = volume_ml / time_hours

    return {
        "result": round(drops_per_min),
        "unit": "drops/min",
        "category": "IV Drip Rate",
        "color": "green",
        "interpretation": f"{drops_per_min:.0f} drops/min ({ml_per_hr:.1f} mL/hr) using {int(drop_factor)} drops/mL set for {volume_ml:.0f} mL over {time_hours:.1f} hours.",
        "formula": "(Volume(mL) \u00d7 Drop factor) / (Time(hours) \u00d7 60)",
        "ml_per_hr": round(ml_per_hr, 1),
    }


def calc_wells_dvt(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Wells score for DVT probability."""
    score = 0.0
    score += int(inputs.get("active_cancer", 0))             # +1
    score += int(inputs.get("paralysis_paresis", 0))          # +1
    score += int(inputs.get("bedridden_gt3days_surgery", 0))  # +1
    score += int(inputs.get("tenderness_along_veins", 0))     # +1
    score += int(inputs.get("entire_leg_swollen", 0))         # +1
    score += int(inputs.get("calf_swelling_gt3cm", 0))        # +1
    score += int(inputs.get("pitting_edema", 0))              # +1
    score += int(inputs.get("collateral_veins", 0))           # +1
    score += int(inputs.get("previous_dvt", 0))               # +1
    score -= 2 * int(inputs.get("alternative_diagnosis", 0))  # -2

    if score <= 0:
        cat, color = "Low probability (~5%)", "green"
    elif score <= 2:
        cat, color = "Moderate probability (~17%)", "yellow"
    else:
        cat, color = "High probability (~53%)", "red"

    return {
        "result": int(score),
        "unit": "points",
        "category": cat,
        "color": color,
        "interpretation": f"Wells DVT score {int(score)} \u2014 {cat}. Low: D-dimer first. Moderate/High: proceed to compression ultrasound.",
        "formula": "Active cancer+1, Paralysis+1, Bedridden/surgery+1, Tenderness+1, Leg swollen+1, Calf>3cm+1, Pitting edema+1, Collateral veins+1, Previous DVT+1, Alternative dx likely \u22122",
    }


def calc_wells_pe(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Wells score for PE probability."""
    score = 0.0
    score += int(inputs.get("dvt_symptoms", 0)) * 3          # +3
    score += int(inputs.get("pe_most_likely", 0)) * 3         # +3
    score += int(inputs.get("heart_rate_gt100", 0)) * 1.5     # +1.5
    score += int(inputs.get("immobilization_surgery", 0)) * 1.5  # +1.5
    score += int(inputs.get("previous_dvt_pe", 0)) * 1.5      # +1.5
    score += int(inputs.get("hemoptysis", 0))                  # +1
    score += int(inputs.get("malignancy", 0))                  # +1

    if score < 2:
        cat, color = "Low probability", "green"
    elif score <= 6:
        cat, color = "Moderate probability", "yellow"
    else:
        cat, color = "High probability", "red"

    return {
        "result": round(score, 1),
        "unit": "points",
        "category": cat,
        "color": color,
        "interpretation": f"Wells PE score {score:.1f} \u2014 {cat}. Low: D-dimer to exclude. High: proceed to CTPA.",
        "formula": "DVT sx+3, PE most likely+3, HR>100+1.5, Immobilization/surgery+1.5, Previous DVT/PE+1.5, Hemoptysis+1, Malignancy+1",
    }


def calc_apgar(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """APGAR score for neonatal assessment."""
    appearance = int(inputs.get("appearance", 0))    # 0-2 (skin color)
    pulse = int(inputs.get("pulse", 0))              # 0-2
    grimace = int(inputs.get("grimace", 0))          # 0-2 (reflex irritability)
    activity = int(inputs.get("activity", 0))        # 0-2 (muscle tone)
    respiration = int(inputs.get("respiration", 0))  # 0-2

    for v in [appearance, pulse, grimace, activity, respiration]:
        v = max(0, min(v, 2))

    total = appearance + pulse + grimace + activity + respiration

    if total >= 7:
        cat, color = "Normal \u2014 routine care", "green"
    elif total >= 4:
        cat, color = "Moderately depressed \u2014 may need intervention", "orange"
    else:
        cat, color = "Severely depressed \u2014 immediate resuscitation", "red"

    return {
        "result": total,
        "unit": f"(A{appearance} P{pulse} G{grimace} A{activity} R{respiration})",
        "category": cat,
        "color": color,
        "interpretation": f"APGAR {total}/10 \u2014 {cat}. Reassess at 1 and 5 minutes.",
        "formula": "Appearance (0\u20132) + Pulse (0\u20132) + Grimace (0\u20132) + Activity (0\u20132) + Respiration (0\u20132)",
    }


# ---------------------------------------------------------------------------
# Calculator registry / metadata
# ---------------------------------------------------------------------------

CALCULATOR_LIST = [
    {
        "id": "bmi",
        "name": "BMI (Body Mass Index)",
        "category": "Anthropometry",
        "description": "Body Mass Index with Asian cutoffs (overweight \u226523, obese \u226525).",
        "inputs": [
            {"name": "weight_kg", "label": "Weight (kg)", "type": "number", "required": True},
            {"name": "height_cm", "label": "Height (cm)", "type": "number", "required": True},
        ],
    },
    {
        "id": "bsa",
        "name": "BSA (Body Surface Area)",
        "category": "Anthropometry",
        "description": "Mosteller formula for body surface area.",
        "inputs": [
            {"name": "weight_kg", "label": "Weight (kg)", "type": "number", "required": True},
            {"name": "height_cm", "label": "Height (cm)", "type": "number", "required": True},
        ],
    },
    {
        "id": "ibw",
        "name": "Ideal Body Weight",
        "category": "Anthropometry",
        "description": "Devine formula for ideal body weight.",
        "inputs": [
            {"name": "height_cm", "label": "Height (cm)", "type": "number", "required": True},
            {"name": "sex", "label": "Sex", "type": "select", "options": ["male", "female"], "required": True},
        ],
    },
    {
        "id": "abw",
        "name": "Adjusted Body Weight",
        "category": "Anthropometry",
        "description": "Adjusted body weight for drug dosing in obesity.",
        "inputs": [
            {"name": "weight_kg", "label": "Actual Weight (kg)", "type": "number", "required": True},
            {"name": "height_cm", "label": "Height (cm)", "type": "number", "required": True},
            {"name": "sex", "label": "Sex", "type": "select", "options": ["male", "female"], "required": True},
        ],
    },
    {
        "id": "crcl",
        "name": "Creatinine Clearance (Cockcroft-Gault)",
        "category": "Renal",
        "description": "Cockcroft-Gault CrCl with renal dose adjustment table.",
        "inputs": [
            {"name": "age", "label": "Age (years)", "type": "number", "required": True},
            {"name": "weight_kg", "label": "Weight (kg)", "type": "number", "required": True},
            {"name": "serum_creatinine", "label": "Serum Creatinine (mg/dL)", "type": "number", "required": True},
            {"name": "sex", "label": "Sex", "type": "select", "options": ["male", "female"], "required": True},
        ],
    },
    {
        "id": "egfr",
        "name": "eGFR (CKD-EPI 2021)",
        "category": "Renal",
        "description": "CKD-EPI 2021 race-free eGFR equation.",
        "inputs": [
            {"name": "age", "label": "Age (years)", "type": "number", "required": True},
            {"name": "serum_creatinine", "label": "Serum Creatinine (mg/dL)", "type": "number", "required": True},
            {"name": "sex", "label": "Sex", "type": "select", "options": ["male", "female"], "required": True},
        ],
    },
    {
        "id": "corrected_calcium",
        "name": "Corrected Calcium",
        "category": "Electrolytes",
        "description": "Calcium corrected for albumin level.",
        "inputs": [
            {"name": "calcium", "label": "Serum Calcium (mg/dL)", "type": "number", "required": True},
            {"name": "albumin", "label": "Serum Albumin (g/dL)", "type": "number", "required": True},
        ],
    },
    {
        "id": "anion_gap",
        "name": "Anion Gap",
        "category": "Electrolytes",
        "description": "Anion gap corrected for albumin.",
        "inputs": [
            {"name": "sodium", "label": "Sodium (mEq/L)", "type": "number", "required": True},
            {"name": "chloride", "label": "Chloride (mEq/L)", "type": "number", "required": True},
            {"name": "bicarbonate", "label": "Bicarbonate (mEq/L)", "type": "number", "required": True},
            {"name": "albumin", "label": "Albumin (g/dL)", "type": "number", "required": False, "default": 4.0},
        ],
    },
    {
        "id": "corrected_sodium",
        "name": "Corrected Sodium",
        "category": "Electrolytes",
        "description": "Sodium corrected for hyperglycemia.",
        "inputs": [
            {"name": "sodium", "label": "Sodium (mEq/L)", "type": "number", "required": True},
            {"name": "glucose", "label": "Glucose (mg/dL)", "type": "number", "required": True},
        ],
    },
    {
        "id": "serum_osmolality",
        "name": "Serum Osmolality",
        "category": "Electrolytes",
        "description": "Calculated serum osmolality.",
        "inputs": [
            {"name": "sodium", "label": "Sodium (mEq/L)", "type": "number", "required": True},
            {"name": "glucose", "label": "Glucose (mg/dL)", "type": "number", "required": True},
            {"name": "bun", "label": "BUN (mg/dL)", "type": "number", "required": True},
        ],
    },
    {
        "id": "meld",
        "name": "MELD Score",
        "category": "Hepatology",
        "description": "Model for End-Stage Liver Disease score with MELD-Na.",
        "inputs": [
            {"name": "creatinine", "label": "Creatinine (mg/dL)", "type": "number", "required": True},
            {"name": "bilirubin", "label": "Total Bilirubin (mg/dL)", "type": "number", "required": True},
            {"name": "inr", "label": "INR", "type": "number", "required": True},
            {"name": "sodium", "label": "Sodium (mEq/L)", "type": "number", "required": False, "default": 140},
        ],
    },
    {
        "id": "cha2ds2vasc",
        "name": "CHA\u2082DS\u2082-VASc",
        "category": "Cardiology",
        "description": "Stroke risk score for atrial fibrillation (0\u20139).",
        "inputs": [
            {"name": "chf", "label": "CHF / LV dysfunction", "type": "bool", "required": False},
            {"name": "hypertension", "label": "Hypertension", "type": "bool", "required": False},
            {"name": "age_75_plus", "label": "Age \u2265 75", "type": "bool", "required": False},
            {"name": "diabetes", "label": "Diabetes", "type": "bool", "required": False},
            {"name": "stroke_tia", "label": "Prior Stroke / TIA / Thromboembolism", "type": "bool", "required": False},
            {"name": "vascular_disease", "label": "Vascular disease (MI, PAD, aortic plaque)", "type": "bool", "required": False},
            {"name": "age_65_74", "label": "Age 65\u201374", "type": "bool", "required": False},
            {"name": "female", "label": "Female sex", "type": "bool", "required": False},
        ],
    },
    {
        "id": "hasbled",
        "name": "HAS-BLED",
        "category": "Cardiology",
        "description": "Bleeding risk score for anticoagulation decisions (0\u20139).",
        "inputs": [
            {"name": "hypertension_uncontrolled", "label": "Uncontrolled hypertension (SBP >160)", "type": "bool", "required": False},
            {"name": "renal_disease", "label": "Renal disease (dialysis, transplant, Cr >2.26)", "type": "bool", "required": False},
            {"name": "liver_disease", "label": "Liver disease (cirrhosis, bilirubin >2\u00d7ULN)", "type": "bool", "required": False},
            {"name": "stroke_history", "label": "Stroke history", "type": "bool", "required": False},
            {"name": "bleeding_history", "label": "Prior major bleeding", "type": "bool", "required": False},
            {"name": "labile_inr", "label": "Labile INR (TTR <60%)", "type": "bool", "required": False},
            {"name": "elderly_65", "label": "Elderly (age >65)", "type": "bool", "required": False},
            {"name": "drugs_antiplatelet_nsaid", "label": "Drugs (antiplatelet / NSAID)", "type": "bool", "required": False},
            {"name": "alcohol", "label": "Alcohol excess (\u22658 drinks/week)", "type": "bool", "required": False},
        ],
    },
    {
        "id": "curb65",
        "name": "CURB-65",
        "category": "Pulmonology",
        "description": "Community-acquired pneumonia severity score.",
        "inputs": [
            {"name": "confusion", "label": "Confusion (new onset)", "type": "bool", "required": False},
            {"name": "bun_gt19", "label": "BUN > 19 mg/dL (Urea > 7 mmol/L)", "type": "bool", "required": False},
            {"name": "rr_gte30", "label": "Respiratory rate \u2265 30", "type": "bool", "required": False},
            {"name": "bp_low", "label": "BP: SBP <90 or DBP \u226460", "type": "bool", "required": False},
            {"name": "age_gte65", "label": "Age \u2265 65", "type": "bool", "required": False},
        ],
    },
    {
        "id": "gcs",
        "name": "Glasgow Coma Scale",
        "category": "Neurology",
        "description": "GCS: Eye + Verbal + Motor (3\u201315).",
        "inputs": [
            {"name": "eye", "label": "Eye opening (1\u20134)", "type": "number", "required": True, "min": 1, "max": 4},
            {"name": "verbal", "label": "Verbal response (1\u20135)", "type": "number", "required": True, "min": 1, "max": 5},
            {"name": "motor", "label": "Motor response (1\u20136)", "type": "number", "required": True, "min": 1, "max": 6},
        ],
    },
    {
        "id": "parkland",
        "name": "Parkland Formula (Burns)",
        "category": "Emergency",
        "description": "Fluid resuscitation for burns: 4 \u00d7 Weight \u00d7 %TBSA.",
        "inputs": [
            {"name": "weight_kg", "label": "Weight (kg)", "type": "number", "required": True},
            {"name": "tbsa_percent", "label": "%TBSA burned", "type": "number", "required": True},
        ],
    },
    {
        "id": "qtc",
        "name": "QTc (Corrected QT)",
        "category": "Cardiology",
        "description": "Bazett-corrected QT interval.",
        "inputs": [
            {"name": "qt_ms", "label": "QT interval (ms)", "type": "number", "required": True},
            {"name": "heart_rate", "label": "Heart rate (bpm)", "type": "number", "required": True},
        ],
    },
    {
        "id": "pediatric_dose",
        "name": "Pediatric Dose Calculator",
        "category": "Pediatrics",
        "description": "Weight-based pediatric drug dosing.",
        "inputs": [
            {"name": "weight_kg", "label": "Weight (kg)", "type": "number", "required": True},
            {"name": "dose_per_kg", "label": "Dose per kg", "type": "number", "required": True},
            {"name": "frequency_per_day", "label": "Frequency (times/day)", "type": "number", "required": False, "default": 1},
            {"name": "dose_unit", "label": "Dose unit", "type": "text", "required": False, "default": "mg"},
            {"name": "max_single_dose", "label": "Max single dose (optional)", "type": "number", "required": False},
        ],
    },
    {
        "id": "iv_drip_rate",
        "name": "IV Drip Rate",
        "category": "Nursing",
        "description": "IV infusion drip rate in drops/min.",
        "inputs": [
            {"name": "volume_ml", "label": "Volume (mL)", "type": "number", "required": True},
            {"name": "time_hours", "label": "Time (hours)", "type": "number", "required": True},
            {"name": "drop_factor", "label": "Drop factor (drops/mL)", "type": "number", "required": False, "default": 20},
        ],
    },
    {
        "id": "wells_dvt",
        "name": "Wells Score (DVT)",
        "category": "Hematology",
        "description": "Wells criteria for DVT probability.",
        "inputs": [
            {"name": "active_cancer", "label": "Active cancer (treatment within 6 months)", "type": "bool", "required": False},
            {"name": "paralysis_paresis", "label": "Paralysis, paresis, or recent cast", "type": "bool", "required": False},
            {"name": "bedridden_gt3days_surgery", "label": "Bedridden >3 days or major surgery within 12 weeks", "type": "bool", "required": False},
            {"name": "tenderness_along_veins", "label": "Localized tenderness along deep venous system", "type": "bool", "required": False},
            {"name": "entire_leg_swollen", "label": "Entire leg swollen", "type": "bool", "required": False},
            {"name": "calf_swelling_gt3cm", "label": "Calf swelling >3 cm compared to other leg", "type": "bool", "required": False},
            {"name": "pitting_edema", "label": "Pitting edema (greater in symptomatic leg)", "type": "bool", "required": False},
            {"name": "collateral_veins", "label": "Collateral superficial veins (non-varicose)", "type": "bool", "required": False},
            {"name": "previous_dvt", "label": "Previously documented DVT", "type": "bool", "required": False},
            {"name": "alternative_diagnosis", "label": "Alternative diagnosis as likely or more likely", "type": "bool", "required": False},
        ],
    },
    {
        "id": "wells_pe",
        "name": "Wells Score (PE)",
        "category": "Pulmonology",
        "description": "Wells criteria for pulmonary embolism probability.",
        "inputs": [
            {"name": "dvt_symptoms", "label": "Clinical signs/symptoms of DVT", "type": "bool", "required": False},
            {"name": "pe_most_likely", "label": "PE is #1 diagnosis or equally likely", "type": "bool", "required": False},
            {"name": "heart_rate_gt100", "label": "Heart rate > 100", "type": "bool", "required": False},
            {"name": "immobilization_surgery", "label": "Immobilization or surgery in past 4 weeks", "type": "bool", "required": False},
            {"name": "previous_dvt_pe", "label": "Previous DVT/PE", "type": "bool", "required": False},
            {"name": "hemoptysis", "label": "Hemoptysis", "type": "bool", "required": False},
            {"name": "malignancy", "label": "Malignancy (treatment within 6 months)", "type": "bool", "required": False},
        ],
    },
    {
        "id": "apgar",
        "name": "APGAR Score",
        "category": "Neonatology",
        "description": "Neonatal assessment score (0\u201310).",
        "inputs": [
            {"name": "appearance", "label": "Appearance / Skin color (0\u20132)", "type": "number", "required": True, "min": 0, "max": 2},
            {"name": "pulse", "label": "Pulse / Heart rate (0\u20132)", "type": "number", "required": True, "min": 0, "max": 2},
            {"name": "grimace", "label": "Grimace / Reflex irritability (0\u20132)", "type": "number", "required": True, "min": 0, "max": 2},
            {"name": "activity", "label": "Activity / Muscle tone (0\u20132)", "type": "number", "required": True, "min": 0, "max": 2},
            {"name": "respiration", "label": "Respiration (0\u20132)", "type": "number", "required": True, "min": 0, "max": 2},
        ],
    },
]


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

_CALC_MAP = {
    "bmi": calc_bmi,
    "bsa": calc_bsa,
    "ibw": calc_ibw,
    "abw": calc_abw,
    "crcl": calc_crcl,
    "egfr": calc_egfr_ckdepi,
    "corrected_calcium": calc_corrected_calcium,
    "anion_gap": calc_anion_gap,
    "corrected_sodium": calc_corrected_sodium,
    "serum_osmolality": calc_serum_osmolality,
    "meld": calc_meld,
    "cha2ds2vasc": calc_cha2ds2vasc,
    "hasbled": calc_hasbled,
    "curb65": calc_curb65,
    "gcs": calc_gcs,
    "parkland": calc_parkland,
    "qtc": calc_qtc,
    "pediatric_dose": calc_pediatric_dose,
    "iv_drip_rate": calc_iv_drip_rate,
    "wells_dvt": calc_wells_dvt,
    "wells_pe": calc_wells_pe,
    "apgar": calc_apgar,
}


def calculate(calculator_id: str, inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Dispatch to the correct calculator function.

    Returns the calculator result dict or an error dict.
    """
    fn = _CALC_MAP.get(calculator_id)
    if fn is None:
        return {
            "error": True,
            "message": f"Unknown calculator: {calculator_id}",
            "available": list(_CALC_MAP.keys()),
        }
    try:
        return fn(inputs)
    except (KeyError, TypeError) as exc:
        return {
            "error": True,
            "message": f"Missing or invalid input: {exc}",
            "calculator": calculator_id,
        }
    except (ValueError, ZeroDivisionError) as exc:
        return {
            "error": True,
            "message": f"Calculation error: {exc}",
            "calculator": calculator_id,
        }
