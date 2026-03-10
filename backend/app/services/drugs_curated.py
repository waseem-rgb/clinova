# backend/app/services/drugs_curated.py
"""
Curated Drug Database Service — replaces RAG-based drug lookup.
Uses hand-curated clinical data for reliable, instant drug info.
"""
from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from itertools import combinations
from typing import Any, Dict, List, Optional, Tuple

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
DRUGS_FILE = os.path.join(DATA_DIR, "curated_drugs.json")
INTERACTIONS_FILE = os.path.join(DATA_DIR, "curated_interactions.json")
BRANDS_FILE = os.path.join(DATA_DIR, "india_brands.json")


# ── Data Loading ────────────────────────────────────────────────


@lru_cache(maxsize=1)
def _load_drugs() -> Dict[str, Any]:
    with open(DRUGS_FILE, "r") as f:
        data = json.load(f)
    return data.get("drugs", {})


@lru_cache(maxsize=1)
def _load_interactions() -> Dict[str, Any]:
    with open(INTERACTIONS_FILE, "r") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def _load_brands() -> Dict[str, Any]:
    with open(BRANDS_FILE, "r") as f:
        data = json.load(f)
    return data.get("generics", {})


def _normalize(name: str) -> str:
    """Lowercase, strip, collapse whitespace, handle underscores."""
    return re.sub(r"\s+", " ", name.lower().strip().replace("_", " ").replace("-", " "))


# ── Indian Prescription Pattern Handling ────────────────────────

# Common prescription prefixes doctors write: "Tab Glycomet", "Inj Monocef", "T. Augmentin"
_PREFIXES_TO_STRIP = [
    "tab", "tab.", "tablet", "tablets",
    "cap", "cap.", "capsule", "capsules",
    "inj", "inj.", "injection",
    "syr", "syr.", "syrup",
    "drops", "drop",
    "oint", "oint.", "ointment",
    "cream", "gel", "lotion", "patch",
    "neb", "neb.", "nebulization", "nebulisation",
    "inhaler", "inh", "inh.",
    "supp", "suppository",
    "t.", "c.", "i.", "s.",
]


def _clean_search_query(query: str) -> str:
    """Strip prescription prefixes and trailing strengths from search query.

    Examples:
        "Tab Glycomet GP 2"  →  "glycomet gp"
        "Inj Monocef 1g"    →  "monocef"
        "Ecosprin AV 75/10" →  "ecosprin av"
        "T. Augmentin 625"  →  "augmentin"
    """
    q = query.strip().lower()

    # Strip prefix
    for prefix in _PREFIXES_TO_STRIP:
        if q.startswith(prefix + " ") or q.startswith(prefix + "."):
            q = q[len(prefix):].lstrip(". ")
            break

    # Strip trailing strength: "650", "500mg", "1g", "75/10", "4.5g"
    q = re.sub(r"\s+\d+(\.\d+)?(/\d+(\.\d+)?)?\s*(mg|mcg|g|ml|iu|u|units?)?\s*$", "", q, flags=re.IGNORECASE)

    return q.strip()


# ── Search Index ────────────────────────────────────────────────


@lru_cache(maxsize=1)
def _build_search_index() -> List[Dict[str, str]]:
    """Build a flat list of searchable entries (generic + brand names)."""
    drugs = _load_drugs()
    brands = _load_brands()
    entries: List[Dict[str, str]] = []

    for key, drug in drugs.items():
        generic = drug.get("generic_name", key)
        drug_class = drug.get("drug_class", "")
        forms = drug.get("forms", [])
        form_str = forms[0] if forms else ""

        # Add generic name entry
        entries.append({
            "display": f"{generic} — {drug_class}",
            "input": generic,
            "canonical": key,
            "type": "generic",
        })

        # Add brand entries from curated data
        for brand in drug.get("brands_india", []):
            entries.append({
                "display": f"{brand} ({generic}) — {form_str}" if form_str else f"{brand} ({generic})",
                "input": brand,
                "canonical": key,
                "type": "brand",
            })

    # Also add brands from india_brands.json that aren't already in curated drugs
    for generic_key, info in brands.items():
        norm_key = _normalize(generic_key)
        if norm_key not in drugs and norm_key.replace(" ", "_") not in drugs:
            for brand in info.get("brands", []):
                forms_list = info.get("forms_strengths", [])
                form_str = forms_list[0] if forms_list else ""
                entries.append({
                    "display": f"{brand} ({generic_key}) — {form_str}" if form_str else f"{brand} ({generic_key})",
                    "input": brand,
                    "canonical": norm_key,
                    "type": "brand",
                })

    return entries


