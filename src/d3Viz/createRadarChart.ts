import * as d3 from "d3";

export type RadarKey =
  | "information_visualization"
  | "statistical"
  | "mathematics"
  | "drawing_and_artistic"
  | "computer_usage"
  | "programming"
  | "computer_graphics_programming"
  | "human_computer_interaction_programming"
  | "user_experience_evaluation"
  | "communication"
  | "collaboration"
  | "code_repository";

export type AxisItem = { key: RadarKey; label: string };

export const RADAR_AXES: AxisItem[] = [
  { key: "information_visualization", label: "Info Viz" },
  { key: "statistical", label: "Statistical" },
  { key: "mathematics", label: "Mathematics" },
  { key: "drawing_and_artistic", label: "Drawing/Art" },
  { key: "computer_usage", label: "Computer Usage" },
  { key: "programming", label: "Programming" },
  { key: "computer_graphics_programming", label: "CG Programming" },
  { key: "human_computer_interaction_programming", label: "HCI Programming" },
  { key: "user_experience_evaluation", label: "UX Evaluation" },
  { key: "communication", label: "Communication" },
  { key: "collaboration", label: "Collaboration" },
  { key: "code_repository", label: "Code Repository" },
];

export type RadarDog = {
  name: string;
} & {
  [k in RadarKey]: number;
};

