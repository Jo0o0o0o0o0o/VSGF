// src/d3Viz/createDumbbellChart.ts
import * as d3 from "d3";
import type { DogBreed } from "@/types/dogBreed";

export type DumbbellMetricKey = "height" | "weight" | "life";

export type DumbbellMetric = {
  key: DumbbellMetricKey;
  label: string;
  unit: string;
};

export const DUMBBELL_METRICS: DumbbellMetric[] = [
  { key: "height", label: "Height", unit: "cm" },
  { key: "weight", label: "Weight", unit: "kg" },
  { key: "life", label: "Life span", unit: "yr" },
];

// ---- parsing helpers ----
function parseRangeNums(s?: string): [number, number] | null {
  if (!s) return null;

  const nums = (s.match(/(\d+(\.\d+)?)/g) || []).map((x) => Number(x));

  if (nums.length === 0) return null;

  if (nums.length === 1) {
    const v = nums[0]!; // ✅ FIX: TS 确认非 undefined
    return [v, v];
  }

  const a = nums[0]!; // ✅ FIX
  const b = nums[1]!; // ✅ FIX
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


  const hm = typeof obj.min_height_male === "number" ? obj.min_height_male : null;
  const hM = typeof obj.max_height_male === "number" ? obj.max_height_male : null;
  const hf = typeof obj.min_height_female === "number" ? obj.min_height_female : null;
  const hF = typeof obj.max_height_female === "number" ? obj.max_height_female : null;

  const mins = [hm, hf].filter((v) => typeof v === "number") as number[];
  const maxs = [hM, hF].filter((v) => typeof v === "number") as number[];

  if (mins.length && maxs.length) {
    const minIn = Math.min(...mins);
    const maxIn = Math.max(...maxs);
    return [inchesToCm(minIn), inchesToCm(maxIn)];
  }

  // --- fallback: TheDogAPI style strings ---
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

  // ✅ API Ninjas (pounds)
  const wm = typeof obj.min_weight_male === "number" ? obj.min_weight_male : null;
  const wM = typeof obj.max_weight_male === "number" ? obj.max_weight_male : null;
  const wf = typeof obj.min_weight_female === "number" ? obj.min_weight_female : null;
  const wF = typeof obj.max_weight_female === "number" ? obj.max_weight_female : null;

  const mins = [wm, wf].filter((v) => typeof v === "number") as number[];
  const maxs = [wM, wF].filter((v) => typeof v === "number") as number[];

  if (mins.length && maxs.length) {
    const minLb = Math.min(...mins);
    const maxLb = Math.max(...maxs);
    return [lbToKg(minLb), lbToKg(maxLb)];
  }

  // --- fallback: TheDogAPI style strings ---
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

  // --- fallback: TheDogAPI style string ---
  const s = obj?.life_span as string | undefined;
  return parseRangeNums(s);
}




function getRangeByKey(d: DogBreed, key: DumbbellMetricKey): [number, number] | null {
  if (key === "height") return getHeightRangeCm(d);
  if (key === "weight") return getWeightRangeKg(d);
  return getLifeRangeYr(d);
}

export type DumbbellDatum = {
  dogIndex: number;      // 0..4 (slot index)
  dogName: string;
  metric: DumbbellMetric;
  min: number;
  max: number;
};

export type DrawDumbbellOptions = {
  width: number;
  height: number;
  colors: string[];      // aligned with dogIndex
  focusIndex: number | null;
  onToggleFocus?: (dogIndex: number) => void;
};

export function buildDumbbellData(
  dogs: DogBreed[],
  metrics: DumbbellMetric[] = DUMBBELL_METRICS
): DumbbellDatum[] {
  const out: DumbbellDatum[] = [];
  dogs.forEach((dog, i) => {
    metrics.forEach((m) => {
      const r = getRangeByKey(dog, m.key);
      if (!r) return;
      out.push({
        dogIndex: i,
        dogName: (dog as any).name ?? `Dog ${i + 1}`,
        metric: m,
        min: r[0],
        max: r[1],
      });
    });
  });
  return out;
}