# ── Public API: Search ──────────────────────────────────────────


def search_suggestions(query: str, limit: int = 12) -> List[Dict[str, str]]:
    """Return drug name suggestions matching query prefix/substring.

    Handles Indian prescription patterns like:
        "Tab Glycomet GP 2"  → matches metformin_glimepiride
        "Inj Monocef 1g"    → matches ceftriaxone
    """
    if not query or len(query) < 1:
        return []

    q = _normalize(_clean_search_query(query))
    if not q:
        return []
    index = _build_search_index()
    scored: List[Tuple[int, Dict[str, str]]] = []

    for entry in index:
        display_lower = entry["display"].lower()
        input_lower = entry["input"].lower()
        canonical_lower = entry["canonical"].lower()

        # Prefix match on input name (highest priority)
        if input_lower.startswith(q):
            scored.append((0, entry))
        elif canonical_lower.startswith(q):
            scored.append((1, entry))
        elif q in input_lower:
            scored.append((2, entry))
        elif q in display_lower:
            scored.append((3, entry))

    scored.sort(key=lambda x: (x[0], x[1]["display"]))
    seen: set = set()
    results: List[Dict[str, str]] = []
    for _, entry in scored:
        key = (entry["canonical"], entry["type"], entry["input"])
        if key not in seen:
            seen.add(key)
            results.append(entry)
            if len(results) >= limit:
                break
    return results


# ── Public API: Resolve Name ────────────────────────────────────


def resolve_name(name: str) -> Dict[str, Any]:
    """Resolve a drug name (generic or brand) to canonical key.
    Handles prescription patterns like 'Tab Glycomet 500'."""
    drugs = _load_drugs()
    brands = _load_brands()
    q = _normalize(_clean_search_query(name))

    # Direct match on curated drug keys
    if q in drugs:
        return {"canonical": q, "matched": q, "confidence": 1.0}

    # Underscore variant
    q_under = q.replace(" ", "_")
    if q_under in drugs:
        return {"canonical": q_under, "matched": q, "confidence": 1.0}

    # Search brand names in curated drugs
    for key, drug in drugs.items():
        for brand in drug.get("brands_india", []):
            if _normalize(brand) == q:
                return {"canonical": key, "matched": brand, "confidence": 0.95}

    # Search india_brands.json
    for generic_key, info in brands.items():
        for brand in info.get("brands", []):
            if _normalize(brand) == q:
                norm_key = _normalize(generic_key)
                return {"canonical": norm_key, "matched": brand, "confidence": 0.90}

    # Fuzzy: check if query is substring of any drug name
    for key in drugs:
        if q in key or key in q:
            return {"canonical": key, "matched": name, "confidence": 0.7}

    return {"canonical": q, "matched": name, "confidence": 0.3}


# ── Public API: Drug Details ────────────────────────────────────