export type RadarOptions = {
  width: number;
  height: number;
  min?: number;
  max?: number;
  levels?: number;
  axes?: AxisItem[];
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

const YELLOW_THEME = {
  primary: "#E6A800",
  gridStroke: "rgba(198, 142, 0, 0.22)",
  spokeStroke: "rgba(198, 142, 0, 0.28)",
  tickFill: "rgba(92, 66, 16, 0.78)",
  axisLabelFill: "rgba(72, 52, 12, 0.88)",
  emptyText: "rgba(92, 66, 16, 0.55)",
};

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

    const width = Math.max(10, opt.width);
    const height = Math.max(10, opt.height);
    const minV = opt.min ?? 0;
    const maxV = opt.max ?? 5;
    const levels = Math.max(1, Math.round(opt.levels ?? 5));

    svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .attr("width", "100%")
      .attr("height", "100%");

    const axes = opt.axes ?? RADAR_AXES;
    if (!axes || axes.length < 3) {
      axesLayer
        .append("text")
        .attr("text-anchor", "middle")
        .attr("font-size", 12)
        .attr("fill", YELLOW_THEME.emptyText)
        .text("Select at least 3 dimensions");
      return;
    }

    const count = axes.length;
    const outerPadding = 34;
    const axisLabelOffset = 18;
    const radius = Math.max(10, Math.min(width, height) / 2 - (outerPadding + axisLabelOffset));
    const cx = width / 2;
    const cy = height / 2;

    root.attr("transform", `translate(${cx},${cy})`);

    const angle = (i: number) => (Math.PI * 2 * i) / count - Math.PI / 2;
    const scaleR = d3.scaleLinear().domain([minV, maxV]).range([0, radius]);
    const valueRange = Math.max(1e-6, maxV - minV);
    const levelVals = d3.range(1, levels + 1, 1).map((step) => minV + (valueRange * step) / levels);

    gridLayer
      .selectAll("path.grid")
      .data(levelVals)
      .join("path")
      .attr("class", "grid")
      .attr("d", (lv) => {
        const rr = scaleR(lv);
        const pts = d3
          .range(count)
          .map((i) => [Math.cos(angle(i)) * rr, Math.sin(angle(i)) * rr] as [number, number]);
        return polygonPath(pts);
      })
      .attr("fill", "none")
      .attr("stroke", YELLOW_THEME.gridStroke)
      .attr("stroke-width", 1.2);

    const tickVals = [minV, ...levelVals];
    const fmt = d3.format(".1f");
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
      .text((v) => {
        const rounded = Number(v.toFixed(2));
        const isInt = Math.abs(rounded - Math.round(rounded)) < 1e-9;
        return isInt ? String(Math.round(rounded)) : fmt(rounded);
      });

    axesLayer
      .selectAll("line.spoke")
      .data(d3.range(count))
      .join("line")
      .attr("class", "spoke")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", (i) => Math.cos(angle(i)) * radius)
      .attr("y2", (i) => Math.sin(angle(i)) * radius)
      .attr("stroke", YELLOW_THEME.spokeStroke)
      .attr("stroke-width", 1.2);

    axesLayer
      .selectAll("text.axisLabel")
      .data(axes)
      .join("text")
      .attr("class", "axisLabel")
      .attr("x", (_d, i) => Math.cos(angle(i)) * (radius + axisLabelOffset))
      .attr("y", (_d, i) => Math.sin(angle(i)) * (radius + axisLabelOffset))
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

    const colorAt = (i: number) => RADAR_COLORS[i % RADAR_COLORS.length] ?? "#898989";

    const groups = dataLayer
      .selectAll<SVGGElement, RadarDog>("g.dog")
      .data(dogs, (d: RadarDog) => d.name)
      .join("g")
      .attr("class", "dog");

    function pointsOf(dog: RadarDog) {
      return axes.map((axis, i) => {
        const v = clamp((dog as Record<RadarKey, number>)[axis.key], minV, maxV);
        const rr = scaleR(v);
        return [Math.cos(angle(i)) * rr, Math.sin(angle(i)) * rr] as [number, number];
      });
    }

    function hoverDatumOf(dog: RadarDog, dogIndex: number): RadarHoverDatum {
      return {
        dogIndex,
        dogName: dog.name,
        dimensions: axes.map((axis) => ({
          axisKey: axis.key,
          axisLabel: axis.label,
          value: clamp((dog as Record<RadarKey, number>)[axis.key], minV, maxV),
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
      .on("pointerenter", (event, d) => handlers.onHover?.(hoverDatumOf(d.dog, d.dogIndex), event as PointerEvent))
      .on("pointermove", (event, d) => handlers.onMove?.(hoverDatumOf(d.dog, d.dogIndex), event as PointerEvent))
      .on("pointerleave", (event) => handlers.onLeave?.(event as PointerEvent))
      .on("click", (event, d) => handlers.onClick?.(d.dogIndex, event as PointerEvent));

    groups
      .selectAll("circle.pt")
      .data((dog, dogIndex) =>
        axes.map((axis, i) => {
          const value = clamp((dog as Record<RadarKey, number>)[axis.key], minV, maxV);
          const rr = scaleR(value);
          return {
            p: [Math.cos(angle(i)) * rr, Math.sin(angle(i)) * rr] as [number, number],
            dogIndex,
          };
        }),
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
      .on("click", (event, d) => handlers.onClick?.(d.dogIndex, event as PointerEvent));

    const focus = opt.focusIndex ?? null;
    const hasFocus = focus !== null && focus >= 0 && focus < dogs.length;

    if (!hasFocus) {
      groups.attr("opacity", 1);
      groups.selectAll<SVGPathElement, { dog: RadarDog; dogIndex: number }>("path.area")
        .attr("fill-opacity", 0.22)
        .attr("stroke-opacity", 1);
      groups.selectAll<SVGCircleElement, { dogIndex: number }>("circle.pt").attr("opacity", 0.95);
      return;
    }

    groups.attr("opacity", (_d, gi) => (gi === focus ? 1 : 0.65));
    groups.selectAll<SVGPathElement, { dog: RadarDog; dogIndex: number }>("path.area")
      .attr("fill-opacity", (d) => (d.dogIndex === focus ? 0.28 : 0.14))
      .attr("stroke-opacity", (d) => (d.dogIndex === focus ? 1 : 0.6));
    groups.selectAll<SVGCircleElement, { dogIndex: number }>("circle.pt")
      .attr("opacity", (d) => (d.dogIndex === focus ? 0.95 : 0.35));
    groups.filter((_d, gi) => gi === focus).raise();
  }

  function destroy() {
    svg.selectAll("*").remove();
  }

  return { update, destroy };
}
