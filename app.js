/* ============================================================
   The Material Risk of Solid-State Batteries
   INFO 247 Final Project — D3 v7
   ============================================================ */

// ---------- Shared config ----------
const MATERIAL_COLORS = {
  "Lithium (Li)":        "#2e7d8a",
  "Phosphate (P)":       "#A689E1",
  "Rare Earths (La, Y)": "#b5482c",
  "Sulfur (S)":          "#e6b34a",
  "Zirconium (Zr)":      "#5b8c5a"
};

const MATERIAL_ORDER = [
  "Rare Earths (La, Y)",
  "Lithium (Li)",
  "Phosphate (P)",
  "Zirconium (Zr)",
  "Sulfur (S)"
];

const NAME_FIX = {
  "United States": "United States of America",
  "Russia": "Russia",
  "Czech Republic": "Czechia",
  "Democratic Republic of the Congo": "Dem. Rep. Congo",
  "Ivory Coast": "Côte d'Ivoire"
};

const tooltip = d3.select("body").append("div").attr("class", "tooltip");
function showTip(html, event) {
  tooltip.html(html).style("left", (event.pageX + 14) + "px").style("top", (event.pageY + 14) + "px").style("opacity", 1);
}
function moveTip(event) {
  tooltip.style("left", (event.pageX + 14) + "px").style("top", (event.pageY + 14) + "px");
}
function hideTip() { tooltip.style("opacity", 0); }

// ---------- Load all data ----------
Promise.all([
  d3.csv("data/battery_demand.csv", d => ({ region: d.region, year: +d.year, gwh: +d.gwh })),
  d3.csv("data/production_2024.csv", d => ({
    material: d.Mineral, country: d.Country,
    production: +d.Production_2024_mt,
    worldTotal: +d.World_Total,
    share: +d.Market_Share_Pct
  })),
  d3.csv("data/hhi.csv", d => ({ material: d.Mineral, hhi: +d.HHI, producers: +d.Num_Producers })),
  d3.csv("data/prices.csv", d => ({ material: d.material, year: +d.year, value: +d.unit_value })),
  d3.json("data/world-110m.json"),
  d3.csv("data/conductivity.csv", d => ({
    family: d.family,
    n: +d.n_materials,
    medianLog: +d.median_log10,
    medianScm: +d.median_s_cm,
    p25Log: +d.p25_log10,
    p75Log: +d.p75_log10
  })).catch(() => null)
]).then(([demand, production, hhi, prices, world, conductivity]) => {
  drawDemand(demand);
  drawMap(production, world);
  drawRisk(hhi, production);
  drawPrices(prices);
  drawCalculator(hhi, conductivity, prices);
  drawRadar(hhi, conductivity, prices);
}).catch(err => {
  console.error("Data load error:", err);
});

// ... [Note: Keep your drawDemand, drawMap, drawRisk, drawPrices as they are] ...

/* ============================================================
   5. CALCULATOR (Updated with Prices)
   ============================================================ */