def get_drug_details(name: str) -> Optional[Dict[str, Any]]:
    """Get full clinical details for a drug. Returns None if not found in curated DB."""
    resolved = resolve_name(name)
    canonical = resolved["canonical"]
    drugs = _load_drugs()

    drug = drugs.get(canonical)
    if not drug:
        # Try underscore variant
        drug = drugs.get(canonical.replace(" ", "_"))
    if not drug:
        return None

    # Build response matching DrugDetailsResponse schema
    header = {
        "canonical_generic_name": drug.get("generic_name", canonical),
        "drug_class": drug.get("drug_class", ""),
        "common_brand_names": drug.get("brands_india", []),
        "quick_flags": drug.get("quick_flags", []),
    }

    # Executive summary cards
    cards = []
    if drug.get("mechanism"):
        cards.append({"title": "Mechanism", "value": drug["mechanism"]})
    if drug.get("indications"):
        cards.append({"title": "Key Indications", "value": "; ".join(drug["indications"][:4])})
    if drug.get("contraindications"):
        cards.append({"title": "Contraindications", "value": "; ".join(drug["contraindications"][:3])})
    dosing = drug.get("dosing", {})
    if dosing.get("adult"):
        cards.append({"title": "Adult Dosing", "value": dosing["adult"]})
    if drug.get("pregnancy_lactation"):
        cards.append({"title": "Pregnancy & Lactation", "value": drug["pregnancy_lactation"]})

    # Sections
    sections = []

    if drug.get("indications"):
        sections.append({
            "key": "indications",
            "title": "Indications",
            "bullets": drug["indications"],
            "citations": ["Curated clinical database"],
        })

    if drug.get("contraindications"):
        sections.append({
            "key": "contraindications",
            "title": "Contraindications",
            "bullets": drug["contraindications"],
            "citations": ["Curated clinical database"],
        })

    if dosing:
        dose_bullets = []
        for ctx, val in dosing.items():
            label = ctx.replace("_", " ").title()
            dose_bullets.append(f"**{label}**: {val}")
        sections.append({
            "key": "dosing",
            "title": "Dosing & Administration",
            "bullets": dose_bullets,
            "citations": ["Curated clinical database"],
        })

    if drug.get("adverse_effects"):
        sections.append({
            "key": "adverse_effects",
            "title": "Adverse Effects",
            "bullets": drug["adverse_effects"],
            "citations": ["Curated clinical database"],
        })

    if drug.get("monitoring"):
        sections.append({
            "key": "monitoring",
            "title": "Monitoring",
            "bullets": drug["monitoring"],
            "citations": ["Curated clinical database"],
        })

    if drug.get("pregnancy_lactation"):
        sections.append({
            "key": "pregnancy",
            "title": "Pregnancy & Lactation",
            "bullets": [drug["pregnancy_lactation"]],
            "citations": ["Curated clinical database"],
        })

    # Brands & prices
    brands_rows = []
    for brand in drug.get("brands_india", []):
        for form in drug.get("forms", []):
            brands_rows.append({
                "brand": brand,
                "strength": form,
                "form": form.split()[-1] if form else "",
                "pack": "",
                "price": "",
            })

    return {
        "header": header,
        "executive_summary_cards": cards,
        "sections": sections,
        "brands_and_prices": {"rows": brands_rows},
        "evidence": [{"book": "Curated Clinical Database", "page_start": None, "snippet": "Clinically verified drug monograph", "chunk_id": f"curated_{canonical}"}],
        "coverage_gate": {"passed": True, "missing_chunk_ids": []},
        "source": "curated",
    }


# ── Public API: Interaction Check ───────────────────────────────


def _get_drug_classes(drug_name: str) -> List[str]:
    """Return class labels a drug belongs to."""
    idata = _load_interactions()
    classes = idata.get("drug_classes", {})
    norm = _normalize(drug_name)
    result = []
    for class_name, members in classes.items():
        if norm in [_normalize(m) for m in members]:
            result.append(class_name)
    return result


def _match_interaction(drug_a: str, drug_b: str, rule: Dict[str, Any]) -> bool:
    """Check if a drug pair matches an interaction rule (direct or class-based)."""
    ra = _normalize(rule["drug_a"])
    rb = _normalize(rule["drug_b"])
    na = _normalize(drug_a)
    nb = _normalize(drug_b)

    classes_a = _get_drug_classes(drug_a)
    classes_b = _get_drug_classes(drug_b)

    also = rule.get("also_applies_to", {})
    class_a_rule = also.get("drug_a_class")
    class_b_rule = also.get("drug_b_class")

    # Direct name match (either order)
    if (na == ra and nb == rb) or (na == rb and nb == ra):
        return True

    # Class-based matching
    a_matches = (na == ra) or (class_a_rule and class_a_rule in classes_a)
    b_matches = (nb == rb) or (class_b_rule and class_b_rule in classes_b)
    if a_matches and b_matches:
        return True

    # Try reversed
    a_matches_rev = (na == rb) or (class_b_rule and class_b_rule in classes_a)
    b_matches_rev = (nb == ra) or (class_a_rule and class_a_rule in classes_b)
    if a_matches_rev and b_matches_rev:
        return True

    return False


