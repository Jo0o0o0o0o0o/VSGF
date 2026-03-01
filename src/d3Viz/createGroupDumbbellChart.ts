import * as d3 from "d3";
import { RADAR_COLORS } from "@/d3Viz/createRadarChart";
import { SKILL_CATEGORIES, type SkillCategoryKey } from "@/types/skillCategory";

export type GroupDumbbellDatum = {
  categoryKey: SkillCategoryKey;
  categoryLabel: string;
  groupIndex: number;
  groupName: string;
  minValue: number;
  maxValue: number;
};

export type GroupDumbbellOptions = {
  width: number;
  height: number;
  focusIndex?: number | null;
};

export type GroupDumbbellHandlers = {
  onHover?: (datum: GroupDumbbellDatum, ev: PointerEvent) => void;
  onMove?: (datum: GroupDumbbellDatum, ev: PointerEvent) => void;
  onLeave?: (ev: PointerEvent) => void;
  onClick?: (groupIndex: number, ev: PointerEvent) => void;
  onCategoryClick?: (categoryKey: SkillCategoryKey, ev: PointerEvent) => void;
};

function colorAt(i: number) {
  return RADAR_COLORS[i % RADAR_COLORS.length] ?? "#f59e0b";
}

export function createGroupDumbbellChart(
  svgEl: SVGSVGElement,
  handlers: GroupDumbbellHandlers = {},
) {
  const svg = d3.select(svgEl);
  const root = svg.append("g").attr("class", "group-dumbbell-root");
  const gx = root.append("g").attr("class", "x-axis");
  const gy = root.append("g").attr("class", "y-axis");
  const stemsLayer = root.append("g").attr("class", "stems-layer");
  const dotsLayer = root.append("g").attr("class", "dots-layer");
  const hitsLayer = root.append("g").attr("class", "hits-layer");

  function update(data: GroupDumbbellDatum[], opt: GroupDumbbellOptions) {
    svg.attr("viewBox", `0 0 ${opt.width} ${opt.height}`).attr("preserveAspectRatio", "none");

    // Reserve right-side space for the legend/top tip card so marks are not covered.
    const reservedRight = Math.max(120, Math.min(200, opt.width * 0.26));
    const margin = { top: 16, right: reservedRight, bottom: 90, left: 54 };
    const innerW = Math.max(10, opt.width - margin.left - margin.right);
    const innerH = Math.max(10, opt.height - margin.top - margin.bottom);
    root.attr("transform", `translate(${margin.left},${margin.top})`);

    const categories = SKILL_CATEGORIES;

    const minY = Math.min(0, d3.min(data, (d) => d.minValue) ?? 0);
    const maxY = Math.max(1, d3.max(data, (d) => d.maxValue) ?? 1);
    const y = d3.scaleLinear().domain([minY, maxY]).nice().range([innerH, 0]);
    const x = d3
      .scaleBand<SkillCategoryKey>()
      .domain(categories.map((category) => category.key))
      .range([0, innerW])
      .paddingInner(0.28)
      .paddingOuter(0.08);
    const groupCount = Math.max(1, (d3.max(data, (d) => d.groupIndex) ?? -1) + 1);
    const xOffset = d3
      .scalePoint<string>()
      .domain(d3.range(groupCount).map(String))
      .range([Math.max(6, x.bandwidth() * 0.1), Math.max(8, x.bandwidth() * 0.9)]);

    gx.attr("transform", `translate(0,${innerH})`).call(
      d3.axisBottom(x).tickFormat((key) => categories.find((item) => item.key === key)?.label ?? String(key)),
    );
    gx.selectAll("path,line").attr("stroke", "#9ca3af");
    gx
      .selectAll<SVGTextElement, SkillCategoryKey>("text")
      .attr("fill", "#374151")
      .style("font-size", "11px")
      .style("cursor", "pointer")
      .on("click", function (event, key) {
        handlers.onCategoryClick?.(key, event as PointerEvent);
      });

    gy.call(d3.axisLeft(y).ticks(6).tickSizeOuter(0));
    gy.selectAll("path,line").attr("stroke", "#9ca3af");
    gy.selectAll("text").attr("fill", "#374151").style("font-size", "10px");

    const focused = opt.focusIndex ?? null;
    const keyOf = (d: GroupDumbbellDatum) => `${d.categoryKey}__${d.groupIndex}`;

    const stems = stemsLayer
      .selectAll<SVGLineElement, GroupDumbbellDatum>("line.stem")
      .data(data, keyOf);

    stems.exit().remove();

    stems
      .join("line")
      .attr("class", "stem")
      .attr("x1", (d) => (x(d.categoryKey) ?? 0) + (xOffset(String(d.groupIndex)) ?? 0))
      .attr("x2", (d) => (x(d.categoryKey) ?? 0) + (xOffset(String(d.groupIndex)) ?? 0))
      .attr("y1", (d) => y(d.minValue))
      .attr("y2", (d) => y(d.maxValue))
      .attr("stroke", (d) => colorAt(d.groupIndex))
      .attr("stroke-width", 2.5)
      .attr("stroke-linecap", "round")
      .attr("stroke-opacity", (d) => (focused === null || focused === d.groupIndex ? 0.82 : 0.25))
      .style("cursor", "default");

    const topDots = dotsLayer
      .selectAll<SVGCircleElement, GroupDumbbellDatum>("circle.top-dot")
      .data(data, keyOf);

    topDots.exit().remove();

    topDots
      .join("circle")
      .attr("class", "top-dot")
      .attr("cx", (d) => (x(d.categoryKey) ?? 0) + (xOffset(String(d.groupIndex)) ?? 0))
      .attr("cy", (d) => y(d.maxValue))
      .attr("r", 8)
      .attr("fill", (d) => colorAt(d.groupIndex))
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1)
      .attr("fill-opacity", (d) => (focused === null || focused === d.groupIndex ? 0.98 : 0.32))
      .style("cursor", "default");

    const bottomDots = dotsLayer
      .selectAll<SVGCircleElement, GroupDumbbellDatum>("circle.bottom-dot")
      .data(data, keyOf);

    bottomDots.exit().remove();

    bottomDots
      .join("circle")
      .attr("class", "bottom-dot")
      .attr("cx", (d) => (x(d.categoryKey) ?? 0) + (xOffset(String(d.groupIndex)) ?? 0))
      .attr("cy", (d) => y(d.minValue))
      .attr("r", 8)
      .attr("fill", (d) => colorAt(d.groupIndex))
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1)
      .attr("fill-opacity", (d) => (focused === null || focused === d.groupIndex ? 0.98 : 0.32));

    const minLabels = dotsLayer
      .selectAll<SVGTextElement, GroupDumbbellDatum>("text.min-label")
      .data(data, keyOf);

    minLabels.exit().remove();

    minLabels
      .join("text")
      .attr("class", "min-label")
      .attr("x", (d) => (x(d.categoryKey) ?? 0) + (xOffset(String(d.groupIndex)) ?? 0))
      .attr("y", (d) => y(d.minValue))
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .attr("font-size", 8)
      .attr("font-weight", 700)
      .attr("fill", "#ffffff")
      .attr("fill-opacity", (d) => (focused === null || focused === d.groupIndex ? 0.95 : 0.35))
      .text((d) => d.minValue.toFixed(1).replace(/\.0$/, ""));

    const maxLabels = dotsLayer
      .selectAll<SVGTextElement, GroupDumbbellDatum>("text.max-label")
      .data(data, keyOf);

    maxLabels.exit().remove();

    maxLabels
      .join("text")
      .attr("class", "max-label")
      .attr("x", (d) => (x(d.categoryKey) ?? 0) + (xOffset(String(d.groupIndex)) ?? 0))
      .attr("y", (d) => y(d.maxValue))
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .attr("font-size", 8)
      .attr("font-weight", 700)
      .attr("fill", "#ffffff")
      .attr("fill-opacity", (d) => (focused === null || focused === d.groupIndex ? 0.95 : 0.35))
      .text((d) => d.maxValue.toFixed(1).replace(/\.0$/, ""));

    function applyHover(activeKey: string | null) {
      stems.attr("stroke-width", (d) => (activeKey !== null && keyOf(d) === activeKey ? 4 : 2.5));
      topDots.attr("r", (d) => (activeKey !== null && keyOf(d) === activeKey ? 10 : 8));
      bottomDots.attr("r", (d) => (activeKey !== null && keyOf(d) === activeKey ? 10 : 8));
    }

    const hits = hitsLayer
      .selectAll<SVGLineElement, GroupDumbbellDatum>("line.hit")
      .data(data, keyOf);

    hits.exit().remove();

    hits
      .join("line")
      .attr("class", "hit")
      .attr("x1", (d) => (x(d.categoryKey) ?? 0) + (xOffset(String(d.groupIndex)) ?? 0))
      .attr("x2", (d) => (x(d.categoryKey) ?? 0) + (xOffset(String(d.groupIndex)) ?? 0))
      .attr("y1", (d) => y(d.minValue) - 10)
      .attr("y2", (d) => y(d.maxValue) + 10)
      .attr("stroke", "transparent")
      .attr("stroke-width", 22)
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