function drawCalculator(hhi, conductivity, prices) {
  const CHEMISTRIES = [
    {
      id: "llzo",
      name: "Oxide · LLZO",
      formula: "Li₇La₃Zr₂O₁₂",
      family: "oxide",
      note: "Oxide electrolyte.",
      weights: { "Lithium (Li)": 0.08, "Rare Earths (La, Y)": 0.52, "Zirconium (Zr)": 0.22 }
    },
    {
      id: "lpsc",
      name: "Sulfide · Li₆PS₅Cl",
      formula: "Li₆PS₅Cl",
      family: "sulfide",
      note: "Sulfide electrolyte.",
      weights: { "Lithium (Li)": 0.17, "Sulfur (S)": 0.39, "Phosphate (P)": 0.15 }
    },
    {
      id: "lagp",
      name: "Phosphate · LAGP",
      formula: "Li₁.₅Al₀.₅Ge₁.₅(PO₄)₃",
      family: "phosphate",
      note: "Phosphate-based electrolyte. Score reflects measurable inputs only.",
      weights: { "Lithium (Li)": 0.03, "Phosphate (P)": 0.28 }
    }
  ];

  const hhiMap = new Map(hhi.map(d => [d.material, d.hhi]));
  const condMap = conductivity ? new Map(conductivity.map(d => [d.family, d])) : null;

  function fmtSci(logVal) {
    const exp = Math.floor(logVal);
    const mantissa = Math.pow(10, logVal - exp);
    const supMap = { "-": "⁻", "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹" };
    const expStr = String(exp).split("").map(c => supMap[c] || c).join("");
    return `${mantissa.toFixed(1)}×10${expStr}`;
  }

  function condBand(logVal) {
    if (logVal >= -2.5) return { label: "Excellent", color: "#5b8c5a" };
    if (logVal >= -3.5) return { label: "Viable", color: "#5b8c5a" };
    if (logVal >= -4.5) return { label: "Borderline", color: "#e6b34a" };
    return { label: "Poor", color: "#b5482c" };
  }

  const picker = d3.select("#chem-picker");
  picker.selectAll("*").remove(); // Clear previous buttons

  CHEMISTRIES.forEach((c, i) => {
    picker.append("button")
      .attr("class", "cp-btn" + (i === 0 ? " active" : ""))
      .html(`<span class="cp-title">${c.name}</span><span class="cp-formula">${c.formula}</span>`)
      .on("click", function() {
        picker.selectAll(".cp-btn").classed("active", false);
        d3.select(this).classed("active", true);
        render(c);
      });
  });

  function render(chem) {
    const total = d3.sum(Object.values(chem.weights));
    const normWeights = Object.fromEntries(Object.entries(chem.weights).map(([k, v]) => [k, v / total]));
    const compHHI = d3.sum(Object.entries(normWeights).map(([mat, w]) => w * (hhiMap.get(mat) || 0)));

    let band, bandColor;
    if (compHHI < 1500) { band = "Low risk"; bandColor = "#5b8c5a"; }
    else if (compHHI < 2500) { band = "Moderate risk"; bandColor = "#e6b34a"; }
    else { band = "High risk"; bandColor = "#b5482c"; }

    const weightsHTML = Object.entries(normWeights)
      .map(([mat, w]) => `${mat}: <span style="color:${MATERIAL_COLORS[mat]}">${Math.round(w * 100)}%</span>`)
      .join("<br>");

    d3.select("#calc-weights").html(`<div style="font-size:16px;margin-bottom:10px;">${chem.note}</div><div>WEIGHTING:</div>${weightsHTML}`);

    const out = d3.select("#calc-output");
    out.html("");
    out.append("div").attr("class","calc-score-label").text("COMPOSITE SUPPLY-CHAIN RISK");
    out.append("div").attr("class","calc-score").style("color", bandColor).text(d3.format(",")(Math.round(compHHI)));
    out.append("div").attr("class","calc-score-desc").text(band);

    if (condMap && condMap.has(chem.family)) {
      const c = condMap.get(chem.family);
      const b = condBand(c.medianLog);
      out.append("div").attr("class", "calc-divider");
      out.append("div").attr("class","calc-score-label").text("TYPICAL IONIC CONDUCTIVITY");
      out.append("div").attr("class","calc-score").style("color", b.color).html(fmtSci(c.medianLog) + ` <span style="font-size:20px;">S/cm</span>`);
      out.append("div").attr("class","calc-score-desc").text(`${b.label} · median of ${c.n} electrolytes`);
    }
  }
  render(CHEMISTRIES[0]);
}

/* ============================================================
   6. RADAR CHART (Updated Stability Logic)
   ============================================================ */
