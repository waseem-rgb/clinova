from __future__ import annotations

from pathlib import Path
import chromadb

# This script lives in: backend/app/scripts/
# We want CHROMA here:      backend/app/data/chroma
# Path(__file__).resolve().parents[1] == backend/app
CHROMA_DIR = (Path(__file__).resolve().parents[1] / "data" / "chroma").resolve()

EXPECTED = [
    "medicine_harrison",
    "obgyn_dutta",
    "surgery_oxford",
    "pediatrics_oxford",
    "drugs_mims_kd",
]

def main() -> None:
    print("CHROMA_DIR:", str(CHROMA_DIR))

    if not CHROMA_DIR.exists():
        print("\nERROR: Chroma directory does not exist at the above path.")
        print("Create/build collections first, or check your build script CHROMA path.")
        return

    client = chromadb.PersistentClient(path=str(CHROMA_DIR))

    cols = client.list_collections()
    names = sorted([c.name for c in cols])

    print("\nCollections found:")
    if not names:
        print("  (none found)")
    else:
        for n in names:
            print(" -", n)

    print("\nCounts:")
    for name in EXPECTED:
        try:
            col = client.get_collection(name=name)
            c = col.count()
            print(f" - {name}: {c}")
        except Exception as e:
            print(f" - {name}: ERROR -> {e}")

if __name__ == "__main__":
    main()
