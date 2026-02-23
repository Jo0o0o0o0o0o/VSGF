import * as d3 from "d3";

export type RadarKey =
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

export const RADAR_AXES: AxisItem[] = [
  { key: "good_with_children", label: "Children" },
  { key: "good_with_other_dogs", label: "Other dogs" },
  { key: "good_with_strangers", label: "Strangers" },
  { key: "playfulness", label: "Playfulness" },
  { key: "protectiveness", label: "Protect" },
  { key: "trainability", label: "Train" },
  { key: "energy", label: "Energy" },
  { key: "barking", label: "Barking" },
  { key: "shedding", label: "Shedding" },
  { key: "grooming", label: "Grooming" },
  { key: "drooling", label: "Drooling" },
  { key: "coat_length", label: "Coat length" },
];

export type RadarDog = {
  name: string;
} & {
  [k in RadarKey]: number;
};

export type AxisItem = { key: RadarKey; label: string };

export type RadarOptions = {
  width: number;
  height: number;
  min?: number; // default 0
  max?: number; // default 5
  levels?: number; // default 5（画 1..5）
  axes?:AxisItem [];
  focusIndex?: number | null;
};

export type RadarHoverDatum = {
  dogIndex: number;
  dogName: string;
  dimensions: Array<{
    axisKey: RadarKey;
    axisLabel: string;
    value: number;
  }>;
};

export type RadarHandlers = {
  onHover?: (d: RadarHoverDatum, ev: PointerEvent) => void;
  onMove?: (d: RadarHoverDatum, ev: PointerEvent) => void;
  onLeave?: (ev: PointerEvent) => void;
  onClick?: (dogIndex: number, ev: PointerEvent) => void;
};

// 黄色主题色板：主色黄色 + 暖色系搭配
const YELLOW_THEME = {
  primary: "#E6A800",
  primaryLight: "rgba(230, 168, 0, 0.35)",
  primarySubtle: "rgba(230, 168, 0, 0.18)",
  gridStroke: "rgba(198, 142, 0, 0.22)",
  spokeStroke: "rgba(198, 142, 0, 0.28)",
  tickFill: "rgba(92, 66, 16, 0.78)",
  axisLabelFill: "rgba(72, 52, 12, 0.88)",
  emptyText: "rgba(92, 66, 16, 0.55)",
};

// [ADDED] 统一颜色表：黄色为首，其余暖色/互补
export const RADAR_COLORS: string[] = [
  YELLOW_THEME.primary,
  "#C75B39",
  "#7B68A6",
  "#4A9B8E",
  "#6dc44d",
  "#8B7355",
  "#A0526E",
  "#5B8FA3",
  ...d3.schemeTableau10.slice(6),
];


