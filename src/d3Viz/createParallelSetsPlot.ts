import * as d3 from "d3";

export type ParallelSetsLink = {
  personId: number;
  personName: string;
  skillKey: string;
  skillLabel: string;
  skillIndex: number;
  personIndex: number;
  value: number;
};

export type ParallelSetsOptions = {
  width: number;
  height: number;
  highlightId?: number | null;
};

export type ParallelSetsHandlers = {
  onHover?: (link: ParallelSetsLink, ev: PointerEvent) => void;
  onMove?: (link: ParallelSetsLink, ev: PointerEvent) => void;
  onLeave?: (link: ParallelSetsLink, ev: PointerEvent) => void;
};

export function createParallelSetsPlot(svgEl: SVGSVGElement, handlers: ParallelSetsHandlers = {}) {
  const svg = d3.select(svgEl);
  const root = svg.append("g");
  const linksLayer = root.append("g");
  const leftAxisLayer = root.append("g");
  const rightAxisLayer = root.append("g");
  const guideLayer = root.append("g");

  let lastOptions: ParallelSetsOptions | null = null;

  function update(links: ParallelSetsLink[], options: ParallelSetsOptions) {
    lastOptions = options;
    svg.attr("width", options.width).attr("height", options.height);
    svg.style("touch-action", "none");

    const margin = { top: 16, right: 160, bottom: 16, left: 160 };
    const innerW = Math.max(10, options.width - margin.left - margin.right);
    const innerH = Math.max(10, options.height - margin.top - margin.bottom);
    root.attr("transform", `translate(${margin.left},${margin.top})`);

    const personNames = [...new Set(links.sort((a, b) => a.personIndex - b.personIndex).map((d) => d.personName))];
    const skillLabels = [...new Set(links.sort((a, b) => a.skillIndex - b.skillIndex).map((d) => d.skillLabel))];
    const personByName = new Map(personNames.map((name, index) => [name, index]));
    const skillByLabel = new Map(skillLabels.map((label, index) => [label, index]));

    const yLeft = d3.scaleBand<string>().domain(personNames).range([0, innerH]).padding(0.18);
    const yRight = d3.scaleBand<string>().domain(skillLabels).range([0, innerH]).padding(0.22);
    const valueExtent = d3.extent(links, (d) => d.value) as [number, number];
    const fallbackMaxValue = Math.max(1, valueExtent[1] ?? 1);
    const sourceWidthScale = d3
      .scaleLinear()
      .domain(valueExtent[0] === valueExtent[1] ? [0, fallbackMaxValue] : valueExtent)
      .range([7, 34]);
    const skillColors = [
      "#22c55e",
      "#f59e0b",
      "#0ea5e9",
      "#ef4444",
      "#a855f7",
      "#14b8a6",
      "#84cc16",
      "#f97316",
      "#eab308",
      "#3b82f6",
      "#ec4899",
      "#10b981",
    ];
    const skillColorScale = d3.scaleOrdinal<string, string>().domain(skillLabels).range(skillColors);

    const xLeft = 0;
    const xRight = innerW;

    const personTotalByName = d3.rollup(
      links,
      (rows) => d3.sum(rows, (row) => row.value),
      (row) => row.personName,
    );
    const skillTotalByLabel = d3.rollup(
      links,
      (rows) => d3.sum(rows, (row) => row.value),
      (row) => row.skillLabel,
    );
    const maxCategoryTotal = Math.max(
      1,
      d3.max([...personTotalByName.values(), ...skillTotalByLabel.values()]) ?? 1,
    );
    const bandFillRatio = 0.9;
    const pxPerValueLeft = (yLeft.bandwidth() * bandFillRatio) / maxCategoryTotal;
    const pxPerValueRight = (yRight.bandwidth() * bandFillRatio) / maxCategoryTotal;
    const pxPerValue = Math.max(0.8, Math.min(pxPerValueLeft, pxPerValueRight));

    const personStartOffset = new Map<string, number>();
    for (const personName of personNames) {
      const total = personTotalByName.get(personName) ?? 0;
      const usedHeight = total * pxPerValue;
      const centerY = (yLeft(personName) ?? 0) + yLeft.bandwidth() * 0.5;
      personStartOffset.set(personName, centerY - usedHeight * 0.5);
    }
    const skillStartOffset = new Map<string, number>();
    for (const skillLabel of skillLabels) {
      const total = skillTotalByLabel.get(skillLabel) ?? 0;
      const usedHeight = total * pxPerValue;
      const centerY = (yRight(skillLabel) ?? 0) + yRight.bandwidth() * 0.5;
      skillStartOffset.set(skillLabel, centerY - usedHeight * 0.5);
    }

    const sortedLinks = [...links].sort((a, b) => {
      const personCmp = a.personIndex - b.personIndex;
      if (personCmp !== 0) return personCmp;
      return a.skillIndex - b.skillIndex;
    });

    const personCursor = new Map<string, number>();
    const skillCursor = new Map<string, number>();
    const renderedLinks = sortedLinks.map((d) => {
      const sourceHeight = Math.max(5, d.value * pxPerValue, sourceWidthScale(d.value));
      const targetHeight = Math.max(5, sourceHeight * 0.72);
      const sourceTop = (personStartOffset.get(d.personName) ?? 0) + (personCursor.get(d.personName) ?? 0);
      const targetTop = (skillStartOffset.get(d.skillLabel) ?? 0) + (skillCursor.get(d.skillLabel) ?? 0);

      personCursor.set(d.personName, (personCursor.get(d.personName) ?? 0) + sourceHeight);
      skillCursor.set(d.skillLabel, (skillCursor.get(d.skillLabel) ?? 0) + targetHeight);

      return {
        ...d,
        sourceTop,
        sourceBottom: sourceTop + sourceHeight,
        targetTop,
        targetBottom: targetTop + targetHeight,
      };
    }).map((d) => ({
      ...d,
      personOrder: personByName.get(d.personName) ?? 0,
      skillOrder: skillByLabel.get(d.skillLabel) ?? 0,
    }));

    const hasHighlight = options.highlightId !== null && options.highlightId !== undefined;

    linksLayer
      .selectAll<SVGPathElement, typeof renderedLinks[number]>("path")
      .data(renderedLinks, (d: any) => `${d.personId}-${d.skillKey}`)
      .join("path")
      .attr("d", (d) => {
        const c0 = xLeft + innerW * 0.35;
        const c1 = xLeft + innerW * 0.65;
        return `M${xLeft},${d.sourceTop} C${c0},${d.sourceTop} ${c1},${d.targetTop} ${xRight},${d.targetTop}
          L${xRight},${d.targetBottom}
          C${c1},${d.targetBottom} ${c0},${d.sourceBottom} ${xLeft},${d.sourceBottom} Z`;
      })
      .attr("fill", (d) => skillColorScale(d.skillLabel))
      .attr("stroke", "none")
      .attr("fill-opacity", (d) => {
        if (!hasHighlight) return 0.22;
        return d.personId === options.highlightId ? 0.75 : 0.06;
      })
      .attr("cursor", "default")
      .sort((a, b) => (a.personOrder - b.personOrder) || (a.skillOrder - b.skillOrder))
      .on("pointerenter", function (event, d) {
        d3.select(this).attr("fill-opacity", 0.95);
        handlers.onHover?.(d, event as PointerEvent);
      })
      .on("pointermove", function (event, d) {
        handlers.onMove?.(d, event as PointerEvent);
      })
      .on("pointerleave", function (event, d) {
        const opacity = !lastOptions?.highlightId ? 0.22 : d.personId === lastOptions.highlightId ? 0.75 : 0.06;
        d3.select(this).attr("fill-opacity", opacity);
        handlers.onLeave?.(d, event as PointerEvent);
      });

    leftAxisLayer
      .selectAll<SVGTextElement, string>("text")
      .data(personNames, (d) => d)
      .join("text")
      .attr("x", -12)
      .attr("y", (d) => (yLeft(d) ?? 0) + yLeft.bandwidth() * 0.5)
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 11)
      .attr("fill", "#334155")
      .text((d) => d);

    rightAxisLayer
      .selectAll<SVGTextElement, string>("text")
      .data(skillLabels, (d) => d)
      .join("text")
      .attr("x", innerW + 12)
      .attr("y", (d) => (yRight(d) ?? 0) + yRight.bandwidth() * 0.5)
      .attr("text-anchor", "start")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 11)
      .attr("fill", (d) => skillColorScale(d))
      .text((d) => d);

    leftAxisLayer
      .selectAll<SVGLineElement, string>("line")
      .data(personNames, (d) => d)
      .join("line")
      .attr("x1", -4)
      .attr("x2", 0)
      .attr("y1", (d) => (yLeft(d) ?? 0) + yLeft.bandwidth() * 0.5)
      .attr("y2", (d) => (yLeft(d) ?? 0) + yLeft.bandwidth() * 0.5)
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", 1);

    rightAxisLayer
      .selectAll<SVGLineElement, string>("line")
      .data(skillLabels, (d) => d)
      .join("line")
      .attr("x1", innerW)
      .attr("x2", innerW + 4)
      .attr("y1", (d) => (yRight(d) ?? 0) + yRight.bandwidth() * 0.5)
      .attr("y2", (d) => (yRight(d) ?? 0) + yRight.bandwidth() * 0.5)
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", 1);

    guideLayer
      .selectAll<SVGLineElement, number>("line")
      .data([xLeft, xRight])
      .join("line")
      .attr("x1", (d) => d)
      .attr("x2", (d) => d)
      .attr("y1", 0)
      .attr("y2", innerH)
      .attr("stroke", "#1f2937")
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.8);
  }

  function destroy() {
    svg.selectAll("*").remove();
  }

  return { update, destroy };
}
