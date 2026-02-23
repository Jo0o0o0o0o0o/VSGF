import * as d3 from "d3";
import type { DogBreed } from "@/types/dogBreed";

export type TraitKey =
  | "good_with_children"
  | "good_with_other_dogs"
  | "good_with_strangers"
  | "playfulness"
  | "protectiveness"
  | "trainability"
  | "energy"
  | "barking"
  | "shedding"
  | "grooming"
  | "drooling"
  | "coat_length";

export type TraitSpec = { key: TraitKey; label: string };

export type TraitChartOptions = {
  width: number;
  height: number;
  traits?: TraitSpec[];
};

const DEFAULT_TRAITS: TraitSpec[] = [
  { key: "good_with_other_dogs", label: "good w/ other dogs" },
  { key: "energy", label: "energy" },
  { key: "trainability", label: "trainability" },
  { key: "barking", label: "barking" },
  { key: "good_with_children", label: "good w/ children" },
  { key: "playfulness", label: "playfulness" },
  { key: "protectiveness", label: "protectiveness" },
  { key: "good_with_strangers", label: "good w/ strangers" },
];

export function createTraitLineChart(svgEl: SVGSVGElement) {
  const svg = d3.select(svgEl);

  // slightly tighter, minimalist frame
  const margin = { top: 12, right: 18, bottom: 26, left: 30 };

  const root = svg.append("g").attr("class", "root");
  const gAxes = root.append("g").attr("class", "axes");
  const gLine = root.append("g").attr("class", "line");
  const gDots = root.append("g").attr("class", "dots");
  const gInteraction = root.append("g").attr("class", "interaction");
  const gHover = root
    .append("g")
    .attr("class", "hover")
    .style("display", "none")
    .style("pointer-events", "none");

  // axis containers
  const axisGroups = gAxes.append("g").attr("class", "axis-groups");

  // path
  const pathAvg = gLine.append("path").attr("fill", "none").attr("stroke-width", 2);
  const pathDog = gLine.append("path").attr("fill", "none").attr("stroke-width", 3.5);
  const hoverGuide = gHover.append("line").attr("stroke", "#94a3b8").attr("stroke-dasharray", "2 3");
  const hoverDogDot = gHover.append("circle").attr("r", 6).attr("fill", "#facc15").attr("stroke", "#fff");
  const hoverAvgDot = gHover.append("circle").attr("r", 4).attr("fill", "#9ca3af").attr("stroke", "#fff");
  const hoverTip = gHover.append("g").attr("class", "hover-tip");
  const hoverTipBg = hoverTip
    .append("rect")
    .attr("rx", 6)
    .attr("fill", "#111827")
    .attr("opacity", 0.92);
  const hoverTipText = hoverTip
    .append("text")
    .attr("fill", "#f9fafb")
    .style("font-size", "11px")
    .style("font-weight", "600");

  function update(
    dog: DogBreed | null,
    avgTraits: Record<string, number> | null,
    opt: TraitChartOptions,
  ) {
    const traits = opt.traits ?? DEFAULT_TRAITS;

    const avgValues = traits.map((t) => {
      const v = avgTraits ? (avgTraits as any)[t.key] : NaN;
      return { key: t.key, label: t.label, value: typeof v === "number" ? v : NaN };
    });

    svg.attr("viewBox", `0 0 ${opt.width} ${opt.height}`).attr("preserveAspectRatio", "none");
    const innerW = Math.max(10, opt.width - margin.left - margin.right);
    const innerH = Math.max(10, opt.height - margin.top - margin.bottom);

    root.attr("transform", `translate(${margin.left},${margin.top})`);

    const xPos = (k: string) => x(k) ?? 0;

    // Scales
    const x = d3
      .scalePoint<string>()
      .domain(traits.map((t) => t.key))
      .range([0, innerW])
      .padding(0.35);

    const y = d3.scaleLinear().domain([0, 5]).range([innerH, 0]);

    // Build values (one line)
    const values = traits.map((t) => {
      const raw = dog ? (dog[t.key] as unknown) : undefined;
      const v = typeof raw === "number" ? raw : NaN;
      return { key: t.key, label: t.label, value: v };
    });
    const avgByKey = new Map(avgValues.map((v) => [v.key, v.value] as const));
    const hoverData = values.map((v) => ({
      key: v.key,
      label: v.label,
      value: v.value,
      avg: avgByKey.get(v.key) ?? NaN,
    }));

    // Draw vertical axes per trait (like your reference image)
    const axesSel = axisGroups
      .selectAll<SVGGElement, TraitSpec>("g.axis")
      .data(traits, (d) => d.key);

    axesSel.exit().remove();

    const axesEnter = axesSel.enter().append("g").attr("class", "axis");

    // axis line + ticks
    axesEnter.each(function () {
      d3.select(this).append("g").attr("class", "y-axis");
      d3.select(this).append("text").attr("class", "axis-label");
    });

    const axesAll = axesEnter.merge(axesSel as any);

    axesAll.attr("transform", (d) => `translate(${xPos(d.key)},0)`);

    // slim vertical axes with minimal ticks
    axesAll
      .select<SVGGElement>("g.y-axis")
      .call(d3.axisLeft(y).tickValues([0, 1, 2, 3, 4, 5]).tickSize(0));

    // axis line & tick labels styling
    axesAll
      .selectAll<SVGPathElement, unknown>("g.y-axis path")
      .attr("stroke", "#4b5563")
      .attr("stroke-width", 1);

    axesAll
      .selectAll<SVGLineElement, unknown>("g.y-axis line")
      .attr("stroke", "#4b5563")
      .attr("stroke-width", 0.5);

    axesAll
      .selectAll<SVGTextElement, unknown>("g.y-axis text")
      .attr("fill", "#9ca3af")
      .style("font-size", "10px");

    axesAll
      .select<SVGTextElement>("text.axis-label")
      .attr("x", 0)
      .attr("y", innerH + 18)
      .attr("text-anchor", "middle")
      .attr("fill", "#4b5563")
      .style("font-size", "12px")
      .style("font-weight", "600")
      .text((d) => traits.find((t) => t.key === d.key)?.label ?? d.key);

    // Line generator
    const line = d3
      .line<{ key: string; value: number }>()
      .defined((d) => Number.isFinite(d.value))
      .x((d) => xPos(d.key))
      .y((d) => y(d.value));

    // Update path
    // average line: muted grey, dashed
    pathAvg
      .attr("stroke", "#9ca3af")
      .attr("opacity", 0.7)
      .attr("stroke-dasharray", "4 4")
      .attr("d", line(avgValues as any) ?? "");

    // dog line: primary yellow, rounded
    pathDog
      .attr("stroke", "#facc15")
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("opacity", dog ? 0.95 : 0.25)
      .attr("d", line(values as any) ?? "");

    // Dots
    const dots = gDots
      .selectAll<SVGCircleElement, (typeof values)[number]>("circle.dot")
      .data(values, (d) => d.key);

    dots.exit().remove();

    dots
      .join("circle")
      .attr("class", "dot")
      .attr("cx", (d) => xPos(d.key))
      .attr("cy", (d) => (Number.isFinite(d.value) ? y(d.value) : innerH))
      .attr("r", 5.5)
      .attr("fill", "#facc15")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1)
      .attr("opacity", (d) => (Number.isFinite(d.value) ? 0.98 : 0.18));

    const dotsAvg = gDots
      .selectAll<SVGCircleElement, (typeof avgValues)[number]>("circle.dot-avg")
      .data(avgValues, (d) => d.key);

    dotsAvg.exit().remove();

    dotsAvg
      .join("circle")
      .attr("class", "dot-avg")
      .attr("cx", (d) => xPos(d.key))
      .attr("cy", (d) => (Number.isFinite(d.value) ? y(d.value) : innerH))
      .attr("r", 3)
      .attr("fill", "#9ca3af")
      .attr("opacity", (d) => (Number.isFinite(d.value) ? 0.6 : 0.18));

    const xCoords = traits.map((t) => xPos(t.key));
    const xDiffs = xCoords.slice(1).map((xv, i) => Math.abs(xv - (xCoords[i] ?? xv)));
    const spacing = xCoords.length > 1 ? (d3.min(xDiffs) ?? innerW) : innerW;
    const hitWidth = Math.max(18, spacing * 0.88);

    const formatVal = (v: number) => (Number.isFinite(v) ? d3.format(".1f")(v) : "N/A");

    function showHover(d: (typeof hoverData)[number]) {
      const xv = xPos(d.key);
      const currentY = Number.isFinite(d.value) ? y(d.value) : innerH;
      const avgY = Number.isFinite(d.avg) ? y(d.avg) : innerH;

      gHover.style("display", "block");
      pathDog.attr("stroke-width", 4.2);
      pathAvg.attr("stroke-width", 2.6).attr("opacity", 0.9);

      hoverGuide.attr("x1", xv).attr("x2", xv).attr("y1", 0).attr("y2", innerH);
      hoverDogDot.attr("cx", xv).attr("cy", currentY).style("display", Number.isFinite(d.value) ? "block" : "none");
      hoverAvgDot.attr("cx", xv).attr("cy", avgY).style("display", Number.isFinite(d.avg) ? "block" : "none");

      hoverTipText.selectAll("*").remove();
      hoverTipText.append("tspan").attr("x", 0).attr("dy", "0").text(d.label);
      hoverTipText
        .append("tspan")
        .attr("x", 0)
        .attr("dy", "1.25em")
        .style("font-weight", "500")
        .text(`Current: ${formatVal(d.value)}`);
      hoverTipText
        .append("tspan")
        .attr("x", 0)
        .attr("dy", "1.25em")
        .style("font-weight", "500")
        .text(`Average: ${formatVal(d.avg)}`);

      const textNode = hoverTipText.node();
      if (!textNode) return;

      const textBox = textNode.getBBox();
      const padX = 8;
      const padY = 6;
      const tipW = textBox.width + padX * 2;
      const tipH = textBox.height + padY * 2;
      const tipX = Math.max(0, Math.min(innerW - tipW, xv - tipW / 2));
      const tipY = Math.max(0, Math.min(innerH - tipH - 6, Math.min(currentY, avgY) - tipH - 10));

      hoverTip.attr("transform", `translate(${tipX},${tipY})`);
      hoverTipBg.attr("width", tipW).attr("height", tipH);
      hoverTipText.attr("x", padX).attr("y", padY + 10);
    }

    function hideHover() {
      gHover.style("display", "none");
      pathDog.attr("stroke-width", 3.5);
      pathAvg.attr("stroke-width", 2).attr("opacity", 0.7);
    }

    const hitZones = gInteraction
      .selectAll<SVGRectElement, (typeof hoverData)[number]>("rect.hit-zone")
      .data(hoverData, (d) => d.key);

    hitZones.exit().remove();

    hitZones
      .join("rect")
      .attr("class", "hit-zone")
      .attr("x", (d) => xPos(d.key) - hitWidth / 2)
      .attr("y", 0)
      .attr("width", hitWidth)
      .attr("height", innerH)
      .attr("fill", "transparent")
      .style("cursor", "crosshair")
      .on("mouseenter", function (_, d) {
        showHover(d);
      })
      .on("mousemove", function (_, d) {
        showHover(d);
      })
      .on("mouseleave", hideHover);

    svg.on("mouseleave", hideHover);
  }

  function destroy() {
    svg.selectAll("*").remove();
  }

  return { update, destroy };
}
