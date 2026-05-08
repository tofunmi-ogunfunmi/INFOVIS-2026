/* ============================================================
   The Hidden Geography of Solid-State Batteries
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

// Map country names in the CSV to the world-atlas names
const NAME_FIX = {
  "United States": "United States of America",
  "Russia": "Russia",
  "Czech Republic": "Czechia",
  "Democratic Republic of the Congo": "Dem. Rep. Congo",
  "Ivory Coast": "Côte d'Ivoire"
};

// Single shared tooltip
const tooltip = d3.select("body").append("div").attr("class", "tooltip");
function showTip(html, event) {
  tooltip.html(html)
    .style("left", (event.pageX + 14) + "px")
    .style("top",  (event.pageY + 14) + "px")
    .style("opacity", 1);
}
function moveTip(event) {
  tooltip.style("left", (event.pageX + 14) + "px")
         .style("top",  (event.pageY + 14) + "px");
}
function hideTip() { tooltip.style("opacity", 0); }

// ---------- Load all data ----------
// conductivity.csv is optional — if absent, calculator falls back to risk-only mode.
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
  })).catch(() => null)  // missing file is OK
]).then(([demand, production, hhi, prices, world, conductivity]) => {
  drawDemand(demand);
  drawMap(production, world);
  drawRisk(hhi, production);
  drawPrices(prices);
  drawCalculator(hhi, conductivity);
}).catch(err => {
  console.error("Data load error:", err);
  document.body.insertAdjacentHTML("afterbegin",
    `<div style="padding:20px;background:#fee;color:#900;font-family:monospace;">
     Data load error: ${err.message}</div>`);
});

/* ============================================================
   1. DEMAND LINE CHART
   ============================================================ */
