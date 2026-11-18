const ageBarColors = ["#49396f", "#46617d", "#367d84", "#2d9182", "#58ae77", "#9bc64e"];
const pieColors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b"];
const shareBarColors = ["#315c45", "#5a7c69", "#7d906b", "#9caf5b", "#baa047", "#a47b5d"];
let analysisData;
let shareChartType = "bar";

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

document.querySelectorAll(".page-tab").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view;
    document.querySelectorAll(".page-tab").forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle("active", active);
      if (active) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });
    document.querySelectorAll(".view").forEach((section) => {
      const active = section.id === `${view}-view`;
      section.hidden = !active;
      section.classList.toggle("active", active);
    });
    document.querySelector("#page-number").textContent =
      view === "predict" ? "PROPERTY VALUATION / 01" : "DATA ANALYSIS / 02";
    if (view === "analysis" && !analysisData) loadAnalysis();
  });
});

const predictionForm = document.querySelector("#prediction-form");
predictionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!predictionForm.reportValidity()) return;

  const payload = Object.fromEntries(new FormData(predictionForm));
  for (const key of Object.keys(payload)) {
    if (key !== "Age_Group") payload[key] = Number(payload[key]);
  }

  const button = predictionForm.querySelector('button[type="submit"]');
  button.disabled = true;
  button.querySelector("span:first-child").textContent = "Estimating…";
  document.querySelector("#form-message").textContent = "";
  document.querySelector("#estimate-message").textContent = "";
  try {
    const response = await fetch("/housePrice_prediction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      const detail = Array.isArray(result.detail)
        ? result.detail.map((item) => item.msg).join(", ")
        : result.detail;
      throw new Error(detail || "The model could not make a prediction.");
    }
    document.querySelector("#result-price").textContent = `$${result.prediction.toFixed(2)}`;
    document.querySelector("#result-scale").textContent =
      `in $100,000s · approximately ${dollars.format(result.prediction_usd)}`;
  } catch (error) {
    document.querySelector("#form-message").textContent =
      error.message || "Unable to reach the prediction service.";
    document.querySelector("#estimate-message").textContent =
      "Estimate unavailable. Check the supplied values and try again.";
  } finally {
    button.disabled = false;
    button.querySelector("span:first-child").textContent = "Estimate house price";
  }
});

async function loadAnalysis() {
  try {
    const response = await fetch("/api/analysis");
    if (!response.ok) throw new Error("Unable to load the report analysis.");
    analysisData = await response.json();
    drawAgePrice(analysisData.age_groups);
    drawAgeShare(analysisData.age_groups);
    drawBoxPlot("#population-boxplot", analysisData.population_box, "Population", 36000, 5000);
    drawBoxPlot("#price-boxplot", analysisData.price_box, "price", 5, 1);
    drawHeatmap(analysisData.correlation_features, analysisData.correlation);
    drawPredictions(analysisData.training_predictions);
  } catch (error) {
    document.querySelectorAll(".figure-area").forEach((figure) => {
      figure.textContent = error.message || "Unable to load this chart.";
    });
  }
}

