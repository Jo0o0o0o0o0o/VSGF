import * as d3 from "d3";
import type { EmbeddingAreaDatum } from "@/d3Viz/createEmbeddingAreaBarChart";

export type EmbeddingAreaDonutChartOptions = {
  width: number;
  height: number;
  colorByKey?: Record<string, string>;
};

export type EmbeddingAreaDonutHandlers = {
  onHover?: (datum: EmbeddingAreaDatum, ev: PointerEvent) => void;
  onMove?: (datum: EmbeddingAreaDatum, ev: PointerEvent) => void;
  onLeave?: (ev: PointerEvent) => void;
};

export function createEmbeddingAreaDonutChart(
  svgEl: SVGSVGElement,
  handlers: EmbeddingAreaDonutHandlers = {},
) {
  const svg = d3.select(svgEl);
  const root = svg.append("g").attr("class", "embedding-area-donut-root");
  const arcLayer = root.append("g").attr("class", "arc-layer");
  const centerText = root.append("text").attr("class", "center-total");

  function update(data: EmbeddingAreaDatum[], opt: EmbeddingAreaDonutChartOptions) {
    const width = Math.max(10, opt.width);
    const height = Math.max(10, opt.height);
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "none");

    const cx = width / 2;
    const cy = height / 2;
    const outerR = Math.max(28, Math.min(width, height) / 2 - 10);
    const innerR = outerR * 0.58;
    root.attr("transform", `translate(${cx},${cy})`);

    const sanitized = data
      .map((row) => ({ ...row, score: Number.isFinite(row.score) ? Math.max(0, row.score) : 0 }))
      .filter((row) => row.score > 0);
    const totalScore = d3.sum(sanitized, (d) => d.score);

    centerText
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .style("font-size", "12px")
      .style("font-weight", "700")
      .attr("fill", "#334155")
      .text(totalScore > 0 ? `Total ${totalScore.toFixed(1)}` : "No data");

    if (!sanitized.length) {
      arcLayer.selectAll("*").remove();
      return;
    }

    const pie = d3
      .pie<EmbeddingAreaDatum>()
      .sort(null)
      .value((d) => d.score);
    const pieData = pie(sanitized);
    const fallbackColor = d3
      .scaleOrdinal<string, string>()
      .domain(sanitized.map((d) => d.areaKey))
      .range(d3.schemeTableau10.concat(["#0ea5e9", "#22c55e", "#f59e0b", "#f97316"]));
    const arc = d3.arc<d3.PieArcDatum<EmbeddingAreaDatum>>().innerRadius(innerR).outerRadius(outerR);

    const slices = arcLayer
      .selectAll<SVGPathElement, d3.PieArcDatum<EmbeddingAreaDatum>>("path.donut-slice")
      .data(pieData, (d) => d.data.areaKey);
    slices.exit().remove();

    slices
      .join("path")
      .attr("class", "donut-slice")
      .attr("d", arc)
      .attr("fill", (d) => opt.colorByKey?.[d.data.areaKey] ?? fallbackColor(d.data.areaKey))
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1.4)
      .style("cursor", "default")
      .on("pointerenter", function (event, d) {
        d3.select(this).attr("opacity", 0.85);
        handlers.onHover?.(d.data, event as PointerEvent);
      })
      .on("pointermove", function (event, d) {
        handlers.onMove?.(d.data, event as PointerEvent);
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
