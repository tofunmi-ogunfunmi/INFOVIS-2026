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
  drawRadar(hhi, conductivity, prices);
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
  let flowsVisible = false;

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
        if (flowsVisible) drawFlows(m);
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

  // Flow arcs layer — sits above countries, below labels
  const gFlows = svg.append("g").attr("class", "flow-layer");

  // Demand hub dots layer
  const gHubs = svg.append("g").attr("class", "hub-layer");

  // Disclaimer badge — hidden until flows shown
  const badge = svg.append("g")
    .attr("class", "flow-badge")
    .attr("transform", `translate(${W - 14}, 14)`)
    .attr("opacity", 0);

  badge.append("rect")
    .attr("x", -220).attr("y", 0)
    .attr("width", 220).attr("height", 28)
    .attr("rx", 3)
    .attr("fill", "#1a1e21")
    .attr("opacity", 0.82);

  badge.append("text")
    .attr("x", -110).attr("y", 18)
    .attr("text-anchor", "middle")
    .attr("font-family", "JetBrains Mono, monospace")
    .attr("font-size", 10)
    .attr("letter-spacing", "0.06em")
    .attr("fill", "#e6b34a")
    .text("⚠ FLOWS ARE ILLUSTRATIVE — NOT TRADE DATA");

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

  // Add CSS animation for dash flow
  const style = document.createElement("style");
  style.textContent = `
    @keyframes flowDash {
      from { stroke-dashoffset: 30; }
      to   { stroke-dashoffset: 0; }
    }
    .flow-arc {
      animation: flowDash 1.2s linear infinite;
    }
  `;
  document.head.appendChild(style);

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

  // --- Flow drawing ---
  function project([lon, lat]) {
    return projection([lon, lat]);
  }

  // Great-circle-ish arc: control point pulled toward the pole for a natural curve
  function arcPath(src, dst) {
    const [x1, y1] = src;
    const [x2, y2] = dst;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.25;
    return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
  }

  function drawFlows(material) {
    clearFlows();
    badge.transition().duration(300).attr("opacity", 1);

    const rows = production
      .filter(p => p.material === material)
      .sort((a, b) => b.share - a.share)
      .slice(0, 3);

    const maxShare = rows[0]?.share || 1;
    const matColor = MATERIAL_COLORS[material];

    // Just simple text labels for demand hubs — no dots or rings
    DEMAND_HUBS.forEach(hub => {
      const [hx, hy] = project([hub.lon, hub.lat]);
      if (!hx || !hy) return;
      gHubs.append("text")
        .attr("class", "hub-dot")
        .attr("x", hx).attr("y", hy - 6)
        .attr("text-anchor", "middle")
        .attr("font-family", "Inter, sans-serif")
        .attr("font-size", 12)
        .attr("font-weight", 600)
        .attr("fill", "#1a1e21")
        .text(hub.name);
    });

    // Arcs only — uniform thickness
    rows.forEach((row, ri) => {
      const coords = CENTROIDS[row.country];
      if (!coords) return;
      const src = project(coords);
      if (!src || !src[0]) return;

      DEMAND_HUBS.forEach((hub, hi) => {
        const dst = project([hub.lon, hub.lat]);
        if (!dst || !dst[0]) return;

        const dist = Math.hypot(src[0] - dst[0], src[1] - dst[1]);
        if (dist < 20) return;

        const delay = (ri * DEMAND_HUBS.length + hi) * 80;

        gFlows.append("path")
          .attr("class", "flow-arc")
          .attr("d", arcPath(src, dst))
          .attr("fill", "none")
          .attr("stroke", matColor)
          .attr("stroke-width", 1.5)
          .attr("stroke-opacity", 0.5)
          .attr("stroke-dasharray", "8 4")
          .attr("stroke-linecap", "round")
          .style("animation-delay", `${delay}ms`)
          .attr("opacity", 0)
          .transition().delay(delay).duration(400)
          .attr("opacity", 1);
      });
    });
  }

  function clearFlows() {
    gFlows.selectAll("*").remove();
    gHubs.selectAll("*").remove();
    badge.transition().duration(200).attr("opacity", 0);
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
  const FIXED_R = 20;

  // High-risk / low-risk zones
  g.append("rect")
    .attr("x", 0).attr("y", 0)
    .attr("width", iw).attr("height", y(2500))
    .attr("fill", "#b5482c").attr("opacity", 0.06);
  g.append("rect")
    .attr("x", 0).attr("y", y(1500))
    .attr("width", iw).attr("height", ih - y(1500))
    .attr("fill", "#5b8c5a").attr("opacity", 0.06);

  // Threshold line at HHI=2500 (standard "highly concentrated")
  g.append("line")
    .attr("x1", 0).attr("x2", iw)
    .attr("y1", y(2500)).attr("y2", y(2500))
    .attr("stroke", "#b5482c")
    .attr("stroke-dasharray", "4,4")
    .attr("stroke-width", 1);

  // g.append("text")
  //   .attr("x", 5).attr("y", y(2500) - 6)
  //   .attr("text-anchor", "start")
  //   .attr("font-family", "JetBrains Mono, monospace")
  //   .attr("font-size", 14)
  //   .attr("fill", "#b5482c")
  //   .text("HHI = 2,500 · highly concentrated threshold");

  // Gridlines
  g.append("g").attr("class","grid")
    .call(d3.axisLeft(y).ticks(6).tickSize(-iw).tickFormat(""))
    .attr("fill", "#f5efe0");

  // Axes
  g.append("g").attr("class","axis")
    .attr("transform",`translate(0,${ih})`)
    .attr("fill", "#f5efe0")
    .call(d3.axisBottom(x).ticks(7))
    .call(s => s.select(".domain").remove());
  g.append("g").attr("class","axis")
    .attr("fill", "#f5efe0")
    .call(d3.axisLeft(y).ticks(6).tickFormat(d3.format(",")))
    .call(s => s.select(".domain").remove());

  // Axis labels
  g.append("text")
    .attr("x", iw / 2).attr("y", ih + 44)
    .attr("text-anchor", "middle")
    .attr("font-family", "Inter, sans-serif")
    .attr("font-size", 20).attr("fill", "#f5efe0")
    .text("Number of producing countries");

  g.append("text")
    .attr("transform", `rotate(-90)`)
    .attr("x", -ih / 2).attr("y", -70)
    .attr("text-anchor", "middle")
    .attr("font-family", "Inter, sans-serif")
    .attr("font-size", 20).attr("fill", "#f5efe0")
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
    .attr("fill-opacity", 0.75)
    .attr("stroke", d => d.color)
    .attr("stroke-width", 1.5)
    .on("mouseenter", function(event, d) {
      d3.select(this).attr("fill-opacity", 1);
      showTip(`<strong>${d.material}</strong>
               HHI: <span class="tt-mono">${d3.format(",")(d.hhi)}</span><br>
               Producing countries: ${d.producers}<br>
               2024 world total: ${d3.format(",")(d.total)} t`, event);
    })
    .on("mousemove", moveTip)
    .on("mouseleave", function() {
      d3.select(this).attr("fill-opacity", 0.75);
      hideTip();
    })
    .transition().duration(900).delay((d,i) => i * 120)
    .attr("r", FIXED_R);

  // Per-material label placement to avoid bubble/line collisions.
  // "above" = above bubble; "below" = below bubble; offset tweaks horizontal.
  const LABEL_POS = {
    "Rare Earths (La, Y)": { side: "above", dx: 0 },
    "Phosphate (P)":       { side: "below", dx: 0 },
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
    //.attr("fill", "#e9e4d7")
    .attr("fill", d => MATERIAL_COLORS[d.material])
    .text(d => d.material)
    .attr("opacity", 0)
    .transition().delay(1200).duration(400).attr("opacity", 1);

  // Zone labels
  g.append("text")
    .attr("x", 16).attr("y", 15)
    .attr("font-family", "JetBrains Mono, monospace")
    .attr("font-size", 14)
    .attr("font-weight", 750)
    .attr("fill", "#b5482c")
    .attr("letter-spacing", "0.1em")
    .text("HIGH CONCENTRATION RISK");

  g.append("text")
    .attr("x", iw - 16).attr("y", ih - 14)
    .attr("text-anchor", "end")
    .attr("font-family", "JetBrains Mono, monospace")
    .attr("font-size", 14)
    .attr("font-weight", 750)
    .attr("fill", "#5b8c5a")
    .attr("letter-spacing", "0.1em")
    .text("LOW CONCENTRATION RISK");


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

  d3.selectAll("#price-toggle .pt-btn").on("click", function() {
    d3.selectAll("#price-toggle .pt-btn").classed("active", false);
    d3.select(this).classed("active", true);
    render(this.dataset.mode);
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

  // Material costs from USGS unit values (most recent available year)
  // Source: prices.csv — same dataset as Section 5 price chart
  const MATERIAL_COSTS = {
    "Lithium (Li)":        { price: 6200, year: 2021 },
    "Rare Earths (La, Y)": { price: 5130, year: 2020 },
    "Zirconium (Zr)":      { price: 1450, year: 2021 },
    "Phosphate (P)":       { price: 103,  year: 2022 },
    "Sulfur (S)":          { price: 178,  year: 2022 }
  };

  // Material icons used in bars and weights panel
  const ICONS = {
    "Lithium (Li)":        "🔋",
    "Rare Earths (La, Y)": "🔭",
    "Zirconium (Zr)":      "✈️",
    "Sulfur (S)":          "🌋",
    "Phosphate (P)":       "🌾"
  };

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
    const total = d3.sum(Object.values(chem.weights));
    const normWeights = Object.fromEntries(
      Object.entries(chem.weights).map(([k, v]) => [k, v / total])
    );

    const compHHI = d3.sum(Object.entries(normWeights)
      .map(([mat, w]) => w * hhiMap.get(mat)));

    let band, bandColor;
    if (compHHI < 1500)      { band = "Low risk";      bandColor = "#5b8c5a"; }
    else if (compHHI < 2500) { band = "Moderate risk"; bandColor = "#e6b34a"; }
    else                     { band = "High risk";     bandColor = "#b5482c"; }

    const weightsHTML = Object.entries(normWeights)
      .map(([mat, w]) => `${ICONS[mat] || "•"} ${mat}: <span style="color:${MATERIAL_COLORS[mat]}">${Math.round(w * 100)}%</span>`)
      .join("<br>");

    d3.select("#calc-weights")
      .html(`<div style="color:var(--ink);font-family:var(--font-body);font-size:16px;margin-bottom:10px;">
               ${chem.note}
             </div>
             <div style="margin-top:12px;">WEIGHTING (MASS FRACTION, NORMALIZED):</div>
             ${weightsHTML}`);

    const out = d3.select("#calc-output");
    out.html("");

    // ---- BLOCK 1: Risk ----
    out.append("div").attr("class","calc-score-label").text("COMPOSITE SUPPLY-CHAIN RISK");
    out.append("div").attr("class","calc-score")
      .style("color", bandColor)
      .text(`${d3.format(",")(Math.round(compHHI))}`);
    out.append("div").attr("class","calc-score-desc").text(band);
    out.append("div").attr("class","calc-breakdown-title")
      .text("CONTRIBUTION TO RISK BY MATERIAL");

    const contribs = Object.entries(normWeights).map(([mat, w]) => ({
      mat, weight: w, hhi: hhiMap.get(mat),
      contribution: w * hhiMap.get(mat)
    })).sort((a, b) => b.contribution - a.contribution);

    contribs.forEach(c => {
      const pct = Math.round((c.contribution / compHHI) * 100);
      const row = out.append("div").attr("class","calc-bar-row");
      const label = row.append("div").attr("class","calc-bar-label").style("font-size","15px");
      label.append("span").html(`${ICONS[c.mat] || ""} ${c.mat}`);
      label.append("span")
        .style("font-family","var(--font-mono)")
        .style("color", MATERIAL_COLORS[c.mat])
        .style("font-size","15px")
        .text(`${pct}%`);
      const track = row.append("div").attr("class","calc-bar-track");
      track.append("div").attr("class","calc-bar-fill")
        .style("background", MATERIAL_COLORS[c.mat])
        .style("width","0%")
        .transition().duration(700)
        .style("width",`${pct}%`);
    });

    // ---- BLOCK 2: Cost ----
    const weightedCost = d3.sum(Object.entries(normWeights).map(([mat, w]) => {
      const c = MATERIAL_COSTS[mat];
      return c ? w * c.price : 0;
    }));

    out.append("div").attr("class","calc-divider");
    out.append("div").attr("class","calc-score-label").text("ESTIMATED MATERIAL COST");
    out.append("div").attr("class","calc-score")
      .style("color","#5a5f64")
      .style("font-size","44px")
      .html(`$${d3.format(",")(Math.round(weightedCost))} <span style="font-size:18px;color:var(--ink-soft);font-weight:400;">/tonne (weighted avg.)</span>`);
    out.append("div").attr("class","calc-score-desc")
      .style("margin-bottom","16px")
      .text("Based on USGS unit values");
    out.append("div").attr("class","calc-breakdown-title")
      .text("COST CONTRIBUTION BY MATERIAL");

    const costContribs = Object.entries(normWeights)
      .filter(([mat]) => MATERIAL_COSTS[mat])
      .map(([mat, w]) => ({
        mat, weight: w,
        price: MATERIAL_COSTS[mat].price,
        contribution: w * MATERIAL_COSTS[mat].price
      }))
      .sort((a, b) => b.contribution - a.contribution);

    const totalCost = d3.sum(costContribs, d => d.contribution);

    costContribs.forEach(c => {
      const pct = Math.round((c.contribution / totalCost) * 100);
      const row = out.append("div").attr("class","calc-bar-row");
      const label = row.append("div").attr("class","calc-bar-label").style("font-size","15px");
      label.append("span").html(`${ICONS[c.mat] || ""} ${c.mat}`);
      label.append("span")
        .style("font-family","var(--font-mono)")
        .style("color","var(--ink-soft)")
        .style("font-size","13px")
        .text(`$${d3.format(",")(c.price)}/t · ${pct}%`);
      const track = row.append("div").attr("class","calc-bar-track");
      track.append("div").attr("class","calc-bar-fill")
        .style("background", MATERIAL_COLORS[c.mat])
        .style("opacity","0.7")
        .style("width","0%")
        .transition().duration(700)
        .style("width",`${pct}%`);
    });

    out.append("div").attr("class","calc-source")
      .text("Source: USGS unit values. Most recent available year per material (2020–2022).");

    // ---- BLOCK 3: Conductivity ----
    if (condMap && condMap.has(chem.family)) {
      const c = condMap.get(chem.family);
      const band = condBand(c.medianLog);

      out.append("div").attr("class","calc-divider");
      out.append("div").attr("class","calc-score-label").text("TYPICAL IONIC CONDUCTIVITY");
      out.append("div").attr("class","calc-score")
        .style("color", band.color)
        .style("font-size","44px")
        .html(fmtSci(c.medianLog) + ` <span style="font-size:20px;color:var(--ink-soft);font-weight:400;">S/cm</span>`);
      out.append("div").attr("class","calc-score-desc")
        .text(`${band.label} · median of ${c.n} measured ${chem.family} electrolytes`);
      out.append("div").attr("class","calc-iqr")
        .html(`<span style="font-family:var(--font-mono);font-size:13px;letter-spacing:0.1em;color:var(--ink-soft);">RANGE</span><br>
               <span style="font-family:var(--font-mono);font-size:15px;color:var(--ink-soft);">
               ${fmtSci(c.p25Log)} — ${fmtSci(c.p75Log)} S/cm</span>`);
      out.append("div").attr("class","calc-source")
        .html(`Source: OBELiX dataset (Therrien et al. 2025), ${c.n} room-temperature measurements classified as ${chem.family}-family by composition.`);
    }
  }
 render(CHEMISTRIES[0]);
}

/* ============================================================
   6. RADAR CHART — Section 2 chemistry comparison
   ============================================================ */
function drawRadar(hhi, conductivity, prices) {
  const container = d3.select("#chart-radar");
  if (container.empty()) return;
  container.selectAll("*").remove();

  // --- Scoring Logic ---
  function getStabilityScore(materialName) {
    if (!prices) return 5;
    const matPrices = prices.filter(d => d.material === materialName).map(d => d.value);
    if (matPrices.length < 2) return 5;
    const mean = d3.mean(matPrices), stdDev = d3.deviation(matPrices);
    return Math.max(0, Math.min(10, (1 / (1 + (stdDev / mean) * 4.0)) * 10));
  }

  function condScore(family) {
    if (!conductivity) return 5;
    const familyData = conductivity.find(d => d.family === family);
    if (!familyData) return 5;
    return Math.max(0, Math.min(10, ((familyData.medianLog + 5) / 3) * 10));
  }

  const hhiMap = new Map(hhi.map(d => [d.material, d.hhi]));
  const WEIGHTS = {
    llzo: { "Lithium (Li)": 0.08, "Rare Earths (La, Y)": 0.52, "Zirconium (Zr)": 0.22 },
    lpsc: { "Lithium (Li)": 0.17, "Sulfur (S)": 0.39, "Phosphate (P)": 0.15 },
    lagp: { "Lithium (Li)": 0.03, "Phosphate (P)": 0.28 }
  };

  const getCompStability = (w) => d3.sum(Object.entries(w).map(([mat, v]) => (v/d3.sum(Object.values(w))) * getStabilityScore(mat)));
  const getCompHHI = (w) => d3.sum(Object.entries(w).map(([mat, v]) => (v/d3.sum(Object.values(w))) * (hhiMap.get(mat) || 0)));

  const hhiScores = [getCompHHI(WEIGHTS.llzo), getCompHHI(WEIGHTS.lpsc), getCompHHI(WEIGHTS.lagp)];
  const maxHHI = Math.max(...hhiScores);

  const AXES = [
    { name: "Ionic Conductivity", desc: "10 = High conductivity (10⁻² S/cm), 0 = Poor (10⁻⁵ S/cm)" },
    { name: "Price Stability", desc: "10 = Constant prices (Low CV), 0 = Volatile prices (High CV)" },
    { name: "Geographic Distribution", desc: "10 = Globally diverse production, 0 = High monopoly risk (HHI)" }
  ];

  const CHEMDATA = [
    { name: "Oxide · LLZO", color: MATERIAL_COLORS["Rare Earths (La, Y)"], scores: [condScore("oxide"), getCompStability(WEIGHTS.llzo), (1 - hhiScores[0]/maxHHI)*10] },
    { name: "Sulfide · Li₆PS₅Cl", color: MATERIAL_COLORS["Sulfur (S)"], scores: [condScore("sulfide"), getCompStability(WEIGHTS.lpsc), (1 - hhiScores[1]/maxHHI)*10] },
    { name: "Phosphate · LAGP", color: MATERIAL_COLORS["Phosphate (P)"], scores: [condScore("phosphate"), getCompStability(WEIGHTS.lagp), (1 - hhiScores[2]/maxHHI)*10] }
  ];

  // --- Visual Config ---
  const W = 640, H = 500, cx = 290, cy = 250, maxR = 160;
  const svg = container.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
  const g = svg.append("g");
  const angle = i => (Math.PI * 2 * i / 3) - Math.PI / 2;

  // Grid Rings with Score Labels
  [2, 4, 6, 8, 10].forEach(level => {
    const pts = [0, 1, 2].map(i => [cx + (level/10)*maxR*Math.cos(angle(i)), cy + (level/10)*maxR*Math.sin(angle(i))]);
    g.append("polygon").attr("points", pts.map(p => p.join(",")).join(" ")).attr("fill", "none").attr("stroke", "#d8d2c3").attr("stroke-width", 0.8);
    g.append("text").attr("x", cx + (level/10)*maxR*Math.cos(angle(0)) + 5).attr("y", cy + (level/10)*maxR*Math.sin(angle(0))).attr("font-size", 9).attr("fill", "#b8b3a4").text(level);
  });

  // Axis Labels with Info Tooltips
  AXES.forEach((axis, i) => {
    const lx = cx + (maxR + 35) * Math.cos(angle(i)), ly = cy + (maxR + 35) * Math.sin(angle(i));
    const label = g.append("text")
      .attr("x", lx).attr("y", ly).attr("text-anchor", "middle")
      .attr("font-family", "Inter, sans-serif").attr("font-weight", 700).attr("fill", "#1a1e21")
      .style("cursor", "help").text(axis.name);
    
    label.on("mouseenter", (e) => showTip(`<strong>${axis.name}</strong><br>${axis.desc}`, e)).on("mouseleave", hideTip);
  });

  // Polygons
  CHEMDATA.reverse().forEach(chem => {
    const pts = chem.scores.map((v, i) => [cx + (v/10)*maxR*Math.cos(angle(i)), cy + (v/10)*maxR*Math.sin(angle(i))]);
    g.append("polygon").attr("points", pts.map(p => p.join(",")).join(" "))
      .attr("fill", chem.color).attr("fill-opacity", 0.15).attr("stroke", chem.color).attr("stroke-width", 2.5);
    pts.forEach(p => g.append("circle").attr("cx", p[0]).attr("cy", p[1]).attr("r", 5).attr("fill", chem.color).attr("stroke", "#fbf9f4"));
  });

  // --- NEW LEGEND ---
  const legend = g.append("g").attr("transform", `translate(${W - 160}, 20)`);
  CHEMDATA.forEach((chem, i) => {
    const row = legend.append("g").attr("transform", `translate(0, ${i * 25})`);
    row.append("rect").attr("width", 12).attr("height", 12).attr("fill", chem.color).attr("rx", 2);
    row.append("text").attr("x", 18).attr("y", 10).attr("font-size", 12).attr("font-weight", 500).attr("fill", "#1a1e21").text(chem.name);
  });
}
