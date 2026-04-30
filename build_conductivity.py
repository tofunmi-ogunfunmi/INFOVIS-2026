"""
Preprocess OBELiX ionic conductivity data into per-chemistry-family aggregates.

Usage:
    1. Download the OBELiX CSV from:
       https://raw.githubusercontent.com/NRC-Mila/OBELiX/main/data/downloads/all.csv
       Save as `all.csv` in this directory.
    2. Run:  python3 build_conductivity.py
    3. Copy the generated `conductivity.csv` to your site's data/ folder.

Output:
    conductivity.csv — one row per chemistry family (oxide/sulfide/phosphate)
    with median and quartile ionic conductivity, plus sample size.

Family classification (from composition string):
    sulfide    — contains S
    phosphate  — contains P but no S
    oxide      — contains O but no P and no S
    other      — skipped (halides, nitrides, etc.)
"""

import re
import csv
import math
import sys
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    print("ERROR: pandas is required. Install with: pip install pandas openpyxl")
    sys.exit(1)

INPUT_FILE = "all.csv"
OUTPUT_FILE = "conductivity.csv"

# Parse a reduced-formula string like "Li6.25Al0.25La3Zr2O12" into {element: count}
ELEMENT_RE = re.compile(r"([A-Z][a-z]?)(\d*\.?\d*)")

def parse_composition(formula):
    """Return dict of {element_symbol: float_count}. Returns empty dict on failure."""
    if not isinstance(formula, str) or not formula.strip():
        return {}
    elements = {}
    # Strip whitespace and common bracket chars; OBELiX formulas are usually clean
    clean = formula.replace(" ", "").replace("(", "").replace(")", "")
    for match in ELEMENT_RE.finditer(clean):
        sym, count = match.group(1), match.group(2)
        if not sym:
            continue
        n = float(count) if count else 1.0
        elements[sym] = elements.get(sym, 0) + n
    return elements

def classify_family(elements):
    """Map element dict to one of: sulfide, phosphate, oxide, other."""
    if not elements:
        return "other"
    has_s = "S" in elements
    has_p = "P" in elements
    has_o = "O" in elements
    if has_s:
        return "sulfide"
    if has_p:
        return "phosphate"
    if has_o:
        return "oxide"
    return "other"

def main():
    if not Path(INPUT_FILE).exists():
        print(f"ERROR: {INPUT_FILE} not found in {Path.cwd()}")
        print("Download it from:")
        print("  https://raw.githubusercontent.com/NRC-Mila/OBELiX/main/data/downloads/all.csv")
        sys.exit(1)

    df = pd.read_csv(INPUT_FILE)
    print(f"Loaded {len(df)} OBELiX entries")

    comp_col = "Reduced Composition"
    ic_col = "Ionic conductivity (S cm-1)"
    if comp_col not in df.columns or ic_col not in df.columns:
        print(f"ERROR: expected columns '{comp_col}' and '{ic_col}' not found.")
        print(f"Available columns: {df.columns.tolist()}")
        sys.exit(1)

    # Parse composition and classify
    df["family"] = df[comp_col].apply(lambda f: classify_family(parse_composition(f)))
    # Numeric conductivity only
    df["ic_num"] = pd.to_numeric(df[ic_col], errors="coerce")
    df = df[df["ic_num"].notna() & (df["ic_num"] > 0)].copy()
    df["log_ic"] = df["ic_num"].apply(math.log10)

    print("\nEntries by family (after filtering):")
    print(df["family"].value_counts().to_string())

    rows = []
    for family in ["oxide", "sulfide", "phosphate"]:
        sub = df[df["family"] == family]
        if len(sub) == 0:
            print(f"WARNING: no entries classified as {family}")
            continue
        median_log = sub["log_ic"].median()
        p25_log = sub["log_ic"].quantile(0.25)
        p75_log = sub["log_ic"].quantile(0.75)
        rows.append({
            "family": family,
            "n_materials": len(sub),
            "median_log10": round(median_log, 3),
            "median_s_cm": f"{10**median_log:.2e}",
            "p25_log10": round(p25_log, 3),
            "p75_log10": round(p75_log, 3),
        })

    with open(OUTPUT_FILE, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nWrote {OUTPUT_FILE}:")
    for r in rows:
        print(f"  {r['family']:10s}  n={r['n_materials']:4d}  "
              f"median={r['median_s_cm']} S/cm  "
              f"IQR=[10^{r['p25_log10']}, 10^{r['p75_log10']}]")

    print("\nNext step: copy conductivity.csv into your site's data/ folder.")

if __name__ == "__main__":
    main()
