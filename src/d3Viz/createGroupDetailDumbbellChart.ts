import * as d3 from "d3";
import { RADAR_COLORS, type AxisItem } from "@/d3Viz/createRadarChart";

export type GroupDetailDumbbellDatum = {
  axisKey: string;
  axisLabel: string;
  groupIndex: number;
  groupName: string;
  minValue: number;
  maxValue: number;
};

export type GroupDetailDumbbellOptions = {
  width: number;
  height: number;
  focusIndex?: number | null;
};

export type GroupDetailDumbbellHandlers = {
  onHover?: (datum: GroupDetailDumbbellDatum, ev: PointerEvent) => void;
  onMove?: (datum: GroupDetailDumbbellDatum, ev: PointerEvent) => void;
  onLeave?: (ev: PointerEvent) => void;
  onClick?: (groupIndex: number, ev: PointerEvent) => void;
};

function colorAt(i: number) {
  return RADAR_COLORS[i % RADAR_COLORS.length] ?? "#f59e0b";
}

export function createGroupDetailDumbbellChart(
  svgEl: SVGSVGElement,
  handlers: GroupDetailDumbbellHandlers = {},
) {
  const svg = d3.select(svgEl);
  const root = svg.append("g").attr("class", "group-detail-dumbbell-root");
  const gx = root.append("g").attr("class", "x-axis");
  const gy = root.append("g").attr("class", "y-axis");
  const stemsLayer = root.append("g").attr("class", "stems-layer");
  const dotsLayer = root.append("g").attr("class", "dots-layer");
  const hitsLayer = root.append("g").attr("class", "hits-layer");

  function update(data: GroupDetailDumbbellDatum[], axes: AxisItem[], opt: GroupDetailDumbbellOptions) {
    svg.attr("viewBox", `0 0 ${opt.width} ${opt.height}`).attr("preserveAspectRatio", "none");

    const margin = { top: 16, right: 14, bottom: 90, left: 54 };
    const innerW = Math.max(10, opt.width - margin.left - margin.right);
    const innerH = Math.max(10, opt.height - margin.top - margin.bottom);
    root.attr("transform", `translate(${margin.left},${margin.top})`);

    const maxY = Math.max(1, d3.max(data, (d) => d.maxValue) ?? 1);
    const y = d3.scaleLinear().domain([0, maxY]).nice().range([innerH, 0]);
    const x = d3
      .scaleBand<string>()
      .domain(axes.map((axis) => axis.key))
      .range([0, innerW])
      .paddingInner(0.24)
      .paddingOuter(0.08);
    const groupCount = Math.max(1, (d3.max(data, (d) => d.groupIndex) ?? -1) + 1);
    const xOffset = d3
      .scalePoint<string>()
      .domain(d3.range(groupCount).map(String))
      .range([Math.max(6, x.bandwidth() * 0.1), Math.max(8, x.bandwidth() * 0.9)]);

    gx.attr("transform", `translate(0,${innerH})`).call(
      d3.axisBottom(x).tickFormat((key) => axes.find((axis) => axis.key === key)?.label ?? String(key)),
    );
    gx.selectAll("path,line").attr("stroke", "#9ca3af");
    gx.selectAll("text").attr("fill", "#374151").style("font-size", "10px");

    gy.call(d3.axisLeft(y).ticks(6).tickSizeOuter(0));
    gy.selectAll("path,line").attr("stroke", "#9ca3af");
    gy.selectAll("text").attr("fill", "#374151").style("font-size", "10px");

    const focused = opt.focusIndex ?? null;
    const keyOf = (d: GroupDetailDumbbellDatum) => `${d.axisKey}__${d.groupIndex}`;

    const stems = stemsLayer
      .selectAll<SVGLineElement, GroupDetailDumbbellDatum>("line.stem")
      .data(data, keyOf);
    stems.exit().remove();
    stems
      .join("line")
      .attr("class", "stem")
      .attr("x1", (d) => (x(d.axisKey) ?? 0) + (xOffset(String(d.groupIndex)) ?? 0))
      .attr("x2", (d) => (x(d.axisKey) ?? 0) + (xOffset(String(d.groupIndex)) ?? 0))
      .attr("y1", (d) => y(d.minValue))
      .attr("y2", (d) => y(d.maxValue))
      .attr("stroke", (d) => colorAt(d.groupIndex))
      .attr("stroke-width", 2.2)
      .attr("stroke-linecap", "round")
      .attr("stroke-opacity", (d) => (focused === null || focused === d.groupIndex ? 0.82 : 0.24));

    const maxDots = dotsLayer
      .selectAll<SVGCircleElement, GroupDetailDumbbellDatum>("circle.max-dot")
      .data(data, keyOf);
    maxDots.exit().remove();
    maxDots
      .join("circle")
      .attr("class", "max-dot")
      .attr("cx", (d) => (x(d.axisKey) ?? 0) + (xOffset(String(d.groupIndex)) ?? 0))
      .attr("cy", (d) => y(d.maxValue))
      .attr("r", 8)
      .attr("fill", (d) => colorAt(d.groupIndex))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1)
      .attr("fill-opacity", (d) => (focused === null || focused === d.groupIndex ? 0.98 : 0.3));

    const minDots = dotsLayer
      .selectAll<SVGCircleElement, GroupDetailDumbbellDatum>("circle.min-dot")
      .data(data, keyOf);
    minDots.exit().remove();
    minDots
      .join("circle")
      .attr("class", "min-dot")
      .attr("cx", (d) => (x(d.axisKey) ?? 0) + (xOffset(String(d.groupIndex)) ?? 0))
      .attr("cy", (d) => y(d.minValue))
      .attr("r", 8)
      .attr("fill", (d) => colorAt(d.groupIndex))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1)
      .attr("fill-opacity", (d) => (focused === null || focused === d.groupIndex ? 0.98 : 0.3));

    const maxLabels = dotsLayer
      .selectAll<SVGTextElement, GroupDetailDumbbellDatum>("text.max-label")
      .data(data, keyOf);
    maxLabels.exit().remove();
    maxLabels
      .join("text")
      .attr("class", "max-label")
      .attr("x", (d) => (x(d.axisKey) ?? 0) + (xOffset(String(d.groupIndex)) ?? 0))
      .attr("y", (d) => y(d.maxValue))
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .attr("font-size", 8)
      .attr("font-weight", 700)
      .attr("fill", "#fff")
      .attr("fill-opacity", (d) => (focused === null || focused === d.groupIndex ? 0.95 : 0.35))
      .text((d) => d.maxValue.toFixed(1).replace(/\.0$/, ""));

    const minLabels = dotsLayer
      .selectAll<SVGTextElement, GroupDetailDumbbellDatum>("text.min-label")
      .data(data, keyOf);
    minLabels.exit().remove();
    minLabels
      .join("text")
      .attr("class", "min-label")
      .attr("x", (d) => (x(d.axisKey) ?? 0) + (xOffset(String(d.groupIndex)) ?? 0))
      .attr("y", (d) => y(d.minValue))
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .attr("font-size", 8)
      .attr("font-weight", 700)
      .attr("fill", "#fff")
      .attr("fill-opacity", (d) => (focused === null || focused === d.groupIndex ? 0.95 : 0.35))
      .text((d) => d.minValue.toFixed(1).replace(/\.0$/, ""));

    function applyHover(activeKey: string | null) {
      stems.attr("stroke-width", (d) => (activeKey !== null && keyOf(d) === activeKey ? 4 : 2.2));
      maxDots.attr("r", (d) => (activeKey !== null && keyOf(d) === activeKey ? 10 : 8));
      minDots.attr("r", (d) => (activeKey !== null && keyOf(d) === activeKey ? 10 : 8));
    }

    const hits = hitsLayer
      .selectAll<SVGLineElement, GroupDetailDumbbellDatum>("line.hit")
      .data(data, keyOf);
    hits.exit().remove();
    hits
      .join("line")
      .attr("class", "hit")
      .attr("x1", (d) => (x(d.axisKey) ?? 0) + (xOffset(String(d.groupIndex)) ?? 0))
      .attr("x2", (d) => (x(d.axisKey) ?? 0) + (xOffset(String(d.groupIndex)) ?? 0))
      .attr("y1", (d) => y(d.minValue) - 10)
      .attr("y2", (d) => y(d.maxValue) + 10)
      .attr("stroke", "transparent")
      .attr("stroke-width", 20)
      .style("cursor", "pointer")
      .on("pointerenter", function (event, d) {
        applyHover(keyOf(d));
        handlers.onHover?.(d, event as PointerEvent);
      })
      .on("pointermove", function (event, d) {
        handlers.onMove?.(d, event as PointerEvent);
      })
      .on("pointerleave", function (event) {
        applyHover(null);
        handlers.onLeave?.(event as PointerEvent);
      })
      .on("click", function (event, d) {
        handlers.onClick?.(d.groupIndex, event as PointerEvent);
      });

    applyHover(null);
  }

  function destroy() {
    svg.selectAll("*").remove();
  }

  return { update, destroy };
}