def check_interactions(drug_names: List[str]) -> Dict[str, Any]:
    """Check all pairwise interactions for a list of drugs."""
    idata = _load_interactions()
    rules = idata.get("interactions", [])

    resolved_drugs = []
    for name in drug_names:
        r = resolve_name(name)
        resolved_drugs.append({
            "input": name,
            "resolved_generic": r["canonical"],
        })

    found_interactions: List[Dict[str, Any]] = []
    severity_order = {"Contraindicated": 4, "Major": 3, "Moderate": 2, "Minor": 1}
    max_severity = 0

    # Check all pairs
    resolved_names = [d["resolved_generic"] for d in resolved_drugs]
    for a, b in combinations(range(len(resolved_names)), 2):
        name_a = resolved_names[a]
        name_b = resolved_names[b]
        input_a = drug_names[a]
        input_b = drug_names[b]

        for rule in rules:
            if _match_interaction(name_a, name_b, rule):
                sev = rule.get("severity", "Unknown")
                sev_num = severity_order.get(sev, 0)
                if sev_num > max_severity:
                    max_severity = sev_num

                interaction = {
                    "pair": [input_a, input_b],
                    "severity": sev,
                    "mechanism": rule.get("mechanism", ""),
                    "clinical_effect": rule.get("clinical_effect", ""),
                    "management": rule.get("management", ""),
                    "monitoring": rule.get("monitoring", []),
                    "evidence_level": rule.get("evidence_level", ""),
                    "references": rule.get("references", []),
                    "rule_based": True,
                }
                found_interactions.append(interaction)

    # Determine overall risk
    risk_map = {0: "No known interactions", 1: "Minor", 2: "Moderate", 3: "Major", 4: "Contraindicated"}
    overall_risk = risk_map.get(max_severity, "Not assessed")

    # Build summary
    if not found_interactions:
        summary = f"No known clinically significant interactions found between {', '.join(drug_names)}."
    else:
        summary_parts = []
        for ix in found_interactions:
            summary_parts.append(f"{ix['pair'][0]} + {ix['pair'][1]}: {ix['severity']} — {ix['clinical_effect']}")
        summary = "; ".join(summary_parts)

    # Build combined risks (group by mechanism type)
    combined_risks = []
    qt_drugs = []
    bleeding_drugs = []
    serotonin_drugs = []
    nephro_drugs = []
    hyperk_drugs = []

    idata_classes = idata.get("drug_classes", {})

    for name in resolved_names:
        classes = _get_drug_classes(name)
        # Check if QT risk
        for ix in found_interactions:
            mechanism = ix.get("mechanism", "").lower()
            if "qt" in mechanism:
                for d in ix["pair"]:
                    if d not in qt_drugs:
                        qt_drugs.append(d)
            if "bleed" in mechanism:
                for d in ix["pair"]:
                    if d not in bleeding_drugs:
                        bleeding_drugs.append(d)
            if "serotonin" in mechanism:
                for d in ix["pair"]:
                    if d not in serotonin_drugs:
                        serotonin_drugs.append(d)
            if "nephro" in mechanism or "kidney" in mechanism or "renal" in mechanism:
                for d in ix["pair"]:
                    if d not in nephro_drugs:
                        nephro_drugs.append(d)
            if "hyperkalemia" in mechanism or "potassium" in mechanism:
                for d in ix["pair"]:
                    if d not in hyperk_drugs:
                        hyperk_drugs.append(d)

    if qt_drugs:
        combined_risks.append({
            "risk_type": "QT Prolongation",
            "explanation": "Multiple drugs in this combination can prolong the QT interval",
            "implicated_drugs": qt_drugs,
            "monitoring": "Baseline ECG, serial QTc measurement, correct electrolytes",
        })
    if bleeding_drugs:
        combined_risks.append({
            "risk_type": "Bleeding Risk",
            "explanation": "Multiple drugs increase bleeding risk through different mechanisms",
            "implicated_drugs": bleeding_drugs,
            "monitoring": "CBC, signs of bleeding, INR if on warfarin, stool guaiac",
        })
    if serotonin_drugs:
        combined_risks.append({
            "risk_type": "Serotonin Syndrome",
            "explanation": "Multiple serotonergic agents increase risk of serotonin syndrome",
            "implicated_drugs": serotonin_drugs,
            "monitoring": "Mental status, temperature, neuromuscular exam, vital signs",
        })
    if nephro_drugs:
        combined_risks.append({
            "risk_type": "Nephrotoxicity",
            "explanation": "Combination increases risk of acute kidney injury",
            "implicated_drugs": nephro_drugs,
            "monitoring": "Creatinine, BUN, urine output, electrolytes",
        })
    if hyperk_drugs:
        combined_risks.append({
            "risk_type": "Hyperkalemia",
            "explanation": "Multiple drugs that retain potassium",
            "implicated_drugs": hyperk_drugs,
            "monitoring": "Serum potassium, ECG if K+ >5.5, renal function",
        })

    # Monitoring recommendations
    all_monitoring: List[str] = []
    for ix in found_interactions:
        mon = ix.get("monitoring", [])
        if isinstance(mon, list):
            for m in mon:
                if m not in all_monitoring:
                    all_monitoring.append(m)
        elif isinstance(mon, str) and mon not in all_monitoring:
            all_monitoring.append(mon)

    return {
        "drugs": drug_names,
        "drugs_resolved": resolved_drugs,
        "overall_risk_level": overall_risk,
        "summary": summary,
        "interactions": found_interactions,
        "combined_risks": combined_risks,
        "monitoring": all_monitoring,
        "safer_alternatives": [],
        "evidence": [{"book": "Curated Interaction Database", "page_start": None, "snippet": "Clinically verified drug interaction rules", "chunk_id": "curated_interactions"}],
        "coverage_gate": {"passed": True, "missing_chunk_ids": []},
        "source": "curated",
    }


