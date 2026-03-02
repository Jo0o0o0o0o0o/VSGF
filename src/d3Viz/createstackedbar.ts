import * as d3 from "d3";
import { RADAR_COLORS, type AxisItem, type RadarDog, type RadarKey } from "@/d3Viz/createRadarChart";

export type StackedBarOptions = {
  width: number;
  height: number;
  axes: AxisItem[];
  focusIndex?: number | null;
  axisAverages?: Partial<Record<RadarKey, number>>;
};

export type StackedBarSegment = {
  axisKey: RadarKey;
  axisLabel: string;
  dogIndex: number;
  dogName: string;
  value: number;
  y0: number;
  y1: number;
  total: number;
};

export type StackedBarHandlers = {
  onHover?: (segment: StackedBarSegment, ev: PointerEvent) => void;
  onMove?: (segment: StackedBarSegment, ev: PointerEvent) => void;
  onLeave?: (ev: PointerEvent) => void;
  onClick?: (dogIndex: number, ev: PointerEvent) => void;
};

function clampToRating(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(10, v));
}

function colorAt(i: number) {
  return RADAR_COLORS[i % RADAR_COLORS.length] ?? "#f59e0b";
}

export function createStackedBar(svgEl: SVGSVGElement, handlers: StackedBarHandlers = {}) {
  const svg = d3.select(svgEl);
  const root = svg.append("g").attr("class", "stacked-bar-root");
  const gx = root.append("g").attr("class", "x-axis");
  const gy = root.append("g").attr("class", "y-axis");
  const avgLayer = root.append("g").attr("class", "avg-bars");
  const bars = root.append("g").attr("class", "bars");
  const totals = root.append("g").attr("class", "totals");

  function update(dogs: RadarDog[], opt: StackedBarOptions) {
    svg.attr("viewBox", `0 0 ${opt.width} ${opt.height}`).attr("preserveAspectRatio", "none");

    // Reserve space for the top-right legend so bars are never covered by it.
    const margin = { top: 14, right: 170, bottom: 94, left: 52 };
    const innerW = Math.max(10, opt.width - margin.left - margin.right);
    const innerH = Math.max(10, opt.height - margin.top - margin.bottom);
    root.attr("transform", `translate(${margin.left},${margin.top})`);

    const axisDomain = opt.axes.map((axis) => axis.key);
    const axisByKey = new Map(opt.axes.map((axis) => [axis.key, axis] as const));

    const x = d3
      .scaleBand<RadarKey>()
      .domain(axisDomain)
      .range([0, innerW])
      .paddingInner(0.18)
      .paddingOuter(0.08);

    const totalsByAxis = opt.axes.map((axis) =>
      dogs.reduce((sum, dog) => sum + clampToRating(Number(dog[axis.key])), 0),
    );
    const averageTargets = opt.axes.map((axis) => {
      const raw = Number(opt.axisAverages?.[axis.key]);
      return Number.isFinite(raw) ? Math.max(0, raw) : 0;
    });
    const yMax = Math.max(1, d3.max([...totalsByAxis, ...averageTargets]) ?? 1);
    const y = d3.scaleLinear().domain([0, yMax]).nice().range([innerH, 0]);

    gx.attr("transform", `translate(0,${innerH})`).call(
      d3.axisBottom(x).tickFormat((key) => axisByKey.get(key)?.label ?? String(key)),
    );
    gx.selectAll("path,line").attr("stroke", "#9ca3af");
    const xTickText = gx
      .selectAll<SVGTextElement, RadarKey>("text")
      .attr("fill", "#374151")
      .style("font-size", "10px")
      .attr("text-anchor", "end")
      .attr("transform", "rotate(-30)")
      .attr("dx", "-0.45em")
      .attr("dy", "0.2em");
    xTickText.selectAll("title").remove();
    xTickText
      .filter((key) => Boolean(axisByKey.get(key)?.hint))
      .append("title")
      .text((key) => axisByKey.get(key)?.hint ?? "");

    gy.call(d3.axisLeft(y).ticks(5).tickSizeOuter(0));
    gy.selectAll("path,line").attr("stroke", "#9ca3af");
    gy.selectAll("text").attr("fill", "#374151").style("font-size", "10px");

    const segments: StackedBarSegment[] = [];
    opt.axes.forEach((axis) => {
      let curr = 0;
      dogs.forEach((dog, dogIndex) => {
        const value = clampToRating(Number(dog[axis.key]));
        const y0 = curr;
        const y1 = curr + value;
        curr = y1;
        segments.push({
          axisKey: axis.key,
          axisLabel: axis.label,
          dogIndex,
          dogName: dog.name,
          value,
          y0,
          y1,
          total: 0,
        });
      });
      const total = curr;
      for (let i = segments.length - dogs.length; i < segments.length; i += 1) {
        const segment = segments[i];
        if (segment) segment.total = total;
      }
    });

    const focused = opt.focusIndex ?? null;

    const averageBars = opt.axes.map((axis) => {
      const fallbackTotal = dogs.reduce((sum, dog) => sum + clampToRating(Number(dog[axis.key])), 0);
      const fallbackAvg = dogs.length > 0 ? fallbackTotal / dogs.length : 0;
      const avg = Math.max(0, Number(opt.axisAverages?.[axis.key] ?? fallbackAvg));
      return { axisKey: axis.key, avg };
    });

    avgLayer
      .selectAll<SVGRectElement, { axisKey: RadarKey; avg: number }>("rect.avg-bar")
      .data(averageBars, (d) => d.axisKey)
      .join("rect")
      .attr("class", "avg-bar")
      .attr("x", (d) => x(d.axisKey) ?? 0)
      .attr("y", (d) => y(d.avg))
      .attr("width", Math.max(2, x.bandwidth()))
      .attr("height", (d) => Math.max(0.5, innerH - y(d.avg)))
      .attr("fill", "none")
      .attr("stroke", "#6b7280")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,3")
      .attr("pointer-events", "none");

    const rects = bars
      .selectAll<SVGRectElement, StackedBarSegment>("rect.segment")
      .data(segments, (d) => `${d.axisKey}__${d.dogIndex}`);

    rects.exit().remove();

    rects
      .join("rect")
      .attr("class", "segment")
      .attr("x", (d) => x(d.axisKey) ?? 0)
      .attr("y", (d) => y(d.y1))
      .attr("width", Math.max(1, x.bandwidth()))
      .attr("height", (d) => Math.max(0.5, y(d.y0) - y(d.y1)))
      .attr("fill", (d) => colorAt(d.dogIndex))
      .attr("fill-opacity", (d) =>
        focused === null || focused === d.dogIndex ? 0.92 : 0.38,
      )
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1)
      .style("cursor", "pointer")
      .on("pointerenter", function (event, d) {
        d3.select(this).attr("stroke", "#111827").attr("stroke-width", 1.1);
        handlers.onHover?.(d, event as PointerEvent);
      })
      .on("pointermove", function (event, d) {
        handlers.onMove?.(d, event as PointerEvent);
      })
      .on("pointerleave", function (event) {
        d3.select(this).attr("stroke", "#ffffff").attr("stroke-width", 1);
        handlers.onLeave?.(event as PointerEvent);
      })
      .on("click", function (event, d) {
        handlers.onClick?.(d.dogIndex, event as PointerEvent);
      });

    const totalLabels = opt.axes.map((axis) => ({
      axisKey: axis.key,
      total: dogs.reduce((sum, dog) => sum + clampToRating(Number(dog[axis.key])), 0),
    }));

    totals
      .selectAll<SVGTextElement, { axisKey: RadarKey; total: number }>("text.total")
      .data(totalLabels, (d) => d.axisKey)
      .join("text")
      .attr("class", "total")
      .attr("x", (d) => (x(d.axisKey) ?? 0) + x.bandwidth() / 2)
      .attr("y", (d) => y(d.total) - 4)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("font-weight", 700)
      .attr("fill", "#374151")
      .text((d) => d.total.toFixed(1).replace(/\.0$/, ""));
  }

  function destroy() {
    svg.selectAll("*").remove();
  }

  return { update, destroy };
}
