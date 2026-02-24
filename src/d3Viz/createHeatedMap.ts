import * as d3 from "d3";
import type { IvisRatingKey, IvisRecord } from "@/types/ivis23";

export type HeatedMapOptions = {
  width: number;
  height: number;
  ratingKeys: readonly IvisRatingKey[];
};

export type HeatedCell = {
  rowLabel: string;
  ratingKey: IvisRatingKey;
  value: number;
};

export type HeatedMapHandlers = {
  onHover?: (cell: HeatedCell, ev: PointerEvent) => void;
  onMove?: (cell: HeatedCell, ev: PointerEvent) => void;
  onLeave?: (cell: HeatedCell, ev: PointerEvent) => void;
};

export function createHeatedMap(svgEl: SVGSVGElement, handlers: HeatedMapHandlers = {}) {
  const svg = d3.select(svgEl);
  const root = svg.append("g").attr("class", "heated-root");
  const gx = root.append("g").attr("class", "x-axis");
  const gy = root.append("g").attr("class", "y-axis");
  const grid = root.append("g").attr("class", "cells");

  function update(records: IvisRecord[], opt: HeatedMapOptions) {
    svg.attr("viewBox", `0 0 ${opt.width} ${opt.height}`).attr("preserveAspectRatio", "none");

    const rowLabels = records.map((r) => `${r.id}. ${r.alias}`);
    const margin = {
      top: 18,
      right: 18,
      bottom: 106,
      left: Math.max(130, Math.min(240, Math.max(...rowLabels.map((s) => s.length)) * 7 + 24)),
    };
    const innerW = Math.max(10, opt.width - margin.left - margin.right);
    const innerH = Math.max(10, opt.height - margin.top - margin.bottom);

    root.attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleBand<IvisRatingKey>()
      .domain([...opt.ratingKeys])
      .range([0, innerW])
      .paddingInner(0.06)
      .paddingOuter(0.03);

    const y = d3
      .scaleBand<string>()
      .domain(rowLabels)
      .range([0, innerH])
      .paddingInner(0.06)
      .paddingOuter(0.03);

    const color = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, 10]);

    const cells: HeatedCell[] = records.flatMap((r) =>
      opt.ratingKeys.map((key) => ({
        rowLabel: `${r.id}. ${r.alias}`,
        ratingKey: key,
        value: Number(r.ratings[key]),
      })),
    );

    gx.attr("transform", `translate(0,${innerH})`).call(d3.axisBottom(x));
    gx.selectAll("path,line").attr("stroke", "#94a3b8");
    gx.selectAll("text")
      .text((d) => String(d).replace(/_/g, " "))
      .attr("fill", "#334155")
      .style("font-size", "10px")
      .attr("text-anchor", "end")
      .attr("transform", "rotate(-35)")
      .attr("dx", "-0.6em")
      .attr("dy", "0.25em");

    gy.call(d3.axisLeft(y).tickSize(0));
    gy.select("path").attr("stroke", "#94a3b8");
    gy.selectAll("text").attr("fill", "#334155").style("font-size", "10px");

    const rects = grid
      .selectAll<SVGRectElement, HeatedCell>("rect.cell")
      .data(cells, (d) => `${d.rowLabel}__${d.ratingKey}`);

    rects.exit().remove();

    rects
      .join("rect")
      .attr("class", "cell")
      .attr("x", (d) => x(d.ratingKey) ?? 0)
      .attr("y", (d) => y(d.rowLabel) ?? 0)
      .attr("width", Math.max(1, x.bandwidth()))
      .attr("height", Math.max(1, y.bandwidth()))
      .attr("rx", 2)
      .attr("fill", (d) => (Number.isFinite(d.value) ? color(d.value) : "#e2e8f0"))
      .attr("stroke", "rgba(255,255,255,0.7)")
      .on("pointerenter", function (event, d) {
        d3.select(this).attr("stroke", "#0f172a").attr("stroke-width", 1.2);
        handlers.onHover?.(d, event as PointerEvent);
      })
      .on("pointermove", function (event, d) {
        handlers.onMove?.(d, event as PointerEvent);
      })
      .on("pointerleave", function (event, d) {
        d3.select(this).attr("stroke", "rgba(255,255,255,0.7)").attr("stroke-width", null);
        handlers.onLeave?.(d, event as PointerEvent);
      });
  }

  function destroy() {
    svg.selectAll("*").remove();
  }

  return { update, destroy };
}
