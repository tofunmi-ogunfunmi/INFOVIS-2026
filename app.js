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

/* 1. DEMAND LINE CHART */
function drawDemand(data) {
  const container = d3.select("#chart-demand");
  const W = 900, H = 480;
  const m = { top: 30, right: 120, bottom: 50, left: 60 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const svg = container.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);
  const filtered = data.filter(d => d.year >= 2019 && d.year <= 2024);
  const byRegion = d3.group(filtered, d => d.region);
  const x = d3.scaleLinear().domain(d3.extent(filtered, d => d.year)).range([0, iw]);
  const y = d3.scaleLinear().domain([0, d3.max(filtered, d => d.gwh) * 1.08]).nice().range([ih, 0]);
  g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(6).tickSize(-iw).tickFormat(""));
  const regionColor = d3.scaleOrdinal().domain(["China","Europe","USA","Rest of the world","India"]).range(["#1a1e21","#5b8c5a","#2e7d8a","#b5b0a0","#d97757"]);
  const line = d3.line().x(d => x(d.year)).y(d => y(d.gwh)).curve(d3.curveMonotoneX);
  const lines = g.selectAll(".dline").data(Array.from(byRegion)).enter().append("g");
  lines.append("path").attr("fill","none").attr("stroke", d => regionColor(d[0])).attr("stroke-width", 2).attr("d", d => line(d[1]));
}

/* 2. CHOROPLETH MAP */
function drawMap(production, world) {
  const container = d3.select("#chart-map");
  const W = 1100, H = 540;
  const svg = container.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
  const countries = topojson.feature(world, world.objects.countries).features;
  const projection = d3.geoNaturalEarth1().fitSize([W, H - 20], { type: "FeatureCollection", features: countries });
  const path = d3.geoPath(projection);
  svg.append("g").selectAll("path").data(countries).enter().append("path").attr("d", path).attr("fill", "#f5f1e6").attr("stroke", "#d8d2c3");
}

/* 3. RISK SCATTER */
function drawRisk(hhi, production) {
  const container = d3.select("#chart-risk");
  const W = 900, H = 520;
  const svg = container.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
  const x = d3.scaleLinear().domain([0, 30]).range([70, W-40]);
  const y = d3.scaleLinear().domain([0, 5500]).range([H-60, 40]);
  svg.selectAll("circle").data(hhi).enter().append("circle").attr("cx", d => x(d.producers)).attr("cy", d => y(d.hhi)).attr("r", 15).attr("fill", d => MATERIAL_COLORS[d.material]);
}

/* 4. PRICE TRENDS */
function drawPrices(prices) {
  const container = d3.select("#chart-prices");
  const W = 900, H = 480;
  const svg = container.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
}

/* 5. CALCULATOR */
function drawCalculator(hhi, conductivity, prices) {
  const CHEMISTRIES = [
    { id: "llzo", name: "Oxide · LLZO", formula: "Li₇La₃Zr₂O₁₂", family: "oxide", note: "Oxide electrolyte.", weights: { "Lithium (Li)": 0.08, "Rare Earths (La, Y)": 0.52, "Zirconium (Zr)": 0.22 } },
    { id: "lpsc", name: "Sulfide · Li₆PS₅Cl", formula: "Li₆PS₅Cl", family: "sulfide", note: "Sulfide electrolyte.", weights: { "Lithium (Li)": 0.17, "Sulfur (S)": 0.39, "Phosphate (P)": 0.15 } },
    { id: "lagp", name: "Phosphate · LAGP", formula: "Li₁.₅Al₀.₅Ge₁.₅(PO₄)₃", family: "phosphate", note: "Phosphate-based electrolyte.", weights: { "Lithium (Li)": 0.03, "Phosphate (P)": 0.28 } }
  ];
  const hhiMap = new Map(hhi.map(d => [d.material, d.hhi]));
  const condMap = conductivity ? new Map(conductivity.map(d => [d.family, d])) : null;

  function render(chem) {
    const total = d3.sum(Object.values(chem.weights));
    const normWeights = Object.fromEntries(Object.entries(chem.weights).map(([k, v]) => [k, v / total]));
    const compHHI = d3.sum(Object.entries(normWeights).map(([mat, w]) => w * (hhiMap.get(mat) || 0)));
    d3.select("#calc-output").html(`Composite HHI: ${Math.round(compHHI)}`);
  }
  const picker = d3.select("#chem-picker");
  picker.selectAll("button").data(CHEMISTRIES).enter().append("button").text(d => d.name).on("click", (e, d) => render(d));
  render(CHEMISTRIES[0]);
}

