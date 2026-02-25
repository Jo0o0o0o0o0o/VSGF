import * as d3 from "d3";
import type { AxisItem, RadarDog, RadarKey } from "@/d3Viz/createRadarChart";

export type GroupDetailsHeatmapOptions = {
  width: number;
  height: number;
  axes: AxisItem[];
  focusIndex?: number | null;
};

export type GroupDetailsHeatCell = {
  rowIndex: number;
  rowLabel: string;
  axisKey: RadarKey;
  axisLabel: string;
  value: number;
  isAverage?: boolean;
};

export type GroupDetailsHeatmapHandlers = {
  onHover?: (cell: GroupDetailsHeatCell, ev: PointerEvent) => void;
  onMove?: (cell: GroupDetailsHeatCell, ev: PointerEvent) => void;
  onLeave?: (ev: PointerEvent) => void;
  onClick?: (rowIndex: number, ev: PointerEvent) => void;
};

export function createGroupDetailsHeatmap(
  svgEl: SVGSVGElement,
  handlers: GroupDetailsHeatmapHandlers = {},
) {
  const svg = d3.select(svgEl);
  const root = svg.append("g").attr("class", "group-heatmap-root");
  const gx = root.append("g").attr("class", "x-axis");
  const gy = root.append("g").attr("class", "y-axis");
  const grid = root.append("g").attr("class", "cells");

  function clampToRating(v: number) {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(10, v));
  }

  function update(dogs: RadarDog[], opt: GroupDetailsHeatmapOptions) {
    svg.attr("viewBox", `0 0 ${opt.width} ${opt.height}`).attr("preserveAspectRatio", "none");

    const rowLabels = [...dogs.map((d) => d.name), "Average"];
    const margin = {
      top: 16,
      right: 18,
      bottom: 96,
      left: Math.max(120, Math.min(230, Math.max(8, ...rowLabels.map((s) => s.length)) * 7 + 22)),
    };
    const innerW = Math.max(10, opt.width - margin.left - margin.right);
    const innerH = Math.max(10, opt.height - margin.top - margin.bottom);

    root.attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleBand<RadarKey>()
      .domain(opt.axes.map((a) => a.key))
      .range([0, innerW])
      .paddingInner(0.08)
      .paddingOuter(0.03);

    const y = d3
      .scaleBand<string>()
      .domain(rowLabels)
      .range([0, innerH])
      .paddingInner(0.08)
      .paddingOuter(0.03);

    const personCells: GroupDetailsHeatCell[] = dogs.flatMap((dog, rowIndex) =>
      opt.axes.map((axis) => ({
        rowIndex,
        rowLabel: dog.name,
        axisKey: axis.key,
        axisLabel: axis.label,
        value: clampToRating(Number(dog[axis.key])),
      })),
    );
    const averageCells: GroupDetailsHeatCell[] = opt.axes.map((axis) => {
      const sum = dogs.reduce((acc, dog) => acc + clampToRating(Number(dog[axis.key])), 0);
      const avg = dogs.length ? sum / dogs.length : 0;
      return {
        rowIndex: -1,
        rowLabel: "Average",
        axisKey: axis.key,
        axisLabel: axis.label,
        value: Number(avg.toFixed(2)),
        isAverage: true,
      };
    });
    const cells: GroupDetailsHeatCell[] = [...personCells, ...averageCells];

    const maxValue = d3.max(cells, (d) => d.value) ?? 0;
    const color = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, Math.max(1, maxValue)]);

    gx.attr("transform", `translate(0,${innerH})`).call(
      d3.axisBottom(x).tickFormat((k) => opt.axes.find((a) => a.key === k)?.label ?? String(k)),
    );
    gx.selectAll("path,line").attr("stroke", "#9ca3af");
    gx.selectAll("text")
      .attr("fill", "#374151")
      .style("font-size", "10px")
      .attr("text-anchor", "end")
      .attr("transform", "rotate(-30)")
      .attr("dx", "-0.45em")
      .attr("dy", "0.2em");

    gy.call(d3.axisLeft(y).tickSize(0));
    gy.select("path").attr("stroke", "#9ca3af");
    gy.selectAll("text").attr("fill", "#374151").style("font-size", "11px");
    gy
      .selectAll<SVGTextElement, string>("text")
      .style("font-weight", (label) => (label === "Average" ? "700" : "400"));

    const focused = opt.focusIndex ?? null;

    const rects = grid
      .selectAll<SVGRectElement, GroupDetailsHeatCell>("rect.cell")
      .data(cells, (d) => `${d.rowLabel}__${d.axisKey}`);

    rects.exit().remove();

    rects
      .join("rect")
      .attr("class", "cell")
      .attr("x", (d) => x(d.axisKey) ?? 0)
      .attr("y", (d) => y(d.rowLabel) ?? 0)
      .attr("width", Math.max(1, x.bandwidth()))
      .attr("height", Math.max(1, y.bandwidth()))
      .attr("rx", 2)
      .attr("fill", (d) => color(d.value))
      .attr("fill-opacity", (d) =>
        d.isAverage ? 1 : focused === null || focused === d.rowIndex ? 0.95 : 0.45,
      )
      .attr("stroke", (d) =>
        focused !== null && focused === d.rowIndex && !d.isAverage
          ? "#111827"
          : "rgba(255,255,255,0.7)",
      )
      .attr("stroke-width", (d) =>
        focused !== null && focused === d.rowIndex && !d.isAverage ? 1.2 : 1,
      )
      .style("cursor", "pointer")
      .on("pointerenter", function (event, d) {
        d3.select(this).attr("stroke", "#111827").attr("stroke-width", 1.2);
        handlers.onHover?.(d, event as PointerEvent);
      })
      .on("pointermove", function (event, d) {
        handlers.onMove?.(d, event as PointerEvent);
      })
      .on("pointerleave", function (event, d) {
        const isFocused = focused !== null && focused === d.rowIndex && !d.isAverage;
        d3.select(this)
          .attr("stroke", isFocused ? "#111827" : "rgba(255,255,255,0.7)")
          .attr("stroke-width", isFocused ? 1.2 : 1);
        handlers.onLeave?.(event as PointerEvent);
      })
      .on("click", function (event, d) {
        if (d.isAverage) return;
        handlers.onClick?.(d.rowIndex, event as PointerEvent);
      });
  }

  function destroy() {
    svg.selectAll("*").remove();
  }

  return { update, destroy };
}