function drawAgePrice(groups) {
  const width = 680;
  const height = 355;
  const plot = { left: 62, right: 18, top: 37, bottom: 55 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const max = 3;
  const y = (value) => plot.top + plotHeight - (value / max) * plotHeight;
  const ticks = Array.from({ length: 7 }, (_, index) => index * 0.5);
  const grid = ticks.map((tick) => `
    <line x1="${plot.left}" y1="${y(tick)}" x2="${width - plot.right}" y2="${y(tick)}" stroke="#e5e8e3"/>
    <text x="${plot.left - 10}" y="${y(tick) + 4}" text-anchor="end" class="axis-tick">${tick.toFixed(1)}</text>
  `).join("");
  const slot = plotWidth / groups.length;
  const barWidth = slot * 0.78;
  const bars = groups.map((group, index) => {
    const x = plot.left + index * slot + (slot - barWidth) / 2;
    return `
      <rect x="${x}" y="${y(group.average_price)}" width="${barWidth}" height="${plot.top + plotHeight - y(group.average_price)}" fill="${ageBarColors[index]}">
        <title>${group.label}: ${group.average_price.toFixed(2)}</title>
      </rect>
      <text x="${x + barWidth / 2}" y="${height - 31}" text-anchor="middle" class="axis-tick">${group.label}</text>
    `;
  }).join("");
  document.querySelector("#age-price-chart").innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <text x="${width / 2}" y="17" text-anchor="middle" class="plot-title">Average House Price by House Age Group</text>
      ${grid}
      <path d="M${plot.left} ${plot.top}V${plot.top + plotHeight}H${width - plot.right}" fill="none" stroke="#4b514c"/>
      ${bars}
      <text x="${width / 2}" y="${height - 5}" text-anchor="middle" class="axis-title">House Age Group</text>
      <text transform="translate(16 ${plot.top + plotHeight / 2}) rotate(-90)" text-anchor="middle" class="axis-title">Average Price</text>
    </svg>
  `;
}

function drawAgeShare(groups) {
  const container = document.querySelector("#age-share-chart");
  if (shareChartType === "pie") {
    drawAgePie(container, groups);
    return;
  }
  drawAgeBars(container, groups);
}

function drawAgeBars(container, groups) {
  const width = 690;
  const height = 355;
  const left = 95;
  const right = 54;
  const top = 23;
  const rowHeight = 48;
  const barHeight = 25;
  const max = 30;
  const barWidth = width - left - right;
  const rows = groups.map((group, index) => {
    const y = top + index * rowHeight;
    const fillWidth = barWidth * group.share / max;
    return `
      <text x="0" y="${y + 18}" class="axis-label">${group.label}</text>
      <rect x="${left}" y="${y}" width="${barWidth}" height="${barHeight}" fill="#f1f3ef"/>
      <rect x="${left}" y="${y}" width="${fillWidth}" height="${barHeight}" fill="${shareBarColors[index]}"/>
      <text x="${width - 1}" y="${y + 18}" text-anchor="end" class="axis-label">${group.share.toFixed(1)}%</text>
    `;
  }).join("");
  const ticks = [0, 10, 20, 30].map((tick) => {
    const x = left + barWidth * tick / max;
    return `<line x1="${x}" y1="${top - 4}" x2="${x}" y2="${top + rowHeight * groups.length - 4}" stroke="#dce1db" stroke-width="1"/><text x="${x}" y="${height - 13}" text-anchor="middle" class="axis-tick">${tick}%</text>`;
  }).join("");
  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      ${ticks}${rows}
      <text x="${left}" y="${height - 1}" class="axis-title">Age of homes and share of the dataset</text>
    </svg>
  `;
}

function drawAgePie(container, groups) {
  const sorted = [...groups].sort((a, b) => b.share - a.share);
  const width = 690;
  const height = 355;
  const centerX = width / 2;
  const centerY = 192;
  const radius = 130;
  let angle = -Math.PI / 2;
  const slices = sorted.map((group, index) => {
    const start = angle;
    const end = start + (group.share / 100) * Math.PI * 2;
    const x1 = centerX + radius * Math.cos(start);
    const y1 = centerY + radius * Math.sin(start);
    const x2 = centerX + radius * Math.cos(end);
    const y2 = centerY + radius * Math.sin(end);
    const largeArc = group.share > 50 ? 1 : 0;
    const mid = start + (end - start) / 2;
    const labelRadius = radius + 24;
    const labelX = centerX + labelRadius * Math.cos(mid);
    const labelY = centerY + labelRadius * Math.sin(mid);
    const percentX = centerX + radius * 0.58 * Math.cos(mid);
    const percentY = centerY + radius * 0.58 * Math.sin(mid);
    angle = end;
    return `
      <path d="M${centerX} ${centerY} L${x1} ${y1} A${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${pieColors[index]}" stroke="#fff" stroke-width="1.5">
        <title>${group.label}: ${group.share.toFixed(1)}%</title>
      </path>
      <text x="${percentX}" y="${percentY + 4}" text-anchor="middle" class="pie-percent">${group.share.toFixed(1)}%</text>
      <text x="${labelX}" y="${labelY + 4}" text-anchor="${Math.cos(mid) > 0.12 ? "start" : Math.cos(mid) < -0.12 ? "end" : "middle"}" class="axis-label">${group.label}</text>
    `;
  }).join("");
  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <text x="${centerX}" y="19" text-anchor="middle" class="plot-title">Distribution of Houses by Age Group</text>
      ${slices}
    </svg>
  `;
}

function drawBoxPlot(selector, stats, axisLabel, max, tickStep) {
  const width = 690;
  const height = 285;
  const left = 28;
  const right = 16;
  const top = 41;
  const axisY = 220;
  const plotWidth = width - left - right;
  const x = (value) => left + (value / max) * plotWidth;
  const centerY = 143;
  const boxHeight = 156;
  const ticks = [];
  for (let tick = 0; tick <= max; tick += tickStep) {
    const tickX = x(tick);
    ticks.push(`
      <line x1="${tickX}" y1="${top}" x2="${tickX}" y2="${axisY}" stroke="#edf0eb"/>
      <text x="${tickX}" y="${axisY + 20}" text-anchor="middle" class="axis-tick">${axisLabel === "Population" ? tick.toLocaleString("en-US") : tick.toFixed(0)}</text>
    `);
  }
  const outliers = stats.outliers.map((value, index) => {
    const jitter = ((index * 37) % 17) - 8;
    return `<circle cx="${x(value)}" cy="${centerY + jitter}" r="3.3" fill="white" fill-opacity=".72" stroke="#454b46" stroke-width="1"><title>${axisLabel}: ${value}</title></circle>`;
  }).join("");
  const valueSuffix = axisLabel === "Population" ? "Population" : "price";
  document.querySelector(selector).innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <text x="${width / 2}" y="20" text-anchor="middle" class="plot-title">Box Plot for ${valueSuffix}</text>
      ${ticks.join("")}
      <line x1="${x(stats.lower_whisker)}" y1="${centerY}" x2="${x(stats.q1)}" y2="${centerY}" stroke="#535a54" stroke-width="1.5"/>
      <line x1="${x(stats.q3)}" y1="${centerY}" x2="${x(stats.upper_whisker)}" y2="${centerY}" stroke="#535a54" stroke-width="1.5"/>
      <line x1="${x(stats.lower_whisker)}" y1="${centerY - 38}" x2="${x(stats.lower_whisker)}" y2="${centerY + 38}" stroke="#535a54" stroke-width="1.5"/>
      <line x1="${x(stats.upper_whisker)}" y1="${centerY - 38}" x2="${x(stats.upper_whisker)}" y2="${centerY + 38}" stroke="#535a54" stroke-width="1.5"/>
      <rect x="${x(stats.q1)}" y="${centerY - boxHeight / 2}" width="${Math.max(1, x(stats.q3) - x(stats.q1))}" height="${boxHeight}" fill="#377ca5" stroke="#4d5650"/>
      <line x1="${x(stats.median)}" y1="${centerY - boxHeight / 2}" x2="${x(stats.median)}" y2="${centerY + boxHeight / 2}" stroke="#33443b" stroke-width="2"/>
      ${outliers}
      <path d="M${left} ${axisY}H${width - right}" stroke="#4b514c" fill="none"/>
      <text x="${width / 2}" y="${height - 9}" text-anchor="middle" class="axis-title">${axisLabel}</text>
    </svg>
  `;
}

function correlationLabel(value) {
  if (Object.is(value, -0)) return "-0.0";
  return value.toFixed(1);
}

function blues(value) {
  const t = Math.max(0, Math.min(1, (value + 1) / 2));
  const from = [247, 251, 255];
  const to = [8, 48, 107];
  return `rgb(${from.map((channel, index) => Math.round(channel + (to[index] - channel) * t)).join(",")})`;
}

function drawHeatmap(labels, matrix) {
  const cell = 54;
  const left = 120;
  const top = 24;
  const colorX = left + cell * labels.length + 36;
  const width = colorX + 64;
  const height = top + cell * labels.length + 118;
  const cells = matrix.map((row, rowIndex) => row.map((value, columnIndex) => {
    const cx = left + columnIndex * cell;
    const cy = top + rowIndex * cell;
    const foreground = value > 0.45 ? "#fff" : "#23313a";
    return `
      <rect x="${cx}" y="${cy}" width="${cell}" height="${cell}" fill="${blues(value)}"/>
      <text x="${cx + cell / 2}" y="${cy + cell / 2 + 4}" text-anchor="middle" fill="${foreground}" class="heat-value">${correlationLabel(value)}</text>
    `;
  }).join("")).join("");
  const rowLabels = labels.map((label, index) =>
    `<text x="${left - 9}" y="${top + index * cell + cell / 2 + 4}" text-anchor="end" class="heat-label">${label}</text>`
  ).join("");
  const columnLabels = labels.map((label, index) => {
    const cx = left + index * cell + cell / 2;
    const cy = top + labels.length * cell + 9;
    return `<text transform="translate(${cx} ${cy}) rotate(-90)" text-anchor="end" class="heat-label">${label}</text>`;
  }).join("");
  const scaleHeight = cell * labels.length;
  const scale = `
    <defs>
      <linearGradient id="heat-scale" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stop-color="${blues(-1)}"/>
        <stop offset="100%" stop-color="${blues(1)}"/>
      </linearGradient>
    </defs>
    <rect x="${colorX}" y="${top}" width="19" height="${scaleHeight}" fill="url(#heat-scale)"/>
    ${[-1, -0.5, 0, 0.5, 1].map((value) => {
      const y = top + scaleHeight * (1 - (value + 1) / 2);
      return `<text x="${colorX + 26}" y="${y + 4}" class="axis-tick">${value.toFixed(2)}</text>`;
    }).join("")}
  `;
  document.querySelector("#correlation-heatmap").innerHTML = `
    <svg class="chart-svg heatmap-svg" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      ${cells}${rowLabels}${columnLabels}${scale}
    </svg>
  `;
}

function drawPredictions(points) {
  const width = 690;
  const height = 300;
  const plot = { left: 50, right: 18, top: 18, bottom: 48 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const max = 5;
  const px = (value) => plot.left + value / max * plotWidth;
  const py = (value) => plot.top + plotHeight - value / max * plotHeight;
  const ticks = Array.from({ length: 6 }, (_, index) => {
    const tick = index;
    return `
      <line x1="${px(tick)}" y1="${plot.top}" x2="${px(tick)}" y2="${plot.top + plotHeight}" stroke="#e7e9e5"/>
      <line x1="${plot.left}" y1="${py(tick)}" x2="${plot.left + plotWidth}" y2="${py(tick)}" stroke="#e7e9e5"/>
      <text x="${px(tick)}" y="${height - 25}" text-anchor="middle" class="axis-tick">${tick}</text>
      <text x="${plot.left - 10}" y="${py(tick) + 4}" text-anchor="end" class="axis-tick">${tick}</text>
    `;
  }).join("");
  const pointsSvg = points.map(([actual, predicted]) =>
    `<circle cx="${px(actual)}" cy="${py(predicted)}" r="2.3" fill="#28769a" fill-opacity=".43"><title>Actual: ${actual}; predicted: ${predicted}</title></circle>`
  ).join("");
  document.querySelector("#training-predictions").innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      ${ticks}
      <line x1="${px(0)}" y1="${py(0)}" x2="${px(max)}" y2="${py(max)}" stroke="#7a8a7f" stroke-dasharray="4 4"/>
      ${pointsSvg}
      <path d="M${plot.left} ${plot.top + plotHeight}H${plot.left + plotWidth}M${plot.left} ${plot.top}V${plot.top + plotHeight}" fill="none" stroke="#4b514c"/>
      <text x="${plot.left + plotWidth / 2}" y="${height - 4}" text-anchor="middle" class="axis-title">Actual Price</text>
      <text transform="translate(13 ${plot.top + plotHeight / 2}) rotate(-90)" text-anchor="middle" class="axis-title">Predicted Price</text>
    </svg>
  `;
}

document.querySelectorAll(".chart-mode").forEach((button) => {
  button.addEventListener("click", () => {
    shareChartType = button.dataset.chart;
    document.querySelectorAll(".chart-mode").forEach((mode) => {
      const active = mode === button;
      mode.classList.toggle("active", active);
      mode.setAttribute("aria-pressed", String(active));
    });
    document.querySelector("#age-share-status").textContent =
      `Showing ${shareChartType} chart.`;
    if (analysisData) drawAgeShare(analysisData.age_groups);
  });
});

predictionForm.requestSubmit();
