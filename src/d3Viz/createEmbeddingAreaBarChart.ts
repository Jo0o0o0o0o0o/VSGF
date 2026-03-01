import * as d3 from "d3";

export type EmbeddingAreaDatum = {
  areaKey: string;
  areaLabel: string;
  score: number;
  rawScore: number;
};

export type EmbeddingAreaBarChartOptions = {
  width: number;
  height: number;
  yMax?: number;
};

export type EmbeddingAreaBarHandlers = {
  onHover?: (datum: EmbeddingAreaDatum, ev: PointerEvent) => void;
  onMove?: (datum: EmbeddingAreaDatum, ev: PointerEvent) => void;
  onLeave?: (ev: PointerEvent) => void;
};

export function createEmbeddingAreaBarChart(
  svgEl: SVGSVGElement,
  handlers: EmbeddingAreaBarHandlers = {},
) {
  const svg = d3.select(svgEl);
  const root = svg.append("g").attr("class", "embedding-area-root");
  const gx = root.append("g").attr("class", "x-axis");
  const gy = root.append("g").attr("class", "y-axis");
  const barsLayer = root.append("g").attr("class", "bars-layer");

  function update(data: EmbeddingAreaDatum[], opt: EmbeddingAreaBarChartOptions) {
    svg.attr("viewBox", `0 0 ${opt.width} ${opt.height}`).attr("preserveAspectRatio", "none");

    const margin = { top: 20, right: 12, bottom: 96, left: 44 };
    const innerW = Math.max(10, opt.width - margin.left - margin.right);
    const innerH = Math.max(10, opt.height - margin.top - margin.bottom);
    root.attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleBand<string>()
      .domain(data.map((d) => d.areaKey))
      .range([0, innerW])
      .padding(0.2);

    const yMax = Math.max(1, opt.yMax ?? 20);
    const y = d3.scaleLinear().domain([0, yMax]).nice().range([innerH, 0]);

    gx.attr("transform", `translate(0,${innerH})`).call(
      d3.axisBottom(x).tickFormat((key) => data.find((d) => d.areaKey === key)?.areaLabel ?? key),
    );
    gx.selectAll("path,line").attr("stroke", "#9ca3af");
    gx.selectAll("text")
      .attr("fill", "#374151")
      .style("font-size", "10px")
      .attr("text-anchor", "end")
      .attr("transform", "rotate(-28)")
      .attr("dx", "-0.45em")
      .attr("dy", "0.15em");

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

    const bars = barsLayer.selectAll<SVGRectElement, EmbeddingAreaDatum>("rect.area-bar").data(data, (d) => d.areaKey);
    bars.exit().remove();

    bars
      .join("rect")
      .attr("class", "area-bar")
      .attr("x", (d) => x(d.areaKey) ?? 0)
      .attr("y", (d) => y(d.score))
      .attr("width", Math.max(2, x.bandwidth()))
      .attr("height", (d) => Math.max(0.5, innerH - y(d.score)))
      .attr("fill", "#f59e0b")
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
