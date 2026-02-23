import * as d3 from "d3";
import type { DogBreed } from "@/types/dogBreed";

export type BoxMetricKey = "height" | "weight" | "life";

export type BoxMetric = {
  key: BoxMetricKey;
  label: string;
  unit: string;
};

export const BOX_METRICS: BoxMetric[] = [
  { key: "height", label: "Height", unit: "cm" },
  { key: "weight", label: "Weight", unit: "kg" },
  { key: "life", label: "Life span", unit: "yr" },
];

// ---------- helpers ----------
function parseRangeNums(s?: string): [number, number] | null {
  if (!s) return null;
  const nums = (s.match(/(\d+(\.\d+)?)/g) || []).map((x) => Number(x));
  if (nums.length === 0) return null;
  if (nums.length === 1) {
    const v = nums[0]!;
    return [v, v];
  }
  const a = nums[0]!;
  const b = nums[1]!;
  return [Math.min(a, b), Math.max(a, b)];
}

function inchesToCm(x: number) {
  return x * 2.54;
}
function lbToKg(x: number) {
  return x * 0.45359237;
}

function getHeightRangeCm(d: DogBreed): [number, number] | null {
  const obj: any = d;

  // ✅ API Ninjas (inches): min/max male/female
  const hm = typeof obj.min_height_male === "number" ? obj.min_height_male : null;
  const hM = typeof obj.max_height_male === "number" ? obj.max_height_male : null;
  const hf = typeof obj.min_height_female === "number" ? obj.min_height_female : null;
  const hF = typeof obj.max_height_female === "number" ? obj.max_height_female : null;

  const mins = [hm, hf].filter((v) => typeof v === "number") as number[];
  const maxs = [hM, hF].filter((v) => typeof v === "number") as number[];
  if (mins.length && maxs.length) {
    return [inchesToCm(Math.min(...mins)), inchesToCm(Math.max(...maxs))];
  }

  // fallback TheDogAPI
  const metric = obj?.height?.metric as string | undefined;
  const imperial = obj?.height?.imperial as string | undefined;
  const rMetric = parseRangeNums(metric);
  if (rMetric) return rMetric;
  const rImp = parseRangeNums(imperial);
  if (rImp) return [inchesToCm(rImp[0]), inchesToCm(rImp[1])];

  return null;
}

function getWeightRangeKg(d: DogBreed): [number, number] | null {
  const obj: any = d;

  // ✅ API Ninjas (pounds): min/max male/female
  const wm = typeof obj.min_weight_male === "number" ? obj.min_weight_male : null;
  const wM = typeof obj.max_weight_male === "number" ? obj.max_weight_male : null;
  const wf = typeof obj.min_weight_female === "number" ? obj.min_weight_female : null;
  const wF = typeof obj.max_weight_female === "number" ? obj.max_weight_female : null;

  const mins = [wm, wf].filter((v) => typeof v === "number") as number[];
  const maxs = [wM, wF].filter((v) => typeof v === "number") as number[];
  if (mins.length && maxs.length) {
    return [lbToKg(Math.min(...mins)), lbToKg(Math.max(...maxs))];
  }

  // fallback TheDogAPI
  const metric = obj?.weight?.metric as string | undefined;
  const imperial = obj?.weight?.imperial as string | undefined;
  const rMetric = parseRangeNums(metric);
  if (rMetric) return rMetric;
  const rImp = parseRangeNums(imperial);
  if (rImp) return [lbToKg(rImp[0]), lbToKg(rImp[1])];

  return null;
}

function getLifeRangeYr(d: DogBreed): [number, number] | null {
  const obj: any = d;

  // ✅ API Ninjas (years)
  const a = typeof obj.min_life_expectancy === "number" ? obj.min_life_expectancy : null;
  const b = typeof obj.max_life_expectancy === "number" ? obj.max_life_expectancy : null;
  if (typeof a === "number" && typeof b === "number") {
    return [Math.min(a, b), Math.max(a, b)];
  }

  // fallback TheDogAPI: "10 - 12 years"
  const s = obj?.life_span as string | undefined;
  return parseRangeNums(s);
}