function drawDemand(data) {
  const container = d3.select("#chart-demand");
  const W = 900, H = 480;
  const m = { top: 30, right: 120, bottom: 50, left: 60 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

  // Limit to slide 2's range so the "+340% since 2020" callout reads clearly
  const filtered = data.filter(d => d.year >= 2019 && d.year <= 2024);
  const byRegion = d3.group(filtered, d => d.region);

  const x = d3.scaleLinear()
    .domain(d3.extent(filtered, d => d.year))
    .range([0, iw]);

  const y = d3.scaleLinear()
    .domain([0, d3.max(filtered, d => d.gwh) * 1.08]).nice()
    .range([ih, 0]);

  // Gridlines
  g.append("g").attr("class", "grid")
    .call(d3.axisLeft(y).ticks(6).tickSize(-iw).tickFormat(""));

  // Axes
  g.append("g").attr("class", "axis")
    .attr("transform", `translate(0,${ih})`)
    .call(d3.axisBottom(x).tickValues([2019,2020,2021,2022,2023,2024]).tickFormat(d3.format("d")))
    .call(sel => sel.select(".domain").remove());

  g.append("g").attr("class", "axis")
    .call(d3.axisLeft(y).ticks(6).tickFormat(d => d + " GWh"))
    .call(sel => sel.select(".domain").remove());

  // Region colors — neutral, not the material palette
  const regionColor = d3.scaleOrdinal()
    .domain(["China","Europe","USA","Rest of the world","India"])
    .range(["#1a1e21","#5b8c5a","#2e7d8a","#b5b0a0","#d97757"]);

  const line = d3.line()
    .x(d => x(d.year))
    .y(d => y(d.gwh))
    .curve(d3.curveMonotoneX);

  // Draw lines
  const lines = g.selectAll(".dline")
    .data(Array.from(byRegion))
    .enter().append("g");

  lines.append("path")
    .attr("fill","none")
    .attr("stroke", d => regionColor(d[0]))
    .attr("stroke-width", d => d[0] === "China" ? 3 : 1.8)
    .attr("d", d => line(d[1].sort((a,b) => a.year - b.year)))
    .attr("stroke-dasharray", function() { const l = this.getTotalLength(); return `${l} ${l}`; })
    .attr("stroke-dashoffset", function() { return this.getTotalLength(); })
    .transition().duration(1600).ease(d3.easeCubicOut)
    .attr("stroke-dashoffset", 0);

  // End labels
  lines.append("text")
    .attr("class","series-label")
    .attr("x", d => x(d3.max(d[1], v => v.year)) + 8)
    .attr("y", d => {
      const last = d[1].find(v => v.year === d3.max(d[1], x => x.year));
      return y(last.gwh) + 4;
    })
    .attr("fill", d => regionColor(d[0]))
    .text(d => d[0])
    .attr("opacity", 0)
    .transition().delay(1600).duration(400).attr("opacity", 1);

  // Annotation: "+470% since 2020" (China actual)
  const china2020 = filtered.find(d => d.region === "China" && d.year === 2020).gwh;
  const china2024 = filtered.find(d => d.region === "China" && d.year === 2024).gwh;
  const pct = Math.round(((china2024 - china2020) / china2020) * 100);

  const ann = g.append("g").attr("opacity", 0);
  ann.append("text")
    .attr("x", x(2019.9)).attr("y", y(420))
    .attr("font-family", "Fraunces, serif")
    .attr("font-style", "italic")
    .attr("font-size", 22)
    .attr("fill", "#5a5f64")
    .text(`+${pct}% increase in China`);
  ann.append("text")
    .attr("x", x(2019.9)).attr("y", y(420) + 26)
    .attr("font-family", "Fraunces, serif")
    .attr("font-style", "italic")
    .attr("font-size", 22)
    .attr("fill", "#5a5f64")
    .text("since 2020");
  ann.transition().delay(1800).duration(600).attr("opacity", 1);
}

/* ============================================================
   2. CHOROPLETH MAP + FLOW TOGGLE
   ============================================================ */
function drawMap(production, world) {
  const container = d3.select("#chart-map");
  const W = 1100, H = 540;
  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const countries = topojson.feature(world, world.objects.countries).features;
  const projection = d3.geoNaturalEarth1().fitSize([W, H - 20], { type: "FeatureCollection", features: countries });
  const path = d3.geoPath(projection);

  // Demand hubs — the three regions from your battery demand chart
  const DEMAND_HUBS = [
    { name: "China",  lon: 104,  lat: 35  },
    { name: "Europe", lon: 10,   lat: 51  },
    { name: "USA",    lon: -98,  lat: 39  },
    { name: "India",  lon: 78,   lat: 20  }
  ];

  // Country centroids for producers (lon, lat) — used for arc endpoints
  // Covers all top-10 producers across the five materials
  const CENTROIDS = {
    "China":          [ 104,  35 ], "Australia":      [ 134, -25 ],
    "Chile":          [ -71, -30 ], "Argentina":      [ -64, -34 ],
    "Brazil":         [ -51, -10 ], "United States":  [ -98,  39 ],
    "Morocco":        [  -6,  32 ], "Russia":         [  90,  60 ],
    "Zimbabwe":       [  30, -20 ], "South Africa":   [  25, -29 ],
    "Saudi Arabia":   [  45,  24 ], "Kazakhstan":     [  67,  48 ],
    "Canada":         [ -96,  60 ], "India":          [  78,  20 ],
    "Peru":           [ -76, -10 ], "Finland":        [  26,  64 ],
    "Philippines":    [ 122,  13 ], "Indonesia":      [ 114,  -2 ],
    "Mozambique":     [  35, -18 ], "Germany":        [  10,  51 ],
    "Jordan":         [  37,  31 ], "Myanmar":        [  96,  17 ],
    "Democratic Republic of the Congo": [ 24, -3 ],
    "Mexico":         [ -99,  23 ], "Thailand":       [ 101,  15 ],
    "Ukraine":        [  32,  49 ], "Iran":           [  53,  32 ],
    "Senegal":        [ -14,  14 ], "Tunisia":        [   9,  34 ],
    "Algeria":        [   2,  28 ], "Egypt":          [  30,  27 ],
    "Pakistan":       [  68,  30 ], "Sri Lanka":      [  81,   8 ],
    "Malawi":         [  34, -13 ]
  };

  // State
  let currentMaterial = MATERIAL_ORDER[0];

  // --- Material selector buttons ---
  const controls = d3.select("#map-controls");
  MATERIAL_ORDER.forEach((m, i) => {
    controls.append("button")
      .attr("class", "mc-btn" + (i === 0 ? " active" : ""))
      .html(`<span class="mc-swatch" style="background:${MATERIAL_COLORS[m]}"></span>${m}`)
      .on("click", function() {
        controls.selectAll(".mc-btn").classed("active", false);
        d3.select(this).classed("active", true);
        currentMaterial = m;
        updateChoropleth(m);
      });
  });

  // --- SVG layers ---
  // Ocean
  svg.append("path")
    .datum({type: "Sphere"})
    .attr("d", path)
    .attr("fill", "#eeeae0")
    .attr("stroke", "#d8d2c3");

  const gCountries = svg.append("g");
  const paths = gCountries.selectAll("path.country")
    .data(countries)
    .enter().append("path")
    .attr("class", "country")
    .attr("d", path)
    .attr("fill", "#f5f1e6")
    .attr("stroke", "#d8d2c3")
    .attr("stroke-width", 0.5);

  // Legend
  const legendG = svg.append("g").attr("transform", `translate(${W - 220}, ${H - 70})`);
  legendG.append("text")
    .attr("font-family", "JetBrains Mono, monospace")
    .attr("font-size", 10)
    .attr("letter-spacing", "0.08em")
    .attr("fill", "#5a5f64")
    .text("SHARE OF 2024 GLOBAL PRODUCTION");

  const legendW = 200, legendH = 10;
  const defs = svg.append("defs");

  // --- Choropleth update ---
  function updateChoropleth(material) {
    const rows = production.filter(p => p.material === material);
    const byCountry = new Map(rows.map(r => [r.country, r]));
    Object.entries(NAME_FIX).forEach(([csvName, worldName]) => {
      if (byCountry.has(csvName)) byCountry.set(worldName, byCountry.get(csvName));
    });

    const max = d3.max(rows, r => r.share);
    const color = d3.scaleSequential()
      .domain([0, max])
      .interpolator(d3.interpolateRgb("#f5f1e6", MATERIAL_COLORS[material]));

    paths.transition().duration(700)
      .attr("fill", d => {
        const row = byCountry.get(d.properties.name);
        return row ? color(row.share) : "#f5f1e6";
      });

    paths
      .on("mouseenter", function(event, d) {
        const row = byCountry.get(d.properties.name);
        d3.select(this).attr("stroke", "#1a1e21").attr("stroke-width", 1.2).raise();
        if (row) {
          showTip(`<strong>${d.properties.name}</strong>
                   <div class="tt-mono">${material}</div>
                   ${row.share.toFixed(2)}% of global production<br>
                   ${d3.format(",")(row.production)} metric tons`, event);
        } else {
          showTip(`<strong>${d.properties.name}</strong>
                   <div class="tt-mono">${material}</div>
                   Not a top-10 producer`, event);
        }
      })
      .on("mousemove", moveTip)
      .on("mouseleave", function() {
        d3.select(this).attr("stroke", "#d8d2c3").attr("stroke-width", 0.5);
        hideTip();
      });

    // Legend
    legendG.selectAll(".legend-swatch,.legend-label").remove();
    const gradId = `grad-${material.replace(/\W/g, "")}`;
    defs.selectAll(`#${gradId}`).remove();
    const grad = defs.append("linearGradient").attr("id", gradId);
    grad.append("stop").attr("offset", "0%").attr("stop-color", "#f5f1e6");
    grad.append("stop").attr("offset", "100%").attr("stop-color", MATERIAL_COLORS[material]);

    legendG.append("rect").attr("class","legend-swatch")
      .attr("y", 10).attr("width", legendW).attr("height", legendH)
      .attr("fill", `url(#${gradId})`).attr("stroke", "#d8d2c3");
    legendG.append("text").attr("class","legend-label")
      .attr("y", 36).attr("x", 0)
      .attr("font-family","Inter,sans-serif").attr("font-size",14).attr("fill","#5a5f64")
      .text("0%");
    legendG.append("text").attr("class","legend-label")
      .attr("y", 36).attr("x", legendW).attr("text-anchor","end")
      .attr("font-family","Inter,sans-serif").attr("font-size",14).attr("fill","#5a5f64")
      .text(`${max.toFixed(0)}%`);
  }

  updateChoropleth(MATERIAL_ORDER[0]);
}

/* ============================================================
   3. HHI RISK SCATTER
   ============================================================ */
function drawRisk(hhi, production) {
  const container = d3.select("#chart-risk");
  const W = 900, H = 520;
  const m = { top: 40, right: 40, bottom: 60, left: 70 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

  // Compute total production per material for bubble size
  const totalByMat = d3.rollup(production, v => v[0].worldTotal, d => d.material);

  const data = hhi.map(d => ({
    ...d,
    total: totalByMat.get(d.material) || 0,
    color: MATERIAL_COLORS[d.material]
  }));

  const x = d3.scaleLinear().domain([0, 28]).range([0, iw]);
  const y = d3.scaleLinear().domain([0, 5500]).range([ih, 0]);
  const FIXED_R = 22; // all bubbles same size

  // Three risk zones — high / moderate / low
  g.append("rect")
    .attr("x", 0).attr("y", 0)
    .attr("width", iw).attr("height", y(2500))
    .attr("fill", "#b5482c").attr("opacity", 0.12);
  // g.append("rect")
  //   .attr("x", 0).attr("y", y(2500))
  //   .attr("width", iw).attr("height", y(1500) - y(2500))
  //   .attr("fill", "#e6b34a").attr("opacity", 0.10);
  g.append("rect")
    .attr("x", 0).attr("y", y(1500))
    .attr("width", iw).attr("height", ih - y(1500))
    .attr("fill", "#5b8c5a").attr("opacity", 0.12);

  // Threshold lines
  g.append("line")
    .attr("x1", 0).attr("x2", iw)
    .attr("y1", y(2500)).attr("y2", y(2500))
    .attr("stroke", "#b5482c")
    .attr("stroke-dasharray", "4,4")
    .attr("stroke-width", 1.5);
  g.append("text")
    .attr("x", 5).attr("y", y(2500) - 6)
    .attr("font-family", "JetBrains Mono, monospace")
    .attr("font-size", 11).attr("fill", "#b5482c")
    .text("2,500 · highly concentrated");

  g.append("line")
    .attr("x1", 0).attr("x2", iw)
    .attr("y1", y(1500)).attr("y2", y(1500))
    .attr("stroke", "#5b8c5a")
    .attr("stroke-dasharray", "4,4")
    .attr("stroke-width", 1.5);
  g.append("text")
    .attr("x", 5).attr("y", y(1500) - 6)
    .attr("font-family", "JetBrains Mono, monospace")
    .attr("font-size", 11).attr("fill", "#5b8c5a")
    .text("1,500 · moderately concentrated");

  // Gridlines
  g.append("g").attr("class","grid")
    .call(d3.axisLeft(y).ticks(6).tickSize(-iw).tickFormat(""));

  // Axes
  g.append("g").attr("class","axis")
    .attr("transform",`translate(0,${ih})`)
    .call(d3.axisBottom(x).ticks(7))
    .call(s => s.select(".domain").remove());
  g.append("g").attr("class","axis")
    .call(d3.axisLeft(y).ticks(6).tickFormat(d3.format(",")))
    .call(s => s.select(".domain").remove());

  // Axis labels
  g.append("text")
    .attr("x", iw / 2).attr("y", ih + 44)
    .attr("text-anchor", "middle")
    .attr("font-family", "Inter, sans-serif")
    .attr("font-size", 20).attr("fill", "#4a4f54")
    .text("Number of producing countries");

  g.append("text")
    .attr("transform", `rotate(-90)`)
    .attr("x", -ih / 2).attr("y", -70)
    .attr("text-anchor", "middle")
    .attr("font-family", "Inter, sans-serif")
    .attr("font-size", 20).attr("fill", "#4a4f54")
    .text("HHI concentration score");

  // Bubbles
  const bubbles = g.selectAll(".bubble")
    .data(data)
    .enter().append("g");

  bubbles.append("circle")
    .attr("cx", d => x(d.producers))
    .attr("cy", d => y(d.hhi))
    .attr("r", 0)
    .attr("fill", d => d.color)
    .attr("fill-opacity", 0.80)
    .attr("stroke", d => d.color)
    .attr("stroke-width", 1.5)
    .on("mouseenter", function(event, d) {
      d3.select(this).attr("fill-opacity", 1);
      showTip(`<strong>${d.material}</strong>
               HHI: <span class="tt-mono">${d3.format(",")(d.hhi)}</span><br>
               Producing countries: ${d.producers}`, event);
    })
    .on("mousemove", moveTip)
    .on("mouseleave", function() {
      d3.select(this).attr("fill-opacity", 0.80);
      hideTip();
    })
    .transition().duration(900).delay((d,i) => i * 120)
    .attr("r", FIXED_R);

  // Per-material label placement to avoid bubble/line collisions.
  // "above" = above bubble; "below" = below bubble; offset tweaks horizontal.
  const LABEL_POS = {
    "Rare Earths (La, Y)": { side: "above", dx: 0 },
    "Phosphate (P)":       { side: "below", dx: -30 },
    "Lithium (Li)":        { side: "above", dx: -20 },
    "Zirconium (Zr)":      { side: "below", dx: 22 },
    "Sulfur (S)":          { side: "above", dx: 0 }
  };

  bubbles.append("text")
    .attr("x", d => x(d.producers) + (LABEL_POS[d.material]?.dx || 0))
    .attr("y", d => {
      const pos = LABEL_POS[d.material] || { side: "above" };
      return pos.side === "above" ? y(d.hhi) - FIXED_R - 8 : y(d.hhi) + FIXED_R + 18;
    })
    .attr("text-anchor", "middle")
    .attr("font-family", "Fraunces, serif")
    .attr("font-weight", 600)
    .attr("font-size", 16)
    .attr("fill", d => MATERIAL_COLORS[d.material])
    .text(d => d.material)
    .attr("opacity", 0)
    .transition().delay(1200).duration(400).attr("opacity", 1);

  g.append("text")
    .attr("x", iw - 16).attr("y", 20)
    .attr("text-anchor", "end")
    .attr("font-family", "JetBrains Mono, monospace")
    .attr("font-size", 12).attr("fill", "#b5482c")
    .attr("letter-spacing", "0.1em")
    .text("HIGH RISK");

  // g.append("text")
  //   .attr("x", iw - 16).attr("y", y(2000))
  //   .attr("text-anchor", "end")
  //   .attr("font-family", "JetBrains Mono, monospace")
  //   .attr("font-size", 12).attr("fill", "#c8893a")
  //   .attr("letter-spacing", "0.1em")
  //   .text("MODERATE RISK");

  g.append("text")
    .attr("x", iw - 16).attr("y", ih - 14)
    .attr("text-anchor", "end")
    .attr("font-family", "JetBrains Mono, monospace")
    .attr("font-size", 12).attr("fill", "#5b8c5a")
    .attr("letter-spacing", "0.1em")
    .text("LOW RISK");
}

/* ============================================================
   4. PRICE TRENDS
   ============================================================ */
function drawPrices(prices) {
  const container = d3.select("#chart-prices");
  const W = 900, H = 480;
  const m = { top: 30, right: 140, bottom: 50, left: 70 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

  const byMat = d3.group(prices, d => d.material);

  // Build normalized series (% change from first available year for each mat)
  const normalized = [];
  byMat.forEach((rows, mat) => {
    const sorted = rows.slice().sort((a,b) => a.year - b.year);
    const base = sorted[0].value;
    sorted.forEach(r => normalized.push({
      material: mat, year: r.year,
      value: ((r.value - base) / base) * 100
    }));
  });
  const byMatNorm = d3.group(normalized, d => d.material);

  const x = d3.scaleLinear().domain(d3.extent(prices, d => d.year)).range([0, iw]);

  // Log scale for absolute (huge range: sulfur ~$25 vs rare earths ~$50k)
  const yAbs = d3.scaleLog().domain([10, 100000]).range([ih, 0]);
  const yNorm = d3.scaleLinear()
    .domain(d3.extent(normalized, d => d.value)).nice()
    .range([ih, 0]);

  const gridG = g.append("g").attr("class", "grid");
  const xAxisG = g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`);
  const yAxisG = g.append("g").attr("class", "axis");

  xAxisG.call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("d")))
    .call(s => s.select(".domain").remove());

  const yAxisLabel = g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -ih/2).attr("y", -85)
    .attr("text-anchor", "middle")
    .attr("font-family", "Inter, sans-serif")
    .attr("font-size", 20).attr("fill", "#4a4f54");

  const linesG = g.append("g");
  const labelsG = g.append("g");
  const annotG = g.append("g"); // annotations layer on top

  // Key event annotations — drawn once, shown in both modes via opacity
  const ANNOTATIONS = [
    { year: 2014, mat: "Rare Earths (La, Y)", text: "China scales up production", side: "below" },
    { year: 2018, mat: "Lithium (Li)",         text: "EV boom drives lithium surge", side: "above" },
    { year: 2020, mat: "Sulfur (S)",           text: "COVID demand shock", side: "below" },
    { year: 2016, mat: "Phosphate (P)",        text: "Morocco expands capacity", side: "above" }
  ];

  function render(mode) {
    const y = mode === "absolute" ? yAbs : yNorm;
    const src = mode === "absolute" ? byMat : byMatNorm;

    // For log scale, force tick values to powers of 10 only (no minor tick labels)
    const absTicks = [10, 100, 1000, 10000, 100000];
    const yAxisGen = mode === "absolute"
      ? d3.axisLeft(y).tickValues(absTicks).tickFormat(d => `$${d3.format(",")(d)}`)
      : d3.axisLeft(y).ticks(6).tickFormat(d => `${d}%`);
    const yGridGen = mode === "absolute"
      ? d3.axisLeft(y).tickValues(absTicks).tickSize(-iw).tickFormat("")
      : d3.axisLeft(y).ticks(6).tickSize(-iw).tickFormat("");

    gridG.transition().duration(500).call(yGridGen);
    yAxisG.transition().duration(500).call(yAxisGen)
      .call(s => s.select(".domain").remove());

    yAxisLabel.text(mode === "absolute" ? "Unit value ($/metric ton, log scale)" : "% change from 2012");

    const line = d3.line()
      .defined(d => !isNaN(d.value) && (mode === "absolute" ? d.value > 0 : true))
      .x(d => x(d.year))
      .y(d => y(d.value))
      .curve(d3.curveMonotoneX);

    const lines = linesG.selectAll("path.pline")
      .data(Array.from(src), d => d[0]);

    lines.enter().append("path")
      .attr("class","pline")
      .attr("fill","none")
      .attr("stroke-width", 2.2)
      .attr("stroke", d => MATERIAL_COLORS[d[0]])
      .merge(lines)
      .transition().duration(700)
      .attr("d", d => line(d[1].slice().sort((a,b) => a.year - b.year)));

    // End labels
    const labels = labelsG.selectAll("text.series-label")
      .data(Array.from(src), d => d[0]);

    labels.enter().append("text")
      .attr("class","series-label")
      .attr("fill", d => MATERIAL_COLORS[d[0]])
      .text(d => d[0])
      .merge(labels)
      .transition().duration(700)
      .attr("x", d => {
        const last = d[1].slice().sort((a,b) => b.year - a.year).find(r => !isNaN(r.value));
        return x(last.year) + 8;
      })
      .attr("y", d => {
        const last = d[1].slice().sort((a,b) => b.year - a.year).find(r => !isNaN(r.value));
        const nudge = {
          "Lithium (Li)": -10,
          "Rare Earths (La, Y)": 14,
          "Sulfur (S)": 4,
          "Phosphate (P)": 14
        };
        return y(last.value) + + (nudge[d[0]] || 4);
      });
  }

  render("absolute");

  // Draw annotations after first render
  function drawAnnotations(mode) {
    annotG.selectAll("*").remove();
    const y = mode === "absolute" ? yAbs : yNorm;
    const src = mode === "absolute" ? byMat : byMatNorm;

    ANNOTATIONS.forEach(ann => {
      const matData = src.get(ann.mat);
      if (!matData) return;
      const row = matData.find(r => r.year === ann.year);
      if (!row || isNaN(row.value)) return;
      if (mode === "absolute" && row.value <= 0) return;

      const cx = x(ann.year);
      const cy = y(row.value);
      const above = ann.side === "above";
      const color = MATERIAL_COLORS[ann.mat];

      // Dot on line
      annotG.append("circle")
        .attr("cx", cx).attr("cy", cy).attr("r", 4)
        .attr("fill", color).attr("stroke", "#fff").attr("stroke-width", 1.5);

      // Tick line
      annotG.append("line")
        .attr("x1", cx).attr("x2", cx)
        .attr("y1", cy).attr("y2", above ? cy - 22 : cy + 22)
        .attr("stroke", color).attr("stroke-width", 1).attr("stroke-dasharray", "3,2");

      // Label
      annotG.append("text")
        .attr("x", cx).attr("y", above ? cy - 26 : cy + 34)
        .attr("text-anchor", "middle")
        .attr("font-family", "Inter, sans-serif")
        .attr("font-size", 11).attr("fill", color)
        .attr("font-style", "italic")
        .text(ann.text);
    });
  }

  drawAnnotations("absolute");

  d3.selectAll("#price-toggle .pt-btn").on("click", function() {
    d3.selectAll("#price-toggle .pt-btn").classed("active", false);
    d3.select(this).classed("active", true);
    render(this.dataset.mode);
    drawAnnotations(this.dataset.mode);
  });
}

/* ============================================================
   5. CALCULATOR
   ============================================================ */
function drawCalculator(hhi, conductivity) {
  // Stoichiometric mass fractions (approximate, rounded to one decimal %)
  // Derived from formula weights; germanium in LAGP treated as "unmeasured" since
  // our dataset does not include Ge production.
  // `family` maps to OBELiX classification for pulling conductivity stats.
  const CHEMISTRIES = [
    {
      id: "llzo",
      name: "Oxide · LLZO",
      formula: "Li₇La₃Zr₂O₁₂",
      family: "oxide",
      note: "Oxide electrolyte.",
      weights: {
        "Lithium (Li)":        0.08,
        "Rare Earths (La, Y)": 0.52,  // La
        "Zirconium (Zr)":      0.22
      }
    },
    {
      id: "lpsc",
      name: "Sulfide · Li₆PS₅Cl",
      formula: "Li₆PS₅Cl",
      family: "sulfide",
      note: "Sulfide electrolyte.",
      weights: {
        "Lithium (Li)":  0.17,
        "Sulfur (S)":    0.39,
        "Phosphate (P)": 0.15   // P content
      }
    },
    {
      id: "lagp",
      name: "Phosphate · LAGP",
      formula: "Li₁.₅Al₀.₅Ge₁.₅(PO₄)₃",
      family: "phosphate",
      note: "Phosphate-based electrolyte. Germanium (Ge) share not in USGS dataset. Score reflects measurable inputs only.",
      weights: {
        "Lithium (Li)":  0.03,
        "Phosphate (P)": 0.28
      }
    }
  ];

  const hhiMap = new Map(hhi.map(d => [d.material, d.hhi]));
  const maxHHI = d3.max(hhi, d => d.hhi);

  // Index conductivity by family for O(1) lookup; null if file missing
  const condMap = conductivity
    ? new Map(conductivity.map(d => [d.family, d]))
    : null;

  // Format a log10 value as a compact scientific string, e.g. -3.1 → "7.9×10⁻⁴"
  function fmtSci(logVal) {
    const exp = Math.floor(logVal);
    const mantissa = Math.pow(10, logVal - exp);
    const supMap = { "-": "⁻", "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹" };
    const expStr = String(exp).split("").map(c => supMap[c] || c).join("");
    return `${mantissa.toFixed(1)}×10${expStr}`;
  }

  // Qualitative band for ionic conductivity. Useful thresholds from the solid-electrolyte literature:
  //   ~10⁻² S/cm — rivals liquid electrolytes
  //   ~10⁻³ S/cm — commercially viable for EVs
  //   ~10⁻⁴ S/cm — borderline, low-rate applications only
  //   ~10⁻⁵ S/cm — too low for most practical use
  function condBand(logVal) {
    if (logVal >= -2.5) return { label: "Excellent",  color: "#5b8c5a" };
    if (logVal >= -3.5) return { label: "Viable",     color: "#5b8c5a" };
    if (logVal >= -4.5) return { label: "Borderline", color: "#e6b34a" };
    return                   { label: "Poor",        color: "#b5482c" };
  }

  const picker = d3.select("#chem-picker");
  CHEMISTRIES.forEach((c, i) => {
    picker.append("button")
      .attr("class", "cp-btn" + (i === 0 ? " active" : ""))
      .attr("data-id", c.id)
      .html(`<span class="cp-title">${c.name}</span>
             <span class="cp-formula">${c.formula}</span>`)
      .on("click", function() {
        picker.selectAll(".cp-btn").classed("active", false);
        d3.select(this).classed("active", true);
        render(CHEMISTRIES.find(x => x.id === this.dataset.id));
      });
  });

  function render(chem) {
    // Normalize weights so they sum to 1 across measured materials
    const total = d3.sum(Object.values(chem.weights));
    const normWeights = Object.fromEntries(
      Object.entries(chem.weights).map(([k, v]) => [k, v / total])
    );

    // Composite HHI = Σ (normalized weight × material HHI)
    const compHHI = d3.sum(Object.entries(normWeights)
      .map(([mat, w]) => w * hhiMap.get(mat)));

    // Risk band
    let band, bandColor;
    if (compHHI < 1500)      { band = "Low risk";       bandColor = "#5b8c5a"; }
    else if (compHHI < 2500) { band = "Moderate risk";  bandColor = "#e6b34a"; }
    else                     { band = "High risk";      bandColor = "#b5482c"; }

    // Material icons
    const ICONS = {
      "Lithium (Li)":        "🔋",
      "Rare Earths (La, Y)": "🔭",
      "Zirconium (Zr)":      "✈️",
      "Sulfur (S)":          "🌋",
      "Phosphate (P)":       "🌾"
    };

    // Weights panel
    const weightsHTML = Object.entries(normWeights)
      .map(([mat, w]) => `${ICONS[mat] || "•"} ${mat}: <span style="color:${MATERIAL_COLORS[mat]}">${Math.round(w * 100)}%</span>`)
      .join("<br>");

    d3.select("#calc-weights")
      .html(`<div style="color:var(--ink);font-family:var(--font-body);font-size:16px;margin-bottom:10px;">
               ${chem.note}
             </div>
             <div style="margin-top:12px;">WEIGHTING (MASS FRACTION, NORMALIZED):</div>
             ${weightsHTML}`);

    // Output panel
    const out = d3.select("#calc-output");
    out.html("");
    out.append("div").attr("class","calc-score-label").text("COMPOSITE SUPPLY-CHAIN RISK");
    out.append("div").attr("class","calc-score")
      .style("color", bandColor)
      .text(`${d3.format(",")(Math.round(compHHI))}`);

    out.append("div").attr("class","calc-score-desc")
      .text(`${band}`);

    out.append("div").attr("class","calc-breakdown-title")
      .text("CONTRIBUTION TO RISK BY MATERIAL");

    // Sort contributions by descending HHI contribution
    const contribs = Object.entries(normWeights).map(([mat, w]) => ({
      mat, weight: w, hhi: hhiMap.get(mat),
      contribution: w * hhiMap.get(mat)
    })).sort((a, b) => b.contribution - a.contribution);

    // Total contribution = compHHI — use this so bars show true % of composite
    const totalContrib = compHHI;

    contribs.forEach(c => {
      const pct = Math.round((c.contribution / totalContrib) * 100);
      const row = out.append("div").attr("class","calc-bar-row");
      const label = row.append("div").attr("class","calc-bar-label")
        .style("font-size", "15px");
      // Icon + name on left
      label.append("span")
        .html(`${ICONS[c.mat] || ""} ${c.mat}`);
      // Percentage on right
      label.append("span")
        .style("font-family", "var(--font-mono)")
        .style("color", MATERIAL_COLORS[c.mat])
        .style("font-size", "15px")
        .text(`${pct}%`);
      const track = row.append("div").attr("class","calc-bar-track");
      track.append("div")
        .attr("class","calc-bar-fill")
        .style("background", MATERIAL_COLORS[c.mat])
        .style("width", "0%")
        .transition().duration(700)
        .style("width", `${pct}%`);
    });

    // -------- Performance (ionic conductivity) panel --------
    if (condMap && condMap.has(chem.family)) {
      const c = condMap.get(chem.family);
      const band = condBand(c.medianLog);

      out.append("div").attr("class", "calc-divider");

      out.append("div").attr("class","calc-score-label").text("TYPICAL IONIC CONDUCTIVITY");

      out.append("div").attr("class","calc-score")
        .style("color", band.color)
        .style("font-size", "44px")
        .html(fmtSci(c.medianLog) + ` <span style="font-size:20px;color:var(--ink-soft);font-weight:400;">S/cm</span>`);

      out.append("div").attr("class","calc-score-desc")
        .text(`${band.label} · median of ${c.n} measured ${chem.family} electrolytes`);

      // IQR range indicator — shows the spread
      const iqrNote = out.append("div")
        .attr("class", "calc-iqr")
        .html(`<span style="font-family:var(--font-mono);font-size:13px;letter-spacing:0.1em;color:var(--ink-soft);">RANGE</span><br>
               <span style="font-family:var(--font-mono);font-size:15px;color:var(--ink-soft);">
               ${fmtSci(c.p25Log)} — ${fmtSci(c.p75Log)} S/cm</span>`);

      out.append("div").attr("class","calc-source")
        .html(`Source: OBELiX dataset (Therrien et al. 2025), ${c.n} room-temperature measurements classified as ${chem.family}-family by composition.`);
    }
  }

  render(CHEMISTRIES[0]);
}