export function drawDumbbellChart(
  el: HTMLElement,
  dogs: DogBreed[],
  opts: DrawDumbbellOptions
) {
  const { width, height, colors, focusIndex, onToggleFocus } = opts;

  const outerMargin = { top: 18, right: 18, bottom: 28, left: 18 };
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

  const metrics = DUMBBELL_METRICS;
  const data = buildDumbbellData(dogs, metrics);

  if (dogs.length === 0 || data.length === 0) {
    root
      .append("text")
      .attr("x", innerW / 2)
      .attr("y", innerH / 2)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("opacity", 0.7)
      .text("Select dogs to compare");
    return;
  }

  // --- layout: 3 facets ---
  const facetGap = 26;
  const facetW = (innerW - facetGap * (metrics.length - 1)) / metrics.length;

  // per-facet margins (y axis on left of each facet)
  const m = { top: 22, right: 10, bottom: 18, left: 44 };
  const plotW = Math.max(10, facetW - m.left - m.right);
  const plotH = Math.max(10, innerH - m.top - m.bottom);

  // within each facet: x positions (just offsets around center)
  const maxDogs = Math.min(5, dogs.length);
  const offsets = d3.range(maxDogs).map((i) => (i - (maxDogs - 1) / 2) * 10);

  const isFocused = (i: number) => focusIndex == null || focusIndex === i;
  const lineOpacity = (i: number) => (isFocused(i) ? 0.85 : 0.18);
  const dotOpacity = (i: number) => (isFocused(i) ? 0.95 : 0.22);

  // tooltip (one for whole chart)
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

  const fmt = (v: number, unit: string) => {
    if (unit === "cm") return `${Math.round(v)} cm`;
    if (unit === "kg") return `${v.toFixed(1)} kg`;
    if (unit === "yr") return `${Math.round(v)} yr`;
    return String(v);
  };

  metrics.forEach((metric, facetIndex) => {
    const facetX = facetIndex * (facetW + facetGap);

    const facet = root
      .append("g")
      .attr("transform", `translate(${facetX},0)`);

    // title
    facet
      .append("text")
      .attr("x", 0)
      .attr("y", 14)
      .style("font-weight", 600)
      .text(`${metric.label} (${metric.unit})`);

    const g = facet
      .append("g")
      .attr("transform", `translate(${m.left},${m.top})`);

    const facetData = data.filter((d) => d.metric.key === metric.key);

    // y scale per facet
    const yMin = d3.min(facetData, (d) => d.min) ?? 0;
    const yMax = d3.max(facetData, (d) => d.max) ?? 1;
    const pad = (yMax - yMin) * 0.08 || 1;

    const y = d3
      .scaleLinear()
      .domain([Math.max(0, yMin - pad), yMax + pad])
      .range([plotH, 0])
      .nice();

    // x center for dumbbells
    const xCenter = plotW / 2;

    // y axis + subtle grid
    g.append("g").call(d3.axisLeft(y).ticks(6));

    g.append("g")
      .attr("class", "grid")
      .call(
        d3
          .axisLeft(y)
          .ticks(6)
          .tickSize(-plotW)
          .tickFormat(() => "")
      )
      .selectAll("line")
      .style("opacity", 0.12);

    g.select(".grid").select(".domain").remove();

    // clickable items
    const item = g
      .append("g")
      .selectAll("g.item")
      .data(facetData)
      .enter()
      .append("g")
      .attr("class", "item")
      .style("cursor", "pointer")
      .on("click", (_, d) => onToggleFocus?.(d.dogIndex))
      .on("mousemove", (event, d) => {
        const rect = el.getBoundingClientRect();
        tip
          .style("left", `${event.clientX - rect.left + 10}px`)
          .style("top", `${event.clientY - rect.top + 10}px`)
          .style("opacity", 1)
          .html(
            `<div style="font-weight:600; margin-bottom:2px;">${d.dogName}</div>
             <div>${d.metric.label}: ${fmt(d.min, d.metric.unit)} – ${fmt(d.max, d.metric.unit)}</div>`
          );
      })
      .on("mouseleave", () => tip.style("opacity", 0));

    const cx = (d: any) => xCenter + (offsets[d.dogIndex] ?? 0);

    // line
    item
      .append("line")
      .attr("x1", (d) => cx(d))
      .attr("x2", (d) => cx(d))
      .attr("y1", (d) => y(d.min))
      .attr("y2", (d) => y(d.max))
      .attr("stroke", (d) => colors[d.dogIndex] ?? "#999")
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round")
      .style("opacity", (d) => lineOpacity(d.dogIndex));

    // min dot
    item
      .append("circle")
      .attr("cx", (d) => cx(d))
      .attr("cy", (d) => y(d.min))
      .attr("r", 6)
      .attr("fill", (d) => colors[d.dogIndex] ?? "#999")
      .style("opacity", (d) => dotOpacity(d.dogIndex));

    // max dot
    item
      .append("circle")
      .attr("cx", (d) => cx(d))
      .attr("cy", (d) => y(d.max))
      .attr("r", 6)
      .attr("fill", (d) => colors[d.dogIndex] ?? "#999")
      .style("opacity", (d) => dotOpacity(d.dogIndex));

    // baseline marker (optional): center line to anchor eye
    g.append("line")
      .attr("x1", xCenter)
      .attr("x2", xCenter)
      .attr("y1", 0)
      .attr("y2", plotH)
      .style("opacity", 0.08);
  });
}