export function createRadarChart(svgEl: SVGSVGElement, handlers: RadarHandlers = {}) {
  const svg = d3.select(svgEl);

  const root = svg.append("g");
  const gridLayer = root.append("g");
  const axesLayer = root.append("g");
  const dataLayer = root.append("g");

  let lastOpt: RadarOptions | null = null;

  function clamp(v: number, min: number, max: number) {
    if (!Number.isFinite(v)) return min;
    return Math.max(min, Math.min(max, v));
  }

  function polygonPath(points: [number, number][]) {
    return d3.line<[number, number]>().curve(d3.curveLinearClosed)(points) ?? "";
  }

  function update(dogs: RadarDog[], opt: RadarOptions) {
    gridLayer.selectAll("*").remove();
    axesLayer.selectAll("*").remove();
    dataLayer.selectAll("*").remove();
    
    lastOpt = opt;

    const width = Math.max(10, opt.width);
    const height = Math.max(10, opt.height);
    const minV = opt.min ?? 0;
    const maxV = opt.max ?? 5;
    const levels = opt.levels ?? 5; // 画 1..levels


    svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .attr("width", "100%")
      .attr("height", "100%");

    const AXES = opt.axes ?? RADAR_AXES;
    if (!AXES || AXES.length < 3) {
  axesLayer
    .append("text")
    .attr("text-anchor", "middle")
    .attr("font-size", 12)
    .attr("fill", YELLOW_THEME.emptyText)
    .text("Select at least 3 dimensions");
  return;
}

    const N = AXES.length;
    // 容器中心
    const outerPadding = 34;
    const axisLabelOffset = 18;
    const r = Math.max(10, Math.min(width, height) / 2 - (outerPadding + axisLabelOffset));
    const cx = width / 2;
    const cy = height / 2;

    root.attr("transform", `translate(${cx},${cy})`);

    const angle = (i: number) => (Math.PI * 2 * i) / N - Math.PI / 2; // 顶部开始
    const scaleR = d3.scaleLinear().domain([minV, maxV]).range([0, r]);

    // ===== 1) Grid：多边形分级网格（1..levels）
    const levelVals = d3.range(1, levels + 1, 1);

    gridLayer
      .selectAll("path.grid")
      .data(levelVals)
      .join("path")
      .attr("class", "grid")
      .attr("d", (lv) => {
        const rr = scaleR(lv);
        const pts = d3.range(N).map((i) => [Math.cos(angle(i)) * rr, Math.sin(angle(i)) * rr] as [number, number]);
        return polygonPath(pts);
      })
      .attr("fill", "none")
      .attr("stroke", YELLOW_THEME.gridStroke)
      .attr("stroke-width", 1.2);

    // 分级文字（0..5），放在顶部轴线上
    const tickVals = d3.range(minV, maxV + 1, 1);
    axesLayer
      .selectAll("text.tick")
      .data(tickVals)
      .join("text")
      .attr("class", "tick")
      .attr("x", 0)
      .attr("y", (v) => -scaleR(v))
      .attr("dy", "-0.25em")
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("fill", YELLOW_THEME.tickFill)
      .attr("font-weight", 500)
      .text((v) => String(v));

    // ===== 2) Spokes：放射轴线
    axesLayer
      .selectAll("line.spoke")
      .data(d3.range(N))
      .join("line")
      .attr("class", "spoke")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", (i) => Math.cos(angle(i)) * r)
      .attr("y2", (i) => Math.sin(angle(i)) * r)
      .attr("stroke", YELLOW_THEME.spokeStroke)
      .attr("stroke-width", 1.2);

    // 轴标签
    axesLayer
      .selectAll("text.axisLabel")
      .data(AXES)
      .join("text")
      .attr("class", "axisLabel")
      .attr("x", (_d, i) => Math.cos(angle(i)) * (r + axisLabelOffset))
      .attr("y", (_d, i) => Math.sin(angle(i)) * (r + axisLabelOffset))
      .attr("text-anchor", (_d, i) => {
        const c = Math.cos(angle(i));
        if (Math.abs(c) < 0.2) return "middle";
        return c > 0 ? "start" : "end";
      })
      .attr("dominant-baseline", (_d, i) => {
        const s = Math.sin(angle(i));
        if (Math.abs(s) < 0.2) return "middle";
        return s > 0 ? "hanging" : "alphabetic";
      })
      .attr("font-size", 11)
      .attr("font-weight", 600)
      .attr("fill", YELLOW_THEME.axisLabelFill)
      .text((d) => d.label);

    // ===== 3) Data：多只狗 polygon 叠加
    const colorAt = (i: number): string => {
      const c = RADAR_COLORS[i % RADAR_COLORS.length];
      return c ?? "#898989"; // 理论上不会触发，纯兜底
    };

    const keyOf = (d: RadarDog) => d.name;

    const groups = dataLayer
      .selectAll<SVGGElement, RadarDog>("g.dog")
      .data(dogs, keyOf)
      .join("g")
      .attr("class", "dog");

    // polygon points
    function pointsOf(d: RadarDog) {
      const pts = AXES.map((a, i) => {
        const v = clamp((d as any)[a.key], minV, maxV);
        const rr = scaleR(v);
        return [Math.cos(angle(i)) * rr, Math.sin(angle(i)) * rr] as [number, number];
      });
      return pts;
    }

    function hoverDatumOf(dog: RadarDog, dogIndex: number): RadarHoverDatum {
      return {
        dogIndex,
        dogName: dog.name,
        dimensions: AXES.map((axis) => ({
          axisKey: axis.key,
          axisLabel: axis.label,
          value: clamp((dog as any)[axis.key], minV, maxV),
        })),
      };
    }

    groups
      .selectAll("path.area")
      .data((dog, dogIndex) => [{ dog, dogIndex }])
      .join("path")
      .attr("class", "area")
      .attr("d", (d) => polygonPath(pointsOf(d.dog)))
      .attr("fill", (d) => colorAt(d.dogIndex))
      .attr("fill-opacity", 0.22)
      .attr("stroke", (d) => colorAt(d.dogIndex))
      .attr("stroke-width", 2.2)
      .style("cursor", "pointer")
      .on("pointerenter", (event, d) => {
        handlers.onHover?.(hoverDatumOf(d.dog, d.dogIndex), event as PointerEvent);
      })
      .on("pointermove", (event, d) => {
        handlers.onMove?.(hoverDatumOf(d.dog, d.dogIndex), event as PointerEvent);
      })
      .on("pointerleave", (event) => {
        handlers.onLeave?.(event as PointerEvent);
      })
      .on("click", (event, d) => {
        handlers.onClick?.(d.dogIndex, event as PointerEvent);
      });

    // 点（可选，但有助于“分级明确”）
    groups
      .selectAll("circle.pt")
      .data((dog, dogIndex) =>
       AXES.map((axis, i) => {
         const value = clamp((dog as any)[axis.key], minV, maxV);
         const rr = scaleR(value);
         return {
           p: [Math.cos(angle(i)) * rr, Math.sin(angle(i)) * rr] as [number, number],
           i,
           dogIndex,
           dogName: dog.name,
           axisKey: axis.key,
           axisLabel: axis.label,
           value,
         };
       })
       )
      .join("circle")
      .attr("class", "pt")
      .attr("cx", (d) => d.p[0])
      .attr("cy", (d) => d.p[1])
      .attr("r", 2.8)
      .attr("fill", (d) => colorAt(d.dogIndex))
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.8)
      .attr("opacity", 0.95)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        handlers.onClick?.(d.dogIndex, event as PointerEvent);
      });

    const focus = opt.focusIndex ?? null;
