import * as d3 from "d3";

export type ThresholdProgressDatum = {
  dimensionKey: string;
  dimensionLabel: string;
  role: "leader" | "support";
  personId: number | null;
  personName: string;
  score: number;
  color?: string;
};

export type ThresholdProgressOptions = {
  width: number;
  height: number;
  yMax?: number;
};

export type ThresholdProgressHandlers = {
  onHover?: (datum: ThresholdProgressDatum, ev: PointerEvent) => void;
  onMove?: (datum: ThresholdProgressDatum, ev: PointerEvent) => void;
  onLeave?: (ev: PointerEvent) => void;
};

export function createThresholdProgressBars(
  svgEl: SVGSVGElement,
  handlers: ThresholdProgressHandlers = {},
) {
  const svg = d3.select(svgEl);
  const root = svg.append("g").attr("class", "threshold-root");
  const gx = root.append("g").attr("class", "x-axis");
  const gy = root.append("g").attr("class", "y-axis");
  const barsLayer = root.append("g").attr("class", "bars-layer");

  function update(data: ThresholdProgressDatum[], opt: ThresholdProgressOptions) {
    svg.attr("viewBox", `0 0 ${opt.width} ${opt.height}`).attr("preserveAspectRatio", "none");

    const margin = { top: 34, right: 12, bottom: 92, left: 42 };
    const innerW = Math.max(10, opt.width - margin.left - margin.right);
    const innerH = Math.max(10, opt.height - margin.top - margin.bottom);
    root.attr("transform", `translate(${margin.left},${margin.top})`);

    const dimensions = [...new Set(data.map((d) => d.dimensionKey))];
    const roles: Array<ThresholdProgressDatum["role"]> = ["leader", "support"];

    const x0 = d3.scaleBand<string>().domain(dimensions).range([0, innerW]).paddingInner(0.24).paddingOuter(0.08);
    const x1 = d3.scaleBand<ThresholdProgressDatum["role"]>().domain(roles).range([0, x0.bandwidth()]).padding(0.18);
    const groupTotals = d3.rollup(
      data,
      (rows) => d3.sum(rows, (row) => Math.max(0, row.score)),
      (row) => `${row.dimensionKey}__${row.role}`,
    );
    const dynamicMax = d3.max(Array.from(groupTotals.values())) ?? 0;
    const baselineMax = Math.max(10, opt.yMax ?? 0, dynamicMax);
    const y = d3.scaleLinear().domain([0, baselineMax]).nice().range([innerH, 0]);
    let topTick = y.domain()[1] ?? baselineMax;
    if (topTick <= dynamicMax) {
      y.domain([0, dynamicMax + 1]).nice();
      topTick = y.domain()[1] ?? (dynamicMax + 1);
      if (topTick <= dynamicMax) {
        y.domain([0, dynamicMax + 2]).nice();
      }
    }

    gx.attr("transform", `translate(0,${innerH})`).call(
      d3.axisBottom(x0).tickFormat((key) => data.find((d) => d.dimensionKey === key)?.dimensionLabel ?? key),
    );
    gx.selectAll("path,line").attr("stroke", "#9ca3af");
    gx.selectAll("text")
      .attr("fill", "#374151")
      .style("font-size", "11px");

    gy.call(d3.axisLeft(y).ticks(5).tickSizeOuter(0));
    gy.selectAll("path,line").attr("stroke", "#9ca3af");
    gy.selectAll("text").attr("fill", "#374151").style("font-size", "10px");

    const grid = root.selectAll<SVGLineElement, number>("line.grid-line").data(y.ticks(5), (d) => String(d));
    grid.exit().remove();
    grid
      .join("line")
      .attr("class", "grid-line")
      .attr("x1", 0)
      .attr("x2", innerW)
      .attr("y1", (d) => y(d))
      .attr("y2", (d) => y(d))
      .attr("stroke", "#e5e7eb")
      .attr("stroke-width", 1);

    const grouped = d3.groups(data, (d) => `${d.dimensionKey}__${d.role}`);
    const stackedData = grouped.flatMap(([, rows]) => {
      let acc = 0;
      return rows.map((row, stackIndex) => {
        const value = Math.max(0, row.score);
        const y0 = acc;
        acc += value;
        return { ...row, stackIndex, y0, y1: acc };
      });
    });

    const bars = barsLayer.selectAll<SVGRectElement, typeof stackedData[number]>("rect.threshold-bar").data(
      stackedData,
      (d: any) => `${d.dimensionKey}-${d.role}-${d.stackIndex}-${d.personId}-${d.personName}`,
    );
    bars.exit().remove();

    bars
      .join("rect")
      .attr("class", "threshold-bar")
      .attr("x", (d) => (x0(d.dimensionKey) ?? 0) + (x1(d.role) ?? 0))
      .attr("y", (d) => y(d.y1))
      .attr("width", Math.max(2, x1.bandwidth()))
      .attr("height", (d) => Math.max(0.5, y(d.y0) - y(d.y1)))
      .attr("fill", (d) => d.color ?? (d.role === "leader" ? "#0f766e" : "#f59e0b"))
      .attr("rx", 3)
      .style("cursor", "default")
      .on("pointerenter", function (event, d) {
        d3.select(this).attr("opacity", 0.82);
        handlers.onHover?.(d, event as PointerEvent);
      })
      .on("pointermove", function (event, d) {
        handlers.onMove?.(d, event as PointerEvent);
      })
      .on("pointerleave", function (event) {
        d3.select(this).attr("opacity", 1);
        handlers.onLeave?.(event as PointerEvent);
      });
  }

  function destroy() {
    svg.selectAll("*").remove();
  }

  return { update, destroy };
}
