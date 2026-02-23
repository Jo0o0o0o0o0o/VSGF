import * as d3 from "d3";
import type { ScatterDatum } from "@/types/viz";

export type ScatterOptions = {
  width: number;
  height: number;
  xLabel?: string;
  yLabel?: string;
  highlightId?: string | null;
};

export type ScatterHandlers = {
  onHover?: (d: ScatterDatum, ev: PointerEvent) => void;
  onMove?: (d: ScatterDatum, ev: PointerEvent) => void;
  onLeave?: (d: ScatterDatum, ev: PointerEvent) => void;
  onClick?: (d: ScatterDatum, ev: PointerEvent) => void;
};

export function createScatterPlot(svgEl: SVGSVGElement, handlers: ScatterHandlers = {}) {
  const svg = d3.select(svgEl);

  const margin = { top: 30, right: 30, bottom: 50, left: 60 };

  const root = svg.append("g");
  const gx = root.append("g");
  const gy = root.append("g");
  const pointsLayer = root.append("g");

  let lastOpt: ScatterOptions | null = null;

  function applyBaseStyle(
    sel: d3.Selection<SVGCircleElement, ScatterDatum, any, any>,
    d: ScatterDatum,
  ) {
    const isHL = !!(lastOpt?.highlightId && d.id === lastOpt.highlightId);
    sel.attr("fill", isHL ? "#f97316" : "#eab308").attr("opacity", isHL ? 1 : 0.42);
  }

  function update(data: ScatterDatum[], opt: ScatterOptions) {
    lastOpt = opt;

    // 空数据也要保持尺寸（否则容器会抖）
    svg.attr("width", opt.width).attr("height", opt.height);

    if (!data.length) return;
    const width = opt.width - margin.left - margin.right;
    const height = opt.height - margin.top - margin.bottom;

    svg.attr("width", opt.width).attr("height", opt.height);

    root.attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.x)!])
      .range([0, width]);

    const yScale = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.y)!])
      .range([height, 0]);

    const [xMin, xMax] = xScale.domain() as [number, number];
    const yMax = yScale.domain()[1] as number;

    const sizeVals = data
      .map((d) => d.size)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);

    const [sizeMin, sizeMax] = d3.extent(sizeVals) as [number, number];

    const rScale = d3.scaleSqrt().domain([sizeMin, sizeMax]).range([4, 15]).clamp(true);

    const xTickStart = Math.floor(xMin / 10) * 10;
    const xTickEnd = Math.ceil(xMax / 10) * 10;
    const yTickEnd = Math.ceil(yMax / 10) * 10;

    const xTicks = d3.range(xTickStart, xTickEnd + 10, 10);
    const yTicks = d3.range(0, yTickEnd + 10, 10);

    gx.attr("transform", `translate(0,${height})`).call(
      d3.axisBottom(xScale).tickValues(xTicks).tickFormat(d3.format(".0f")),
    );

    gy.call(d3.axisLeft(yScale).tickValues(yTicks).tickFormat(d3.format(".0f")));

    // X label
    gx.selectAll(".x-label")
      .data([0])
      .join("text")
      .attr("class", "x-label")
      .attr("x", width)
      .attr("y", 40)
      .attr("text-anchor", "end")
      .attr("fill", "#111827")
      .text(opt.xLabel ?? "Height (cm)");

    // Y label
    gy.selectAll(".y-label")
      .data([0])
      .join("text")
      .attr("class", "y-label")
      .attr("x", -10)
      .attr("y", -10)
      .attr("text-anchor", "start")
      .attr("fill", "#111827")
      .text(opt.yLabel ?? "Weight (kg)");

    const circles = pointsLayer
      .selectAll<SVGCircleElement, ScatterDatum>("circle")
      .data(data, (d) => d.id);

    circles.exit().remove();

    const merged = circles
      .join("circle")
      .attr("cx", (d) => xScale(d.x))
      .attr("cy", (d) => yScale(d.y))
      .attr("r", (d) => rScale(d.size ?? 0))
      /* 原本你可能直接 attr 方式，这里改成统一用 applyBaseStyle */
      .each(function (d) {
        applyBaseStyle(d3.select(this), d);
      });

    const raiseHighlighted = () => {
      if (!opt.highlightId) return;
      merged.filter((d) => d.id === opt.highlightId).raise();
    };

    raiseHighlighted();

    merged
      .on("pointerenter", function (event, d) {
        const sel = d3.select(this);
        sel.attr("fill", "#ff6f00").attr("opacity", 1).raise();
        handlers.onHover?.(d, event as PointerEvent);
      })
      .on("pointermove", function (event, d) {
        handlers.onMove?.(d, event as PointerEvent);
      })
      .on("pointerleave", function (event, d) {
        applyBaseStyle(d3.select(this), d); // 鎭㈠榛樿鏍峰紡
        raiseHighlighted();
        handlers.onLeave?.(d, event as PointerEvent);
      })
      .on("click", function (event, d) {
        handlers.onClick?.(d, event as PointerEvent);
      });
  }

  function destroy() {
    svg.selectAll("*").remove();
  }

  return { update, destroy };
}