function getRangeByKey(d: DogBreed, key: BoxMetricKey): [number, number] | null {
  if (key === "height") return getHeightRangeCm(d);
  if (key === "weight") return getWeightRangeKg(d);
  return getLifeRangeYr(d);
}

function midValue(range: [number, number]) {
  return (range[0] + range[1]) / 2;
}

type MetricStats = {
  min: number;
  max: number;
  q1: number;
  median: number;
  q3: number;
  whiskerLow: number;
  whiskerHigh: number;
  outliers: number[];
mean: number;
};

function computeBoxStats(values: number[]): MetricStats | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length < 5) return null;

  const min = v[0]!;
  const max = v[v.length - 1]!;
  const q1 = d3.quantile(v, 0.25)!;
  const median = d3.quantile(v, 0.5)!;
  const q3 = d3.quantile(v, 0.75)!;

  const iqr = q3 - q1;
  const lowFence = q1 - 1.5 * iqr;
  const highFence = q3 + 1.5 * iqr;

  const whiskerLow = d3.min(v.filter((x) => x >= lowFence)) ?? min;
  const whiskerHigh = d3.max(v.filter((x) => x <= highFence)) ?? max;

  const outliers = v.filter((x) => x < lowFence || x > highFence);
  const mean = d3.mean(v) ?? median;

  return { min, max, q1, median, q3, whiskerLow, whiskerHigh, outliers,mean };
}

export type DrawBoxPlotOptions = {
  width: number;
  height: number;
  colors: string[]; // selected dogs colors aligned with selectedDogs order
  focusIndex: number | null; // 0..selectedDogs-1
  onToggleFocus?: (i: number) => void;
};

