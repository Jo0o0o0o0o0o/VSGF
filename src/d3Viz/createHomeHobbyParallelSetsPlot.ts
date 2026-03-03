import * as d3 from "d3";

export type HomeHobbyParallelLink = {
  aimingKey: string;
  aimingLabel: string;
  aimingIndex: number;
  personId: number;
  personName: string;
  personIndex: number;
  areaKey: string;
  areaLabel: string;
  areaIndex: number;
  value: number;
};

export type HomeHobbyParallelSetsOptions = {
  width: number;
  height: number;
  showAiming?: boolean;
};

export type HomeHobbyParallelSetsHandlers = {
  onHover?: (link: HomeHobbyParallelLink, ev: PointerEvent) => void;
  onMove?: (link: HomeHobbyParallelLink, ev: PointerEvent) => void;
  onLeave?: (link: HomeHobbyParallelLink, ev: PointerEvent) => void;
};

export function createHomeHobbyParallelSetsPlot(
  svgEl: SVGSVGElement,
  handlers: HomeHobbyParallelSetsHandlers = {},
) {
  const svg = d3.select(svgEl);
  const root = svg.append("g");
  const linksLayer = root.append("g");
  const farLeftAxisLayer = root.append("g");
  const leftAxisLayer = root.append("g");
  const rightAxisLayer = root.append("g");
  const guideLayer = root.append("g");

  function update(links: HomeHobbyParallelLink[], options: HomeHobbyParallelSetsOptions) {
    svg.attr("width", options.width).attr("height", options.height);
    svg.style("touch-action", "none");

    const margin = { top: 16, right: 190, bottom: 16, left: 190 };
    const innerW = Math.max(10, options.width - margin.left - margin.right);
    const innerH = Math.max(10, options.height - margin.top - margin.bottom);
    root.attr("transform", `translate(${margin.left},${margin.top})`);

    const showAiming = options.showAiming !== false;
    const aimingLabels = [...new Set(links.sort((a, b) => a.aimingIndex - b.aimingIndex).map((d) => d.aimingLabel))];
    const personNames = [...new Set(links.sort((a, b) => a.personIndex - b.personIndex).map((d) => d.personName))];
    const areaLabels = [...new Set(links.sort((a, b) => a.areaIndex - b.areaIndex).map((d) => d.areaLabel))];

    const yLeft = d3.scaleBand<string>().domain(personNames).range([0, innerH]).padding(0.18);
    const yRight = d3.scaleBand<string>().domain(areaLabels).range([0, innerH]).padding(0.22);
    const valueExtent = d3.extent(links, (d) => d.value) as [number, number];
    const fallbackMaxValue = Math.max(1, valueExtent[1] ?? 1);
    const sourceWidthScale = d3
      .scaleLinear()
      .domain(valueExtent[0] === valueExtent[1] ? [0, fallbackMaxValue] : valueExtent)
      .range([6, 34]);

    const areaColors = [
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
    const areaColorScale = d3.scaleOrdinal<string, string>().domain(areaLabels).range(areaColors);

    const xFarLeft = 0;
    const xLeft = showAiming ? innerW * 0.34 : 0;
    const xRight = innerW;

    const aimingTotalByLabel = d3.rollup(
      links,
      (rows) => d3.sum(rows, (row) => row.value),
      (row) => row.aimingLabel,
    );
    const aimingGap = 8;
    const aimingRangeByLabel = new Map<string, { y0: number; y1: number }>();
    if (aimingLabels.length > 0) {
      const totalGap = aimingGap * Math.max(0, aimingLabels.length - 1);
      const availableH = Math.max(10, innerH - totalGap);
      const totals = aimingLabels.map((label) => Math.max(0, aimingTotalByLabel.get(label) ?? 0));
      const totalsSum = d3.sum(totals);

      let cursorY = 0;
      aimingLabels.forEach((label, idx) => {
        const weight = totals[idx] ?? 0;
        const rawHeight = totalsSum > 0 ? (weight / totalsSum) * availableH : availableH / aimingLabels.length;
        const nextY = idx === aimingLabels.length - 1 ? innerH : Math.min(innerH, cursorY + rawHeight);
        aimingRangeByLabel.set(label, { y0: cursorY, y1: nextY });
        cursorY = nextY + aimingGap;
      });
    }
    const personTotalByName = d3.rollup(
      links,
      (rows) => d3.sum(rows, (row) => row.value),
      (row) => row.personName,
    );
    const areaTotalByLabel = d3.rollup(
      links,
      (rows) => d3.sum(rows, (row) => row.value),
      (row) => row.areaLabel,
    );
    const maxCategoryTotal = Math.max(
      1,
      d3.max([...aimingTotalByLabel.values(), ...personTotalByName.values(), ...areaTotalByLabel.values()]) ?? 1,
    );
    const bandFillRatio = 0.9;
    const pxPerValueFarLeftCandidates = aimingLabels
      .map((label) => {
        const total = aimingTotalByLabel.get(label) ?? 0;
        const range = aimingRangeByLabel.get(label);
        if (!range || total <= 0) return Number.POSITIVE_INFINITY;
        return ((range.y1 - range.y0) * bandFillRatio) / total;
      })
      .filter((value) => Number.isFinite(value) && value > 0);
    const pxPerValueFarLeft = pxPerValueFarLeftCandidates.length
      ? Math.min(...pxPerValueFarLeftCandidates)
      : (innerH * bandFillRatio) / maxCategoryTotal;
    const pxPerValueLeft = (yLeft.bandwidth() * bandFillRatio) / maxCategoryTotal;
    const pxPerValueRight = (yRight.bandwidth() * bandFillRatio) / maxCategoryTotal;
    const pxPerValue = Math.max(
      0.8,
      showAiming ? Math.min(pxPerValueFarLeft, pxPerValueLeft, pxPerValueRight) : Math.min(pxPerValueLeft, pxPerValueRight),
    );

    const aimingStartOffset = new Map<string, number>();
    for (const aimingLabel of aimingLabels) {
      const total = aimingTotalByLabel.get(aimingLabel) ?? 0;
      const usedHeight = total * pxPerValue;
      const range = aimingRangeByLabel.get(aimingLabel) ?? { y0: 0, y1: innerH };
      const centerY = (range.y0 + range.y1) * 0.5;
      aimingStartOffset.set(aimingLabel, centerY - usedHeight * 0.5);
    }
    const personStartOffset = new Map<string, number>();
    for (const personName of personNames) {
      const total = personTotalByName.get(personName) ?? 0;
      const usedHeight = total * pxPerValue;
      const centerY = (yLeft(personName) ?? 0) + yLeft.bandwidth() * 0.5;
      personStartOffset.set(personName, centerY - usedHeight * 0.5);
    }
    const areaStartOffset = new Map<string, number>();
    for (const areaLabel of areaLabels) {
      const total = areaTotalByLabel.get(areaLabel) ?? 0;
      const usedHeight = total * pxPerValue;
      const centerY = (yRight(areaLabel) ?? 0) + yRight.bandwidth() * 0.5;
      areaStartOffset.set(areaLabel, centerY - usedHeight * 0.5);
    }

    const sortedLinks = [...links].sort((a, b) => {
      const aimingCmp = a.aimingIndex - b.aimingIndex;
      if (aimingCmp !== 0) return aimingCmp;
      const personCmp = a.personIndex - b.personIndex;
      if (personCmp !== 0) return personCmp;
      return a.areaIndex - b.areaIndex;
    });

    const aimingCursor = new Map<string, number>();
    const personCursor = new Map<string, number>();
    const areaCursor = new Map<string, number>();
    const renderedLinks = sortedLinks.map((d) => {
      const sourceHeight = Math.max(5, d.value * pxPerValue, sourceWidthScale(d.value) * 0.9);
      const middleHeight = Math.max(5, sourceHeight * 0.9);
      const targetHeight = Math.max(5, sourceHeight * 0.72);
      const sourceTop = showAiming
        ? (aimingStartOffset.get(d.aimingLabel) ?? 0) + (aimingCursor.get(d.aimingLabel) ?? 0)
        : (personStartOffset.get(d.personName) ?? 0) + (personCursor.get(d.personName) ?? 0);
      const middleTop = (personStartOffset.get(d.personName) ?? 0) + (personCursor.get(d.personName) ?? 0);
      const targetTop = (areaStartOffset.get(d.areaLabel) ?? 0) + (areaCursor.get(d.areaLabel) ?? 0);

      if (showAiming) aimingCursor.set(d.aimingLabel, (aimingCursor.get(d.aimingLabel) ?? 0) + sourceHeight);
      personCursor.set(d.personName, (personCursor.get(d.personName) ?? 0) + middleHeight);
      areaCursor.set(d.areaLabel, (areaCursor.get(d.areaLabel) ?? 0) + targetHeight);

      return {
        ...d,
        sourceTop,
        sourceBottom: sourceTop + sourceHeight,
        middleTop,
        middleBottom: middleTop + middleHeight,
        targetTop,
        targetBottom: targetTop + targetHeight,
      };
    });

    linksLayer
      .selectAll<SVGPathElement, (typeof renderedLinks)[number]>("path")
      .data(renderedLinks, (d: any) => `${d.personId}-${d.areaKey}`)
      .join("path")
      .attr("d", (d) => {
        if (!showAiming) {
          const c0 = xLeft + innerW * 0.35;
          const c1 = xLeft + innerW * 0.65;
          return `M${xLeft},${d.middleTop} C${c0},${d.middleTop} ${c1},${d.targetTop} ${xRight},${d.targetTop}
            L${xRight},${d.targetBottom}
            C${c1},${d.targetBottom} ${c0},${d.middleBottom} ${xLeft},${d.middleBottom} Z`;
        }
        const c01 = xFarLeft + (xLeft - xFarLeft) * 0.45;
        const c10 = xFarLeft + (xLeft - xFarLeft) * 0.78;
        const c12 = xLeft + (xRight - xLeft) * 0.42;
        const c21 = xLeft + (xRight - xLeft) * 0.72;
        return `M${xFarLeft},${d.sourceTop}
          C${c01},${d.sourceTop} ${c10},${d.middleTop} ${xLeft},${d.middleTop}
          C${c12},${d.middleTop} ${c21},${d.targetTop} ${xRight},${d.targetTop}
          L${xRight},${d.targetBottom}
          C${c21},${d.targetBottom} ${c12},${d.middleBottom} ${xLeft},${d.middleBottom}
          C${c10},${d.middleBottom} ${c01},${d.sourceBottom} ${xFarLeft},${d.sourceBottom} Z`;
      })
      .attr("fill", (d) => areaColorScale(d.areaLabel))
      .attr("stroke", "none")
      .attr("fill-opacity", 0.26)
      .attr("cursor", "default")
      .on("pointerenter", function (event, d) {
        d3.select(this).attr("fill-opacity", 0.92);
        handlers.onHover?.(d, event as PointerEvent);
      })
      .on("pointermove", function (event, d) {
        handlers.onMove?.(d, event as PointerEvent);
      })
      .on("pointerleave", function (event, d) {
        d3.select(this).attr("fill-opacity", 0.26);
        handlers.onLeave?.(d, event as PointerEvent);
      });

    farLeftAxisLayer
      .selectAll<SVGTextElement, string>("text")
      .data(showAiming ? aimingLabels : [], (d) => d)
      .join("text")
      .attr("x", -12)
      .attr("y", (d) => {
        const range = aimingRangeByLabel.get(d) ?? { y0: 0, y1: innerH };
        return (range.y0 + range.y1) * 0.5;
      })
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 11)
      .attr("fill", "#334155")
      .text((d) => d);

    leftAxisLayer
      .selectAll<SVGTextElement, string>("text")
      .data(personNames, (d) => d)
      .join("text")
      .attr("x", xLeft - 12)
      .attr("y", (d) => (yLeft(d) ?? 0) + yLeft.bandwidth() * 0.5)
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 11)
      .attr("fill", "#334155")
      .text((d) => d);

    rightAxisLayer
      .selectAll<SVGTextElement, string>("text")
      .data(areaLabels, (d) => d)
      .join("text")
      .attr("x", innerW + 12)
      .attr("y", (d) => (yRight(d) ?? 0) + yRight.bandwidth() * 0.5)
      .attr("text-anchor", "start")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 11)
      .attr("fill", (d) => areaColorScale(d))
      .text((d) => d);

    guideLayer
      .selectAll<SVGLineElement, number>("line")
      .data(showAiming ? [xFarLeft, xLeft, xRight] : [xLeft, xRight])
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