function drawRadar(hhi, conductivity, prices) {
  const container = d3.select("#chart-radar");
  if (container.empty()) return;
  container.selectAll("*").remove();

  function getStabilityScore(materialName) {
    if (!prices) return 5;
    const matPrices = prices.filter(d => d.material === materialName).map(d => d.value);
    if (matPrices.length < 2) return 5;
    const mean = d3.mean(matPrices);
    const stdDev = d3.deviation(matPrices);
    const cv = stdDev / mean;
    return Math.max(0, Math.min(10, (1 / (1 + cv * 2.5)) * 10)); // Adjusted scaling
  }

  const hhiMap = new Map(hhi.map(d => [d.material, d.hhi]));
  const WEIGHTS = {
    llzo: { "Lithium (Li)": 0.08, "Rare Earths (La, Y)": 0.52, "Zirconium (Zr)": 0.22 },
    lpsc: { "Lithium (Li)": 0.17, "Sulfur (S)": 0.39, "Phosphate (P)": 0.15 },
    lagp: { "Lithium (Li)": 0.03, "Phosphate (P)": 0.28 }
  };

  function compositeHHI(w) {
    const t = d3.sum(Object.values(w));
    return d3.sum(Object.entries(w).map(([mat, v]) => (v/t) * (hhiMap.get(mat) || 0)));
  }

  function compositeStability(w) {
    const t = d3.sum(Object.values(w));
    return d3.sum(Object.entries(w).map(([mat, v]) => (v/t) * getStabilityScore(mat)));
  }

  const condMap = conductivity ? new Map(conductivity.map(d => [d.family, d])) : null;
  function condScore(family) {
    if (!condMap || !condMap.has(family)) return 5;
    return Math.max(0, Math.min(10, ((condMap.get(family).medianLog + 6) / 4) * 10));
  }

  const hhiLLZO = compositeHHI(WEIGHTS.llzo), hhiLPSC = compositeHHI(WEIGHTS.lpsc), hhiLAGP = compositeHHI(WEIGHTS.lagp);
  const maxHHI = Math.max(hhiLLZO, hhiLPSC, hhiLAGP);

  const AXES = ["Ionic Conductivity", "Price Stability", "Geographic Distribution"];
  const N = 3;

  const CHEMDATA = [
    { name: "Oxide · LLZO", color: "#b5482c", scores: [condScore("oxide"), compositeStability(WEIGHTS.llzo), (1 - hhiLLZO / maxHHI) * 10] },
    { name: "Sulfide · Li₆PS₅Cl", color: "#e6b34a", scores: [condScore("sulfide"), compositeStability(WEIGHTS.lpsc), (1 - hhiLPSC / maxHHI) * 10] },
    { name: "Phosphate · LAGP", color: "#A689E1", scores: [condScore("phosphate"), compositeStability(WEIGHTS.lagp), (1 - hhiLAGP / maxHHI) * 10] }
  ];

  const W = 640, H = 500, cx = 290, cy = 240, maxR = 170;
  const svg = container.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
  const g = svg.append("g");

  function angle(i) { return (Math.PI * 2 * i / N) - Math.PI / 2; }
  function px(val, i) { return cx + (val / 10) * maxR * Math.cos(angle(i)); }
  function py(val, i) { return cy + (val / 10) * maxR * Math.sin(angle(i)); }

  [2, 4, 6, 8, 10].forEach(level => {
    const pts = AXES.map((_, i) => [px(level, i), py(level, i)]);
    g.append("polygon").attr("points", pts.map(p => p.join(",")).join(" ")).attr("fill", level % 4 === 0 ? "#f5f1e6" : "none").attr("stroke", "#d8d2c3");
    g.append("text").attr("x", px(level, 0) + 6).attr("y", py(level, 0) + 4).attr("font-size", 9).attr("fill", "#b8b3a4").text(level);
  });

  AXES.forEach((axis, i) => {
    g.append("line").attr("x1", cx).attr("y1", cy).attr("x2", px(10,i)).attr("y2", py(10,i)).attr("stroke", "#c8c3b4");
    const lx = cx + (maxR + 35) * Math.cos(angle(i)), ly = cy + (maxR + 35) * Math.sin(angle(i));
    g.append("text").attr("x", lx).attr("y", ly).attr("text-anchor", "middle").attr("font-weight", 700).text(axis);
  });

  [...CHEMDATA].reverse().forEach(chem => {
    const pts = chem.scores.map((v, i) => [px(v, i), py(v, i)]);
    g.append("polygon").attr("points", pts.map(p => p.join(",")).join(" ")).attr("fill", chem.color).attr("fill-opacity", 0.18).attr("stroke", chem.color).attr("stroke-width", 2);
    pts.forEach(([vx, vy]) => g.append("circle").attr("cx", vx).attr("cy", vy).attr("r", 4).attr("fill", chem.color));
  });
}
