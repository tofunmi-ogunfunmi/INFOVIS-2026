# The Material Risk of Solid-State Batteries

INFO 247 Final Project · UC Berkeley I School · Spring 2026
Scarlett Xu & Tofunmi Ogunfunmi

A scrollytelling data visualization exploring how material choices in solid-state battery
electrolytes reshape global supply chain risk.

## What's in this repo

```
index.html       Seven-section narrative page
style.css        Editorial design system (Fraunces + Inter, cream + dark)
app.js           D3 v7 for interactive charts + calculator
data/
  battery_demand.csv     IEA Global EV Outlook 2025 (historical, GWh by region)
  production_2024.csv    USGS Mineral Commodity Summaries 2025 (top-10 producers)
  hhi.csv                Herfindahl–Hirschman concentration scores per material
  prices.csv             USGS Data Series 140 unit values, 2012–2022
  world-110m.json        Natural Earth 1:110m via world-atlas npm package
vendor/
  d3.min.js              D3 v7
  topojson-client.min.js
```

## Running locally

Any static file server works. From this directory:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Don't open `index.html` directly with `file://` — the CSV/JSON loads will fail
due to browser CORS rules on local files.

## Deploying to GitHub Pages

1. Create a new public repo on GitHub.
2. Push the contents of this folder to the `main` branch.
3. In repo Settings → Pages, set Source to "Deploy from a branch", branch
   `main`, folder `/ (root)`. Save.
4. Wait ~1 minute. Your site will be live at
   `https://<your-username>.github.io/<repo-name>/`.

That URL satisfies the INFO 247 "publicly viewable URL" requirement.

## The seven sections

1. **Hook** — Battery demand line chart, 2019–2024, by region
2. **Context** — Three SSE chemistries explained (oxide, sulfide, phosphate)
3. **Map** — Choropleth of 2024 producer share, switchable across all 5 materials
4. **Risk** — HHI concentration vs. number of producing countries, with the 2,500 "highly concentrated" threshold drawn
5. **Prices** — Decade of unit values; toggle between absolute ($/t, log scale) and % change from 2012
6. **Calculator** — "Build your own battery": pick a chemistry, see the composite risk score and which materials drive it
7. **Takeaway** — Narrative conclusion + colophon

## Calculator methodology

The composite risk score is a stoichiometrically-weighted average of the
underlying materials' HHI scores:

```
composite_HHI = Σ (mass_fraction_i × HHI_i)  for each material i in the chemistry
score_0_to_100 = composite_HHI / 100
```

Mass fractions are derived from each chemistry's chemical formula and rounded
to one decimal. Germanium (used in LAGP) is not included in the USGS production
dataset, so the LAGP score reflects only its measurable inputs (Li, P) — this
caveat is shown in the UI.

| Chemistry | Formula | Materials in calculator |
|-----------|---------|------------------------|
| LLZO | Li₇La₃Zr₂O₁₂ | Li (8%), La/rare earths (52%), Zr (22%) |
| Li₆PS₅Cl | Li₆PS₅Cl | Li (17%), S (39%), P (15%) |
| LAGP | Li₁.₅Al₀.₅Ge₁.₅(PO₄)₃ | Li (3%), P (28%), Ge unmeasured |

## Customizing

- **Colors** — change the `--c-*` variables in `style.css` and the `MATERIAL_COLORS` object in `app.js`
- **Section copy** — edit the `<section>` blocks in `index.html`
- **Add a new chemistry** — append an entry to the `CHEMISTRIES` array in `app.js` (`drawCalculator`)
- **Add a new material** — add rows to `data/production_2024.csv` and `data/hhi.csv`, add a row per year to `data/prices.csv`, add an entry to `MATERIAL_COLORS` and `MATERIAL_ORDER` in `app.js`

## Ionic conductivity (OBELiX integration)

The calculator pairs each chemistry's supply-chain risk score with its *typical
ionic conductivity*, drawn from the OBELiX dataset
(https://github.com/NRC-Mila/OBELiX): 599 experimentally measured
room-temperature conductivities for lithium solid electrolytes.

To generate `data/conductivity.csv`:

1. Download the full OBELiX CSV from
   https://raw.githubusercontent.com/NRC-Mila/OBELiX/main/data/downloads/all.csv
   and save it as `all.csv` next to `build_conductivity.py`.
2. Run:
   ```bash
   pip install pandas openpyxl
   python3 build_conductivity.py
   ```
3. Copy the resulting `conductivity.csv` into `data/`.

The script classifies each OBELiX entry into oxide, sulfide, or phosphate
families by composition parsing:

| Contains | Family |
|----------|--------|
| S | sulfide |
| P but no S | phosphate |
| O but no P and no S | oxide |
| None of the above | skipped |

Then it computes per-family median log₁₀ conductivity and the 25–75th percentile
range. The UI shows the median as the headline number with a qualitative band
(Excellent / Viable / Borderline / Poor), the IQR as the spread, and the
sample size.

**If `conductivity.csv` is missing, the calculator gracefully degrades** to
risk-only mode. You can ship the site without OBELiX if you prefer.

## Data sources

- **Battery demand**: IEA, *Global EV Outlook 2025*, GEVO_EV_2025 sheet, "Battery demand" parameter, historical only.
- **2024 production by country**: USGS, *Mineral Commodity Summaries 2025*, top-10 producing countries per commodity. Materials: lithium, phosphate rock, rare earths (La, Y), sulfur, zirconium.
- **HHI concentration scores**: computed from the same USGS 2024 production shares using the standard Herfindahl–Hirschman formula (Σ market_share²).
- **Historical unit values**: USGS *Data Series 140* (Historical Statistics for Mineral and Material Commodities), Unit value ($/t) column, 2012–2022. Lithium and Zirconium 2022 values were not yet published as of data collection.

## License

Data: subject to original USGS / IEA terms.