const hasFocus = focus !== null && focus >= 0 && focus < dogs.length;

console.log("[RadarD3] focusIndex =", focus, "dogs =", dogs.length);

if (!hasFocus) {
  // 正常态
  groups.attr("opacity", 1);

  groups.selectAll<SVGPathElement, { dog: RadarDog; dogIndex: number }>("path.area")
    .attr("fill-opacity", 0.22)
    .attr("stroke-opacity", 1);

  groups.selectAll<SVGCircleElement, any>("circle.pt")
    .attr("opacity", 0.95);
} else {
  // 让“非 focus”的组整体变淡（但不要淡到看不见）
  groups.attr("opacity", (_d, gi) => (gi === focus ? 1 : 0.65));

  // ✅ 重点：path.area 的 datum 里有 dogIndex
  groups.selectAll<SVGPathElement, { dog: RadarDog; dogIndex: number }>("path.area")
    .attr("fill-opacity", (d) => (d.dogIndex === focus ? 0.28 : 0.14))
    .attr("stroke-opacity", (d) => (d.dogIndex === focus ? 1 : 0.6));

  // ✅ 重点：circle.pt 的 datum 里也要带 dogIndex（你前面 data 已经这么做了）
  groups.selectAll<SVGCircleElement, any>("circle.pt")
    .attr("opacity", (d) => (d.dogIndex === focus ? 0.95 : 0.35));

  // 置顶：这一步用 groups 的 index 才是对的
  groups.filter((_d, gi) => gi === focus).raise();

}
  }

  function destroy() {
    svg.selectAll("*").remove();
  }

  return { update, destroy };
}
