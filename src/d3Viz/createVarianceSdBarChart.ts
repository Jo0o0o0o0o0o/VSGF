import * as d3 from "d3";
export type VarianceSdDatum = {
  categoryKey: string;
  categoryLabel: string;
  variance: number;
  sd: number;
};

export type VarianceSdBarOptions = {
  width: number;
  height: number;
};

export type VarianceSdBarHandlers = {
  onHover?: (
    datum: VarianceSdDatum & { metric: "variance" | "sd"; value: number },
    ev: PointerEvent,
  ) => void;
  onMove?: (
    datum: VarianceSdDatum & { metric: "variance" | "sd"; value: number },
    ev: PointerEvent,
  ) => void;
  onLeave?: (ev: PointerEvent) => void;
};

export function createVarianceSdBarChart(
  svgEl: SVGSVGElement,
  handlers: VarianceSdBarHandlers = {},
) {
  const svg = d3.select(svgEl);
  const root = svg.append("g").attr("class", "variance-sd-root");
  const gx = root.append("g").attr("class", "x-axis");
  const gy = root.append("g").attr("class", "y-axis");
  const barsLayer = root.append("g").attr("class", "bars-layer");
  const legendLayer = root.append("g").attr("class", "legend-layer");

  function update(data: VarianceSdDatum[], opt: VarianceSdBarOptions) {
    svg.attr("viewBox", `0 0 ${opt.width} ${opt.height}`).attr("preserveAspectRatio", "none");

    const margin = { top: 18, right: 18, bottom: 108, left: 56 };
    const innerW = Math.max(10, opt.width - margin.left - margin.right);
    const innerH = Math.max(10, opt.height - margin.top - margin.bottom);
    root.attr("transform", `translate(${margin.left},${margin.top})`);

    const metricNames = ["variance", "sd"] as const;
    const metricColor: Record<(typeof metricNames)[number], string> = {
      variance: "#ef6c00",
      sd: "#2563eb",
    };

    const x0 = d3
      .scaleBand<string>()
      .domain(data.map((d) => d.categoryKey))
      .range([0, innerW])
      .paddingInner(0.25)
      .paddingOuter(0.08);

    const x1 = d3
      .scaleBand<(typeof metricNames)[number]>()
      .domain(metricNames)
      .range([0, x0.bandwidth()])
      .padding(0.18);

    const flat = data.flatMap((d) => metricNames.map((metric) => ({ d, metric, value: d[metric] })));
    const maxY = Math.max(1e-6, d3.max(flat, (item) => item.value) ?? 1);
    const y = d3.scaleLinear().domain([0, maxY]).nice().range([innerH, 0]);

    gx.attr("transform", `translate(0,${innerH})`).call(
      d3.axisBottom(x0).tickFormat((key) => data.find((d) => d.categoryKey === key)?.categoryLabel ?? key),
    );
    gx.selectAll("path,line").attr("stroke", "#9ca3af");
    gx.selectAll("text")
      .attr("fill", "#374151")
      .style("font-size", "10px")
      .attr("text-anchor", "end")
      .attr("transform", "rotate(-28)")
      .attr("dx", "-0.4em")
      .attr("dy", "0.15em");

    gy.call(d3.axisLeft(y).ticks(6).tickSizeOuter(0));
    gy.selectAll("path,line").attr("stroke", "#9ca3af");
    gy.selectAll("text").attr("fill", "#374151").style("font-size", "10px");

    const bars = barsLayer
      .selectAll<SVGRectElement, (typeof flat)[number]>("rect.metric-bar")
      .data(flat, (item) => `${item.d.categoryKey}__${item.metric}`);

    bars.exit().remove();

    bars
      .join("rect")
      .attr("class", "metric-bar")
      .attr("x", (item) => (x0(item.d.categoryKey) ?? 0) + (x1(item.metric) ?? 0))
      .attr("y", (item) => y(item.value))
      .attr("width", Math.max(2, x1.bandwidth()))
      .attr("height", (item) => Math.max(0.5, innerH - y(item.value)))
      .attr("fill", (item) => metricColor[item.metric])
      .attr("rx", 2)
      .style("cursor", "default")
      .on("pointerenter", function (event, item) {
        d3.select(this).attr("opacity", 0.82);
        handlers.onHover?.({ ...item.d, metric: item.metric, value: item.value }, event as PointerEvent);
      })
      .on("pointermove", function (event, item) {
        handlers.onMove?.({ ...item.d, metric: item.metric, value: item.value }, event as PointerEvent);
      })
      .on("pointerleave", function (event) {
        d3.select(this).attr("opacity", 1);
        handlers.onLeave?.(event as PointerEvent);
      });

    const labels = barsLayer
      .selectAll<SVGTextElement, (typeof flat)[number]>("text.metric-label")
      .data(flat, (item) => `${item.d.categoryKey}__${item.metric}`);

    labels.exit().remove();

    labels
      .join("text")
      .attr("class", "metric-label")
      .attr("x", (item) => (x0(item.d.categoryKey) ?? 0) + (x1(item.metric) ?? 0) + x1.bandwidth() / 2)
      .attr("y", (item) => y(item.value) - 5)
      .attr("text-anchor", "middle")
      .attr("font-size", 9)
      .attr("font-weight", 600)
      .attr("fill", "#374151")
      .text((item) => item.value.toFixed(2).replace(/\.00$/, ""));

    const legend = legendLayer
      .selectAll<SVGGElement, (typeof metricNames)[number]>("g.legend-item")
      .data(metricNames, (d) => d);

    legend.exit().remove();

    const legendJoin = legend
      .join("g")
      .attr("class", "legend-item")
      .attr("transform", (_d, i) => `translate(${i * 110}, 0)`);

    legendJoin
      .selectAll("rect")
      .data((d) => [d])
      .join("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", 10)
      .attr("height", 10)
      .attr("rx", 2)
      .attr("fill", (d) => metricColor[d]);

    legendJoin
      .selectAll("text")
      .data((d) => [d])
      .join("text")
      .attr("x", 16)
      .attr("y", 9)
      .attr("font-size", 11)
      .attr("fill", "#374151")
      .text((d) => (d === "variance" ? "Variance" : "SD"));

    legendLayer.attr("transform", `translate(${Math.max(0, innerW - 230)}, ${-8})`);
  }

  function destroy() {
    svg.selectAll("*").remove();
  }

  return { update, destroy };
}
