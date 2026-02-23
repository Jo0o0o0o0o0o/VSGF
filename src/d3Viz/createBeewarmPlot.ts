import * as d3 from "d3";
import type { TraitKey } from "@/utils/traitFilter";
import type { BeeswarmNode } from "@/components/BeeWarmPlot.vue";

export type BeeswarmOptions = {
  width: number;
  height: number;
  traits: TraitKey[];
  traitLabels: Record<string, string>;
  highlightId?: string | null;
  pointColor?: string;
};

export type BeeswarmHandlers = {
  onHover?: (n: BeeswarmNode, ev: PointerEvent) => void;
  onMove?: (n: BeeswarmNode, ev: PointerEvent) => void;
  onLeave?: (n: BeeswarmNode, ev: PointerEvent) => void;
  onClick?: (n: BeeswarmNode, ev: PointerEvent) => void;
};

export function createBeeswarmPlot(svgEl: SVGSVGElement, handlers: BeeswarmHandlers = {}) {
  const svg = d3.select(svgEl);
  const labelRotateDeg = -35;
  const labelFontSize = 11;

  const root = svg.append("g");
  const gx = root.append("g");
  const gy = root.append("g");
  const pointsLayer = root.append("g");
  const xLabelsLayer = root.append("g");

  let lastOpt: BeeswarmOptions | null = null;

  function applyBaseStyle(
    sel: d3.Selection<SVGCircleElement, BeeswarmNode, any, any>,
    n: BeeswarmNode,
  ) {
    const hasHL = !!lastOpt?.highlightId;
    const isHL = !!(lastOpt?.highlightId && n.dogId === lastOpt.highlightId);
    const baseColor = lastOpt?.pointColor ?? "orange";

    sel
      .attr("fill", isHL ? "#ef4444" : baseColor)
      .attr("opacity", hasHL ? (isHL ? 1 : 0.25) : 0.7);
  }

  function update(nodes: BeeswarmNode[], opt: BeeswarmOptions) {
    lastOpt = opt;

    svg.attr("width", opt.width).attr("height", opt.height);
    svg.style("touch-action", "none");

    const traits = opt.traits;
    const labelTexts = traits.map((t) => opt.traitLabels[t] ?? t);
    const maxLabelChars = Math.max(0, ...labelTexts.map((txt) => txt.length));
    const approxLabelWidth = maxLabelChars * labelFontSize * 0.58;
    const rotateRad = Math.abs((labelRotateDeg * Math.PI) / 180);
    const labelVerticalReach = Math.sin(rotateRad) * approxLabelWidth;
    const labelHorizontalReach = Math.cos(rotateRad) * approxLabelWidth;
    const margin = {
      top: 42,
      right: Math.max(56, Math.ceil(labelHorizontalReach * 0.22 + 28)),
      bottom: Math.max(132, Math.ceil(64 + labelVerticalReach + labelFontSize * 1.6)),
      left: Math.max(56, Math.ceil(labelHorizontalReach * 0.42 + 28)),
    };

    const innerW = Math.max(10, opt.width - margin.left - margin.right);
    const innerH = Math.max(10, opt.height - margin.top - margin.bottom);

    root.attr("transform", `translate(${margin.left},${margin.top})`);

    // ✅ X = 维度
    const xBand = d3
      .scaleBand<string>()
      .domain(traits)
      .range([0, innerW])
      .paddingInner(0.25)
      .paddingOuter(0.08);

    // ✅ Y = 0..5
    const r = 4;
    const yTopPad = r + 12;
    const yBottomPad = r + 2;
    const yDomainTop = 5.15;

    const yScale = d3
      .scaleLinear()
      .domain([0, yDomainTop])
      .range([innerH - yBottomPad, yTopPad]);

    // axes
    gx.attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(xBand).tickFormat(() => "")); // 标签我们自己画（更可控）

    gy.call(
      d3
        .axisLeft(yScale)
        .tickValues([0, 1, 2, 3, 4, 5])
        .tickFormat(d3.format(".0f")),
    );

    // X labels（维度标签，太长就旋转）
    const xLabels = xLabelsLayer.selectAll<SVGTextElement, string>("text").data(traits, (d) => d);
    xLabels.exit().remove();

    xLabels   
      .join("text")
      .attr("x", (t) => (xBand(t)! + xBand.bandwidth() / 2))
      .attr("y", innerH + 58)
      .attr("text-anchor", "end")
      .attr("transform", (t) => {
        const x = xBand(t)! + xBand.bandwidth() / 2;
        const y = innerH + 58;
        return `rotate(${labelRotateDeg}, ${x}, ${y})`;
      })
      .style("font-size", `${labelFontSize}px`)
      .text((t) => opt.traitLabels[t] ?? t);

    // beeswarm per trait (vertical)
    const byTrait = d3.group(nodes, (n) => n.trait);

    for (const t of traits) {
      const col = byTrait.get(t) ?? [];
      const x0 = xBand(t)! + xBand.bandwidth() / 2;

      // init positions
      for (const n of col) {
        n.x   = x0;
        n.y = yScale(n.value);
      }

      const sim = d3
        .forceSimulation(col as any)
        .force("x", d3.forceX<BeeswarmNode>(x0).strength(0.2))
        .force("y", d3.forceY<BeeswarmNode>((d) => yScale(d.value)).strength(1))
        .force("collide", d3.forceCollide<BeeswarmNode>(r + 0.8))
        .stop();

      for (let i = 0; i < 110; i++) sim.tick();

      for (const n of col) {
        n.y = Math.max(yTopPad, Math.min(innerH - yBottomPad, n.y ?? yScale(n.value)));
      }
    }

    const circles = pointsLayer
      .selectAll<SVGCircleElement, BeeswarmNode>("circle")
      .data(nodes, (d: any) => `${d.trait}__${d.dogId}`);

    circles.exit().remove();

    const merged = circles
      .join("circle")
      .attr("r", r)
      .attr("cx", (d) => d.x ?? 0)
      .attr("cy", (d) => d.y ?? 0)
      .each(function (d) {
        applyBaseStyle(d3.select(this), d);
      });

    merged
      .on("pointerenter", function (event, d) {
        d3.select(this).attr("opacity", 1).raise(); // hover 不要 stroke，只稍微加强
        handlers.onHover?.(d, event as PointerEvent);
      })
      .on("pointermove", function (event, d) {
        handlers.onMove?.(d, event as PointerEvent);
      })
      .on("pointerleave", function (event, d) {
        applyBaseStyle(d3.select(this), d);
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