/* 6. RADAR CHART (Updated Stability Logic) */
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
    return Math.max(0, Math.min(10, (1 / (1 + (stdDev / mean) * 2.5)) * 10));
  }

  const hhiMap = new Map(hhi.map(d => [d.material, d.hhi]));
  const WEIGHTS = {
    llzo: { "Lithium (Li)": 0.08, "Rare Earths (La, Y)": 0.52, "Zirconium (Zr)": 0.22 },
    lpsc: { "Lithium (Li)": 0.17, "Sulfur (S)": 0.39, "Phosphate (P)": 0.15 },
    lagp: { "Lithium (Li)": 0.03, "Phosphate (P)": 0.28 }
  };

  const compositeStability = w => d3.sum(Object.entries(w).map(([mat, v]) => (v/d3.sum(Object.values(w))) * getStabilityScore(mat)));
  const compositeHHI = w => d3.sum(Object.entries(w).map(([mat, v]) => (v/d3.sum(Object.values(w))) * (hhiMap.get(mat) || 0)));
  const condScore = f => conductivity ? Math.max(0, Math.min(10, ((new Map(conductivity.map(d => [d.family, d])).get(f).medianLog + 6) / 4) * 10)) : 5;

  const hhiScores = [compositeHHI(WEIGHTS.llzo), compositeHHI(WEIGHTS.lpsc), compositeHHI(WEIGHTS.lagp)];
  const maxHHI = d3.max(hhiScores);

  const CHEMDATA = [
    { name: "Oxide · LLZO", color: "#b5482c", scores: [condScore("oxide"), compositeStability(WEIGHTS.llzo), (1 - hhiScores[0]/maxHHI)*10] },
    { name: "Sulfide · Li₆PS₅Cl", color: "#e6b34a", scores: [condScore("sulfide"), compositeStability(WEIGHTS.lpsc), (1 - hhiScores[1]/maxHHI)*10] },
    { name: "Phosphate · LAGP", color: "#A689E1", scores: [condScore("phosphate"), compositeStability(WEIGHTS.lagp), (1 - hhiScores[2]/maxHHI)*10] }
  ];

  const W = 640, H = 500, cx = 290, cy = 240, maxR = 170;
  const svg = container.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
  const g = svg.append("g");
  const angle = i => (Math.PI * 2 * i / 3) - Math.PI / 2;
  
  [2,4,6,8,10].forEach(lvl => {
    const pts = [0,1,2].map(i => [cx + (lvl/10)*maxR*Math.cos(angle(i)), cy + (lvl/10)*maxR*Math.sin(angle(i))]);
    g.append("polygon").attr("points", pts.map(p => p.join(",")).join(" ")).attr("fill", "none").attr("stroke", "#d8d2c3");
  });

  CHEMDATA.forEach(chem => {
    const pts = chem.scores.map((v, i) => [cx + (v/10)*maxR*Math.cos(angle(i)), cy + (v/10)*maxR*Math.sin(angle(i))]);
    g.append("polygon").attr("points", pts.map(p => p.join(",")).join(" ")).attr("fill", chem.color).attr("fill-opacity", 0.2).attr("stroke", chem.color).attr("stroke-width", 2);
  });
}
