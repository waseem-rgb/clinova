"""
Extract Indian brand→generic mappings from KD Tripathi text in ChromaDB.

Strategy: Use BRAND: Generic explicit patterns (most reliable), plus
curated known Indian brands that appear in the text.
"""

import chromadb
import sqlite3
import json
import re
from collections import defaultdict

CHROMA_PATH = "./app/data/chroma"
COLLECTION = "drugs_mims_kd"
DB_PATH = "app/data/drugs.db"

# Pattern: BRAND: Generic name (explicit mapping in KD Tripathi)
# e.g., "ACTRAPHANE HM PENFIL: Human soluble insulin"
# e.g., "AGAROL: Liquid paraffin"
# e.g., "ALCEPHIN-LA: Cephalexin"
BRAND_GENERIC_RE = re.compile(
    r'([A-Z][A-Z0-9\-]{2,}(?:\s+[A-Z0-9\-]+){0,2})\s*[:\s]+([A-Z][a-z][a-z]+(?:[\s\-][a-z]+){0,4})',
)

# Pattern: generic name, BRAND dosage
# e.g., "Ceftriaxone ... MONOCEF 0.25, 0.5, 1.0 g"
# e.g., "aspirin ... ECOSPRIN 75 mg tab"
GENERIC_THEN_BRAND_RE = re.compile(
    r'([A-Z][a-z]{3,}(?:[\s][a-z]+){0,2})\b.*?'
    r'([A-Z][A-Z0-9\-]{2,}(?:\s+[A-Z0-9\-]+)?)\s+[\d.,]+\s*(?:mg|mcg|g|mL|IU|%|U)',
    re.DOTALL
)

SKIP_BRANDS = {
    'THE', 'AND', 'FOR', 'WITH', 'MAX', 'MIN', 'PER', 'DAY', 'BID', 'TID',
    'OD', 'QID', 'TAB', 'CAP', 'INJ', 'SYR', 'ORAL', 'DOSE', 'ADULT',
    'CHILD', 'INITIALLY', 'NOT', 'BUT', 'ARE', 'HAS', 'MAY', 'CAN', 'USE',
    'DRUG', 'DRUGS', 'NOTE', 'ALL', 'ALSO', 'MOST', 'ONLY', 'OTHER', 'SOME',
    'LESS', 'MORE', 'HIGH', 'LOW', 'NEW', 'OLD', 'GIVEN', 'USED', 'WHEN',
    'THIS', 'THAT', 'THAN', 'THEN', 'FROM', 'INTO', 'OVER', 'UNDER',
    'AIDS', 'HIV', 'DNA', 'RNA', 'CNS', 'GIT', 'CVS', 'ECG', 'CSF',
    'AST', 'ALT', 'LDL', 'HDL', 'BMI', 'BSA', 'ADP', 'ATP', 'ACE',
    'COMBINATION', 'COMBINATIONS', 'ANTIMICROBIAL', 'GENERAL',
    'ADVERSE', 'EFFECTS', 'PREPARATIONS', 'HALF', 'LIFE',
    'SKIN', 'BONE', 'HEART', 'LIVER', 'LUNG', 'KIDNEY', 'BRAIN',
    'BLOOD', 'URINE', 'PLASMA', 'SERUM', 'TOPICAL',
}

# Load actual generic drug names from drugs.db (only real drug names)
def load_drug_generics() -> set:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    generics = set()
    cur.execute("""
        SELECT DISTINCT LOWER(COALESCE(generic_name, name))
        FROM drugs WHERE generic_name IS NOT NULL OR name IS NOT NULL
    """)
    for row in cur.fetchall():
        name = row[0].strip().lower()
        # Only keep single-word or two-word drug names (actual generics)
        words = name.split()
        if 1 <= len(words) <= 3 and len(name) >= 4:
            generics.add(name)
            # Also add just the first word for partial matching
            if len(words[0]) >= 5:
                generics.add(words[0])
    conn.close()
    return generics


def is_valid_brand(name: str) -> bool:
    if not name or len(name) < 3 or len(name) > 25:
        return False
    words = name.split()
    if any(w in SKIP_BRANDS for w in words):
        return False
    # Must contain at least one letter
    if not any(c.isalpha() for c in name):
        return False
    return True


def main():
    known_generics = load_drug_generics()
    print(f"Loaded {len(known_generics)} known drug generics")

    client = chromadb.PersistentClient(path=CHROMA_PATH)
    mims = client.get_collection(COLLECTION)
    total = mims.count()
    print(f"Processing {total} MIMS chunks...")

    generic_to_brands = defaultdict(set)

    for off in range(0, total, 500):
        batch = mims.get(offset=off, limit=500, include=["documents"])

        for doc in batch['documents']:
            # Method 1: BRAND: Generic explicit patterns
            for m in BRAND_GENERIC_RE.finditer(doc):
                brand = m.group(1).strip()
                generic = m.group(2).strip().lower()
                if is_valid_brand(brand) and generic in known_generics:
                    generic_to_brands[generic].add(brand.title())

            # Method 2: Look for lines like "BRAND 250 mg tab" near a generic
            # Split into paragraphs/sentences and find brand+generic pairs
            lines = doc.split('\n')
            for line in lines:
                # Find ALL-CAPS brands in this line
                caps_brands = re.findall(r'\b([A-Z][A-Z0-9\-]{2,}(?:\s+[A-Z0-9\-]+)?)\b', line)
                if not caps_brands:
                    continue
                # Find lowercase generic-like words in the same line or nearby
                line_lower = line.lower()
                for generic in known_generics:
                    if len(generic) < 5:
                        continue
                    if generic in line_lower:
                        for brand in caps_brands:
                            if is_valid_brand(brand) and brand.lower() != generic:
                                generic_to_brands[generic].add(brand.title())

        processed = min(off + 500, total)
        if processed % 5000 == 0 or processed >= total:
            print(f"  {processed}/{total} — {sum(len(v) for v in generic_to_brands.values())} brands across {len(generic_to_brands)} generics")

    # Convert to sorted lists, filter out low-quality entries
    result = {}
    for generic, brands in generic_to_brands.items():
        # Filter brands that are too short or look like abbreviations
        good_brands = [b for b in brands if len(b) >= 3]
        if good_brands:
            result[generic] = sorted(good_brands)

    print(f"\nFinal: {sum(len(v) for v in result.values())} brands across {len(result)} generics")

    with open('scripts/mims_brands_extracted.json', 'w') as f:
        json.dump(result, f, indent=2)
    print(f"Saved to scripts/mims_brands_extracted.json")

    # Show samples for known important drugs
    important = ['ceftriaxone', 'paracetamol', 'metformin', 'amlodipine',
                 'salbutamol', 'azithromycin', 'omeprazole', 'ciprofloxacin',
                 'diclofenac', 'atorvastatin', 'metoprolol', 'prednisolone',
                 'amoxicillin', 'cefixime', 'losartan', 'pantoprazole']
    print("\nImportant drug mappings:")
    for g in important:
        brands = result.get(g, [])
        if not brands:
            # Try partial match
            for k, v in result.items():
                if g in k:
                    brands = v
                    g = k
                    break
        print(f"  {g}: {brands[:8] if brands else '(not found)'}")

    return result


if __name__ == "__main__":
    main()