# ── Public API: Category Browsing ──────────────────────────────


# Map drug_class strings to broader therapeutic categories
_CLASS_TO_CATEGORY = {
    "antidiabetic": "Diabetes",
    "biguanide": "Diabetes",
    "sulfonylurea": "Diabetes",
    "dpp-4": "Diabetes",
    "sglt2": "Diabetes",
    "thiazolidinedione": "Diabetes",
    "insulin": "Diabetes",
    "statin": "Cardiovascular",
    "hmg-coa": "Cardiovascular",
    "ace inhibitor": "Cardiovascular",
    "arb": "Cardiovascular",
    "angiotensin": "Cardiovascular",
    "calcium channel": "Cardiovascular",
    "beta-blocker": "Cardiovascular",
    "beta blocker": "Cardiovascular",
    "diuretic": "Cardiovascular",
    "loop diuretic": "Cardiovascular",
    "thiazide": "Cardiovascular",
    "aldosterone": "Cardiovascular",
    "cardiac glycoside": "Cardiovascular",
    "alpha-1": "Cardiovascular",
    "alpha-2": "Cardiovascular",
    "anticoagulant": "Anticoagulants & Antithrombotics",
    "antiplatelet": "Anticoagulants & Antithrombotics",
    "heparin": "Anticoagulants & Antithrombotics",
    "thrombolytic": "Anticoagulants & Antithrombotics",
    "factor xa": "Anticoagulants & Antithrombotics",
    "thrombin": "Anticoagulants & Antithrombotics",
    "vitamin k": "Anticoagulants & Antithrombotics",
    "antibiotic": "Antibiotics",
    "penicillin": "Antibiotics",
    "cephalosporin": "Antibiotics",
    "fluoroquinolone": "Antibiotics",
    "macrolide": "Antibiotics",
    "aminoglycoside": "Antibiotics",
    "tetracycline": "Antibiotics",
    "carbapenem": "Antibiotics",
    "glycopeptide": "Antibiotics",
    "oxazolidinone": "Antibiotics",
    "nitroimidazole": "Antibiotics",
    "lincosamide": "Antibiotics",
    "polymyxin": "Antibiotics",
    "nitrofuran": "Antibiotics",
    "phosphonic": "Antibiotics",
    "trimethoprim": "Antibiotics",
    "rifamycin": "Antibiotics",
    "antifungal": "Antifungals",
    "azole": "Antifungals",
    "polyene": "Antifungals",
    "allylamine": "Antifungals",
    "corticosteroid": "Corticosteroids",
    "glucocorticoid": "Corticosteroids",
    "anticonvulsant": "Antiepileptics",
    "antiepileptic": "Antiepileptics",
    "hydantoin": "Antiepileptics",
    "gabapentinoid": "Antiepileptics & Pain",
    "antipsychotic": "Psychiatry",
    "mood stabilizer": "Psychiatry",
    "ssri": "Psychiatry",
    "snri": "Psychiatry",
    "tca": "Psychiatry",
    "antidepressant": "Psychiatry",
    "nassa": "Psychiatry",
    "ndri": "Psychiatry",
    "benzodiazepine": "Psychiatry",
    "opioid": "Pain & Analgesia",
    "analgesic": "Pain & Analgesia",
    "antipyretic": "Pain & Analgesia",
    "nsaid": "Pain & Analgesia",
    "cox-2": "Pain & Analgesia",
    "dmard": "Rheumatology",
    "antimalarial": "Rheumatology",
    "xanthine oxidase": "Rheumatology",
    "microtubule": "Rheumatology",
    "ppi": "Gastroenterology",
    "proton pump": "Gastroenterology",
    "h2 receptor": "Gastroenterology",
    "antiemetic": "Gastroenterology",
    "5-ht3": "Gastroenterology",
    "prokinetic": "Gastroenterology",
    "dopamine d2 antagonist": "Gastroenterology",
    "laxative": "Gastroenterology",
    "bile acid": "Gastroenterology",
    "aminosalicylate": "Gastroenterology",
    "mucosal": "Gastroenterology",
    "antidiarrheal": "Gastroenterology",
    "thyroid": "Endocrine",
    "antithyroid": "Endocrine",
    "bronchodilator": "Respiratory",
    "beta-2 agonist": "Respiratory",
    "saba": "Respiratory",
    "laba": "Respiratory",
    "lama": "Respiratory",
    "muscarinic": "Respiratory",
    "leukotriene": "Respiratory",
    "methylxanthine": "Respiratory",
    "inhaled corticosteroid": "Respiratory",
    "antihistamine": "Allergy & Respiratory",
    "h1 blocker": "Allergy & Respiratory",
    "ophthalmic": "Ophthalmology",
    "retinoid": "Dermatology",
    "topical": "Dermatology",
    "pyrethroid": "Dermatology",
    "vasopressor": "Emergency & Critical Care",
    "adrenergic": "Emergency & Critical Care",
    "anticholinergic": "Emergency & Critical Care",
    "adsorbent": "Emergency & Critical Care",
    "oxytocic": "Obstetrics",
    "prostaglandin": "Obstetrics",
    "electrolyte": "Obstetrics",
    "steroid hormone": "Obstetrics",
    "fdc": "Fixed-Dose Combinations",
    "combination": "Fixed-Dose Combinations",
    # Additional mappings to reduce "Other"
    "antiarrhythmic": "Cardiovascular",
    "nitrate": "Cardiovascular",
    "vasodilator": "Cardiovascular",
    "hcn channel": "Cardiovascular",
    "ivabradine": "Cardiovascular",
    "anti-ischemic": "Cardiovascular",
    "arteriolar": "Cardiovascular",
    "cholinesterase inhibitor": "Neurology",
    "nmda receptor": "Neurology",
    "dopamine agonist": "Neurology",
    "triptan": "Neurology",
    "wakefulness": "Neurology",
    "muscle relaxant": "Neurology",
    "gaba-b": "Neurology",
    "local anesthetic": "Anesthesia & Emergency",
    "dissociative anesthetic": "Anesthesia & Emergency",
    "general anesthetic": "Anesthesia & Emergency",
    "antidote": "Anesthesia & Emergency",
    "cholinesterase reactivator": "Anesthesia & Emergency",
    "antivenom": "Anesthesia & Emergency",
    "antitubercular": "Anti-Infectives",
    "antiparasitic": "Anti-Infectives",
    "antiviral": "Anti-Infectives",
    "neuraminidase": "Anti-Infectives",
    "nucleoside": "Anti-Infectives",
    "nucleotide": "Anti-Infectives",
    "polymerase inhibitor": "Anti-Infectives",
    "thiazolide": "Anti-Infectives",
    "artemisinin": "Anti-Infectives",
    "immunosuppressant": "Immunology",
    "calcineurin inhibitor": "Immunology",
    "jak inhibitor": "Immunology",
    "antimetabolite": "Immunology",
    "immunoglobulin": "Immunology",
    "passive immun": "Immunology",
    "erythropoiesis": "Hematology",
    "colony-stimulating": "Hematology",
    "antifibrinolytic": "Hematology",
    "coagulation factor": "Hematology",
    "iron chelator": "Hematology",
    "iron preparation": "Hematology",
    "vitamin k": "Hematology",
    "pde-5": "Urology",
    "phosphodiesterase type 5": "Urology",
    "5-alpha reductase": "Urology",
    "bisphosphonate": "Endocrine",
    "vasopressin": "Endocrine",
    "vitamin d": "Endocrine",
    "mucolytic": "Respiratory",
    "expectorant": "Respiratory",
    "antitussive": "Respiratory",
    "anti-gout": "Rheumatology",
    "pancreatic enzyme": "Gastroenterology",
    "chloride channel": "Gastroenterology",
    "calcium supplement": "Supplements",
    "trace element": "Supplements",
    "ribonucleotide reductase": "Hematology",
    "dopamine d2 receptor agonist": "Endocrine",
    "uterotonic": "Obstetrics",
}