export function drawBoxPlotChart(
  el: HTMLElement,
  allDogs: DogBreed[],
  selectedDogs: DogBreed[],
  opts: DrawBoxPlotOptions
) {
  const { width, height, colors, focusIndex, onToggleFocus } = opts;

  const outerMargin = { top: 18, right: 18, bottom: 18, left: 18 };
  const innerW = Math.max(10, width - outerMargin.left - outerMargin.right);
  const innerH = Math.max(10, height - outerMargin.top - outerMargin.bottom);

  el.innerHTML = "";

  const svg = d3
    .select(el)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "none");

  const root = svg
    .append("g")
    .attr("transform", `translate(${outerMargin.left},${outerMargin.top})`);

  if (!allDogs.length) {
    root
      .append("text")
      .attr("x", innerW / 2)
      .attr("y", innerH / 2)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("opacity", 0.7)
      .text("No data");
    return;
  }

  // one tooltip for whole chart
  const tip = d3
    .select(el)
    .append("div")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("padding", "6px 8px")
    .style("border-radius", "8px")
    .style("background", "rgba(255,255,255,0.95)")
    .style("box-shadow", "0 6px 18px rgba(0,0,0,0.12)")
    .style("font-size", "12px")
    .style("opacity", 0);

  const facetGap = 26;
  const facetW = (innerW - facetGap * (BOX_METRICS.length - 1)) / BOX_METRICS.length;

  const m = { top: 22, right: 10, bottom: 12, left: 44 };
  const plotW = Math.max(10, facetW - m.left - m.right);
  const plotH = Math.max(10, innerH - m.top - m.bottom);

  const isFocused = (i: number) => focusIndex == null || focusIndex === i;
  const lineOpacity = (i: number) => (isFocused(i) ? 0.95 : 0.22);

  BOX_METRICS.forEach((metric, facetIndex) => {
    const facetX = facetIndex * (facetW + facetGap);
    const facet = root.append("g").attr("transform", `translate(${facetX},0)`);

    facet
      .append("text")
      .attr("x", 0)
      .attr("y", 14)
      .style("font-weight", 600)
      .text(`${metric.label} (${metric.unit})`);

    const g = facet.append("g").attr("transform", `translate(${m.left},${m.top})`);

    // all-dogs values (midpoint of min/max range)
    const allValues: number[] = [];
    for (const d of allDogs) {
      const r = getRangeByKey(d, metric.key);
      if (!r) continue;
      allValues.push(midValue(r));
    }

    const stats = computeBoxStats(allValues);
    if (!stats) {
      g.append("text")
        .attr("x", plotW / 2)
        .attr("y", plotH / 2)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .style("opacity", 0.6)
        .text("Not enough data");
      return;
    }

    console.groupCollapsed(`[BoxPlot] ${metric.key} (${metric.unit})`);
console.log("n =", allValues.length);
console.log("min/max =", stats.min, stats.max);
console.log("Q1/Median/Q3 =", stats.q1, stats.median, stats.q3);
console.log("IQR =", stats.q3 - stats.q1);
console.log("whiskerLow/high =", stats.whiskerLow, stats.whiskerHigh);
console.log(
  "whiskerLow==Q1 ?",
  Math.abs(stats.whiskerLow - stats.q1) < 1e-9
);
console.log(
  "whiskerHigh==Q3 ?",
  Math.abs(stats.whiskerHigh - stats.q3) < 1e-9
);
console.groupEnd();

    // y scale (cover whiskers, outliers, and selected markers)
    const span = stats.whiskerHigh - stats.whiskerLow;
    const pad = Math.max(
  span * 0.10,
  metric.key === "life" ? 0.5 : metric.key === "weight" ? 1 : 2
);

const markerValues = selectedDogs
  .map((dog) => {
    const r = getRangeByKey(dog, metric.key);
    return r ? midValue(r) : null;
  })
  .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

const yMinRaw = d3.min([stats.min, stats.whiskerLow, ...stats.outliers, ...markerValues]) ?? stats.min;
const yMaxRaw = d3.max([stats.max, stats.whiskerHigh, ...stats.outliers, ...markerValues]) ?? stats.max;

const y = d3
  .scaleLinear()
  .domain([yMinRaw - pad, yMaxRaw + pad])
  .range([plotH, 0])
  .nice();

    // y axis + grid
    g.append("g").call(d3.axisLeft(y).ticks(6));

    g.append("g")
      .attr("class", "grid")
      .call(d3.axisLeft(y).ticks(6).tickSize(-plotW).tickFormat(() => ""))
      .selectAll("line")
      .style("opacity", 0.12);

    g.select(".grid").select(".domain").remove();

    const xCenter = plotW / 2;
    const boxWidth = Math.min(36, plotW * 0.35);

const whiskerStroke = "rgba(94, 94, 94, 0.65)";
const whiskerW = 1.5;


    // lower whisker segment
g.append("line")
  .attr("x1", xCenter)
  .attr("x2", xCenter)
  .attr("y1", y(stats.whiskerLow))
  .attr("y2", y(stats.q1))
  .attr("stroke", whiskerStroke)     
  .attr("stroke-width", whiskerW)
  .attr("stroke-linecap", "round");
// upper whisker segment
g.append("line")
  .attr("x1", xCenter)
  .attr("x2", xCenter)
  .attr("y1", y(stats.q3))
  .attr("y2", y(stats.whiskerHigh))
  .attr("stroke", whiskerStroke)      
  .attr("stroke-width", whiskerW)
  .attr("stroke-linecap", "round");
// caps
const capW = boxWidth * 0.45;
g.append("line")
  .attr("x1", xCenter - capW)
  .attr("x2", xCenter + capW)
  .attr("y1", y(stats.whiskerLow))
  .attr("y2", y(stats.whiskerLow))
  .attr("stroke", whiskerStroke)      // ✅ IMPORTANT
  .attr("stroke-width", whiskerW)
  .attr("stroke-linecap", "round");

g.append("line")
  .attr("x1", xCenter - capW)
  .attr("x2", xCenter + capW)
  .attr("y1", y(stats.whiskerHigh))
  .attr("y2", y(stats.whiskerHigh))
  .attr("stroke", whiskerStroke)      // ✅ IMPORTANT
  .attr("stroke-width", whiskerW)
  .attr("stroke-linecap", "round");

    // box (Q1..Q3)
    g.append("rect")
      .attr("x", xCenter - boxWidth / 2)
      .attr("y", y(stats.q3))
      .attr("width", boxWidth)
      .attr("height", Math.max(1, y(stats.q1) - y(stats.q3)))
      .attr("rx", 6)
      .attr("ry", 6)
      .style("fill", "rgba(0,0,0,0.05)")
      .style("stroke", "rgba(0,0,0,0.35)");

    // median
    g.append("line")
  .attr("x1", xCenter - boxWidth / 2)
  .attr("x2", xCenter + boxWidth / 2)
  .attr("y1", y(stats.median))
  .attr("y2", y(stats.median))
  .attr("stroke", "rgba(97, 97, 97, 0.75)")  // ✅ ADD
  .attr("stroke-width", 3)
  .attr("stroke-linecap", "round");

      // ✅ mean marker (x)
g.append("text")
  .attr("x", xCenter)
  .attr("y", y(stats.mean))
  .attr("text-anchor", "middle")
  .attr("dominant-baseline", "middle")
  .style("font-weight", 700)
  .style("opacity", 0.7)
  .text("×");

    // outliers (optional, subtle)
    g.append("g")
      .selectAll("circle.out")
      .data(stats.outliers.slice(0, 120))
      .enter()
      .append("circle")
      .attr("cx", () => xCenter + (Math.random() - 0.5) * 10)
      .attr("cy", (d) => y(d))
      .attr("r", 2)
      .style("opacity", 0.25);

    // Selected dogs marker lines (mid value)
    const markers = selectedDogs
      .map((dog, i) => {
        const r = getRangeByKey(dog, metric.key);
        if (!r) return null;
        return {
          i,
          name: (dog as any).name ?? `Dog ${i + 1}`,
          v: midValue(r),
          unit: metric.unit,
        };
      })
      .filter(Boolean) as Array<{ i: number; name: string; v: number; unit: string }>;

    const marker = g
      .append("g")
      .selectAll("g.marker")
      .data(markers)
      .enter()
      .append("g")
      .attr("class", "marker")
      .style("cursor", "pointer")
      .on("click", (_, d) => onToggleFocus?.(d.i))
      .on("mousemove", (event, d) => {
        const rect = el.getBoundingClientRect();
        tip
          .style("left", `${event.clientX - rect.left + 10}px`)
          .style("top", `${event.clientY - rect.top + 10}px`)
          .style("opacity", 1)
          .html(
            `<div style="font-weight:600; margin-bottom:2px;">${d.name}</div>
             <div>${metric.label}: ${metric.unit === "kg" ? d.v.toFixed(1) : Math.round(d.v)} ${metric.unit}</div>`
          );
      })
      .on("mouseleave", () => tip.style("opacity", 0));

    // small x-offset so multiple selected dogs don’t perfectly overlap
    const off = d3.range(Math.min(5, markers.length)).map((k) => (k - (markers.length - 1) / 2) * 8);

    marker
      .append("line")
      .attr("x1", (d) => xCenter - boxWidth / 2 - 6 + (off[d.i] ?? 0))
      .attr("x2", (d) => xCenter + boxWidth / 2 + 6 + (off[d.i] ?? 0))
      .attr("y1", (d) => y(d.v))
      .attr("y2", (d) => y(d.v))
      .style("stroke", (d) => colors[d.i] ?? "#f2c200")
      .style("stroke-width", 3)
      .style("stroke-linecap", "round")
      .style("opacity", (d) => lineOpacity(d.i));
  });
}
