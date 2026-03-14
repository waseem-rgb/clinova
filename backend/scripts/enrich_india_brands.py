"""
Enrich drugs.db with India brand names for common generics.

Strategy:
1. Add known India brand → generic mappings for ~45 high-use drugs
2. Skip drugs that already have india_brands populated
"""

import sqlite3, json

DB_PATH = "app/data/drugs.db"

KNOWN_INDIA_BRANDS = {
    'metformin': ['Glycomet', 'Obimet', 'Cetapin', 'Walaphage'],
    'amlodipine': ['Amlokind', 'Amlong', 'Stamlo', 'Amlip'],
    'atorvastatin': ['Atorva', 'Atorlip', 'Lipicure', 'Storvas', 'Tonact'],
    'metoprolol': ['Metolar', 'Seloken', 'Betaloc'],
    'losartan': ['Losar', 'Losacar', 'Repace', 'Covance'],
    'omeprazole': ['Omez', 'Ocid', 'Omesec', 'Nilsec'],
    'pantoprazole': ['Pan', 'Pantodac', 'Pantop', 'Nexpro'],
    'azithromycin': ['Azithral', 'Azee', 'Azibest', 'Azifast'],
    'cetirizine': ['Cetzine', 'Alerid', 'Okacet'],
    'montelukast': ['Montek', 'Montair', 'Romilast'],
    'paracetamol': ['Crocin', 'Dolo', 'Calpol', 'Metacin'],
    'amoxicillin': ['Novamox', 'Mox', 'Wymox', 'Amoxil India'],
    'ciprofloxacin': ['Ciplox', 'Cifran', 'Zoxan', 'Ciprobid'],
    'levofloxacin': ['Levoflox', 'Glevo', 'Levomac', 'Levox'],
    'cefixime': ['Taxim-O', 'Zifi', 'Cefix', 'Topcef'],
    'ceftriaxone': ['Monocef', 'Oframax', 'Ceftrimax'],
    'metronidazole': ['Flagyl', 'Metrogyl', 'Aristogyl'],
    'diclofenac': ['Voveran', 'Dicloran', 'Reactin'],
    'tramadol': ['Ultracet', 'Tramazac', 'Contramal'],
    'ondansetron': ['Emeset', 'Ondem', 'Zofer', 'Vomikind'],
    'domperidone': ['Domstal', 'Domcolic', 'Vomistop'],
    'ranitidine': ['Zinetac', 'Rantac', 'Aciloc'],
    'insulin glargine': ['Basalog', 'Glaritus', 'Lupisulin'],
    'salbutamol': ['Asthalin', 'Ventorlin', 'Derihaler'],
    'prednisolone': ['Wysolone', 'Omnacortil', 'Predmet'],
    'dexamethasone': ['Dexona', 'Cadidex', 'Dexacort'],
    'furosemide': ['Lasix', 'Frusenex', 'Frusemide'],
    'warfarin': ['Warf', 'Warfarin Zydus'],
    'atenolol': ['Aten', 'Betacard', 'Tenolol'],
    'hydrochlorothiazide': ['Aquazide', 'Esidrex'],
    'spironolactone': ['Aldactone', 'Spiromide'],
    'glimepiride': ['Amaryl', 'Glimer', 'Glimpid'],
    'glibenclamide': ['Daonil', 'Semi-Daonil', 'Euglucon'],
    'sitagliptin': ['Istavel', 'Zita', 'Januvia India'],
    'rosuvastatin': ['Rozucor', 'Razel', 'Rosuvas'],
    'clopidogrel': ['Clopilet', 'Deplatt', 'Clavix'],
    'aspirin': ['Ecosprin', 'Disprin', 'Ecorin'],
    'telmisartan': ['Telma', 'Telsartan', 'Telday'],
    'ramipril': ['Cardace', 'Ramipres', 'Ramistar'],
    'enalapril': ['Envas', 'Enapril', 'Renitec'],
    'nifedipine': ['Adalat', 'Nicardia', 'Depin'],
    'valsartan': ['Valent', 'Diovan India', 'Valzaar'],
    'lisinopril': ['Listril', 'Lipril', 'Lisinostar'],
    'diltiazem': ['Dilzem', 'Angizem', 'Dilcontin'],
    'carvedilol': ['Carvil', 'Carloc', 'Cardivas'],
}


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Before count
    cur.execute("""
      SELECT COUNT(*) FROM drugs
      WHERE india_brands IS NOT NULL
      AND india_brands != '[]'
      AND india_brands != ''
    """)
    before = cur.fetchone()[0]
    print(f"India brands BEFORE: {before}")

    updated = 0
    for generic_pattern, india_brands in KNOWN_INDIA_BRANDS.items():
        cur.execute("""
            UPDATE drugs
            SET india_brands = ?
            WHERE (india_brands IS NULL OR india_brands = '[]' OR india_brands = '')
            AND (
              LOWER(name) LIKE ?
              OR LOWER(generic_name) LIKE ?
            )
        """, [
            json.dumps(india_brands),
            f'%{generic_pattern}%',
            f'%{generic_pattern}%'
        ])
        if cur.rowcount > 0:
            updated += cur.rowcount
            print(f"  +{cur.rowcount} rows for {generic_pattern}: {india_brands}")

    conn.commit()

    # After count
    cur.execute("""
      SELECT COUNT(*) FROM drugs
      WHERE india_brands IS NOT NULL
      AND india_brands != '[]'
      AND india_brands != ''
    """)
    after = cur.fetchone()[0]

    print(f"\nIndia brands AFTER: {after} (was {before}, added {after - before})")
    print(f"Total drug rows updated: {updated}")

    # Verify a few
    for test in ['metformin', 'paracetamol', 'amlodipine']:
        cur.execute("""
          SELECT name, india_brands FROM drugs
          WHERE LOWER(name) LIKE ? OR LOWER(generic_name) LIKE ?
          LIMIT 1
        """, [f'%{test}%', f'%{test}%'])
        row = cur.fetchone()
        if row:
            print(f"  Verify {test}: {row[0]} → {row[1]}")

    conn.close()


if __name__ == "__main__":
    main()