def _classify_drug(drug: Dict[str, Any]) -> str:
    """Classify a drug into a therapeutic category based on its drug_class."""
    drug_class = (drug.get("drug_class") or "").lower()

    for keyword, category in _CLASS_TO_CATEGORY.items():
        if keyword in drug_class:
            return category

    return "Other"


def get_drug_categories() -> List[Dict[str, Any]]:
    """Return all categories with drug count and drug list."""
    drugs = _load_drugs()
    categories: Dict[str, Dict[str, Any]] = {}

    for key, drug in drugs.items():
        cat = _classify_drug(drug)
        if cat not in categories:
            categories[cat] = {"name": cat, "count": 0, "drugs": []}
        categories[cat]["count"] += 1
        categories[cat]["drugs"].append({
            "id": key,
            "generic": drug.get("generic_name", key),
            "class": drug.get("drug_class", ""),
        })

    result = sorted(categories.values(), key=lambda x: x["count"], reverse=True)
    # Sort drugs within each category alphabetically
    for cat in result:
        cat["drugs"].sort(key=lambda d: d["generic"])
    return result


def get_drugs_by_category(category: str) -> List[Dict[str, Any]]:
    """Return all drugs in a specific category."""
    drugs = _load_drugs()
    result = []
    cat_lower = category.lower()

    for key, drug in drugs.items():
        if _classify_drug(drug).lower() == cat_lower:
            result.append({
                "id": key,
                "generic_name": drug.get("generic_name", key),
                "drug_class": drug.get("drug_class", ""),
                "brands_india": drug.get("brands_india", []),
                "quick_flags": drug.get("quick_flags", []),
            })

    result.sort(key=lambda d: d["generic_name"])
    return result
