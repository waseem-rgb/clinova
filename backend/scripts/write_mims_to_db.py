"""
Write MIMS-extracted brand names into drugs.db india_brands column.
Then rebuild FTS5 index to include india_brands for search.
"""

import sqlite3
import json
import re

DB_PATH = "app/data/drugs.db"
MIMS_FILE = "scripts/mims_brands_extracted.json"

# Filter out noise: pharmacology terms that got picked up as brands
NOISE_BRANDS = {
    'cyp2c', 'cyp2d6', 'cyp3a4', 'dpp-', 'arb', 'ace', 'nsaid', 'ssri',
    'snri', 'maoi', 'tca', 'gaba', 'cox-1', 'cox-2', 'hiv-', 'azt',
    'cad', 'mmf', 'gerd', 'bph', 'inr', 'anug', 'at1', 'ccb',
    'esrd', 'htn', 'ckd', 'dvt', 'pe',
}


def is_noise(brand: str) -> bool:
    """Check if a brand name is actually pharmacology noise."""
    bl = brand.lower().strip()
    if bl in NOISE_BRANDS:
        return True
    # Too short
    if len(bl) < 3:
        return True
    # All digits or single letter + digits
    if re.match(r'^[a-z]?\d+$', bl):
        return True
    # Ends with dash
    if bl.endswith('-'):
        return True
    return False


def main():
    with open(MIMS_FILE) as f:
        mims_brands = json.load(f)

    print(f"Loaded {len(mims_brands)} generic→brands mappings from MIMS")

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Before count
    cur.execute("""
        SELECT COUNT(*) FROM drugs
        WHERE india_brands IS NOT NULL AND india_brands != '[]' AND india_brands != ''
    """)
    before = cur.fetchone()[0]
    print(f"India brands BEFORE: {before}")

    updated = 0
    new_brands_added = 0

    for generic, brands in mims_brands.items():
        # Filter noise
        clean_brands = [b for b in brands if not is_noise(b)]
        if not clean_brands:
            continue

        # Find matching drugs in DB
        cur.execute("""
            SELECT id, india_brands FROM drugs
            WHERE LOWER(name) LIKE ? OR LOWER(generic_name) LIKE ?
        """, [f'%{generic}%', f'%{generic}%'])

        rows = cur.fetchall()
        if not rows:
            continue

        for drug_id, current_india in rows:
            existing = []
            if current_india:
                try:
                    existing = json.loads(current_india)
                except:
                    existing = []

            # Merge: add new brands that don't already exist (case-insensitive)
            existing_lower = {b.lower() for b in existing}
            new_brands = [b for b in clean_brands if b.lower() not in existing_lower]

            if not new_brands:
                continue

            merged = existing + new_brands
            # Limit to 10 brands per drug
            merged = merged[:10]

            cur.execute("UPDATE drugs SET india_brands = ? WHERE id = ?",
                        [json.dumps(merged), drug_id])
            updated += 1
            new_brands_added += len(new_brands)

    conn.commit()

    # After count
    cur.execute("""
        SELECT COUNT(*) FROM drugs
        WHERE india_brands IS NOT NULL AND india_brands != '[]' AND india_brands != ''
    """)
    after = cur.fetchone()[0]

    print(f"\nIndia brands AFTER: {after} (was {before}, added {after - before} new drugs)")
    print(f"Updated {updated} drug rows, added {new_brands_added} new brand entries")

    # Verify key drugs
    print("\nVerification:")
    for test in ['ceftriaxone', 'paracetamol', 'metformin', 'salbutamol', 'azithromycin']:
        cur.execute("""
            SELECT name, india_brands FROM drugs
            WHERE LOWER(name) LIKE ? OR LOWER(generic_name) LIKE ?
            LIMIT 1
        """, [f'%{test}%', f'%{test}%'])
        row = cur.fetchone()
        if row:
            print(f"  {row[0]}: {row[1][:100]}")

    conn.close()


if __name__ == "__main__":
    main()
