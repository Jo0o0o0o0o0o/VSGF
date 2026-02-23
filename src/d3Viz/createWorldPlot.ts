import * as d3 from "d3";

export type WorldPoint = {
  id: string;
  lon: number;
  lat: number;
  label?: string;
  subtitle?: string;
  countryCode?: string;
  dogName?: string;
};

type AggregatedWorldPoint = {
  id: string;
  lon: number;
  lat: number;
  label: string;
  subtitle: string;
  countryCode?: string;
  dogIds: string[];
  dogNames: string[];
  count: number;
};

export type CreateWorldPlotOptions = {
  width: number;
  height: number;
  worldGeoJsonUrl?: string;
  pointColor?: string;
  activeCountryCode?: string | null;
  onHover?: (d: WorldPoint, ev: MouseEvent) => void;
  onMove?: (d: WorldPoint, ev: MouseEvent) => void;
  onLeave?: () => void;
  onClick?: (d: WorldPoint, ev: MouseEvent) => void;
  highlightId?: string | null;
};

export type WorldPlotApi = {
  update: (points: WorldPoint[]) => void;
  setHighlight: (id: string | null) => void;
  setPointColor: (color: string) => void;
  setActiveCountry: (countryCode: string | null) => void;
  resize: (w: number, h: number) => void;
  destroy: () => void;
};

export function createWorldPlot(
  container: HTMLElement,
  opt: CreateWorldPlotOptions,
): WorldPlotApi {
  const worldUrl = opt.worldGeoJsonUrl ?? "/world.geojson";

  let width = opt.width;
  let height = opt.height;

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`);

  const gRoot = svg.append("g");
  const gLand = gRoot.append("g");
  const gPts = gRoot.append("g");

  const projection = d3.geoNaturalEarth1();
  const path = d3.geoPath(projection);

  let points: WorldPoint[] = [];
  let aggregatedPoints: AggregatedWorldPoint[] = [];
  let highlightId: string | null = opt.highlightId ?? null;
  let pointColor = opt.pointColor ?? "#f97316";
  let activeCountryCode: string | null = opt.activeCountryCode?.toUpperCase() ?? null;

  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([1, 7])
    .on("zoom", (event) => {
      gRoot.attr("transform", event.transform);
    });

  svg.call(zoom as any);

  function getBaseRadius(d: AggregatedWorldPoint): number {
    return 3.2 + Math.sqrt(d.count) * 1.7;
  }

  function applyHighlight(
    sel: d3.Selection<SVGCircleElement, AggregatedWorldPoint, SVGGElement, unknown>,
  ) {
    sel
      .attr("r", (d) => {
        const isCountryActive =
          !!activeCountryCode && (d.countryCode ?? "").toUpperCase() === activeCountryCode;
        const isDogActive = !!highlightId && d.dogIds.includes(highlightId);
        if (isDogActive) return getBaseRadius(d) + 1.8;
        if (isCountryActive) return getBaseRadius(d) + 1.8;
        return getBaseRadius(d);
      })
      .attr("fill", (d) => {
        const isCountryActive =
          !!activeCountryCode && (d.countryCode ?? "").toUpperCase() === activeCountryCode;
        const isDogActive = !!highlightId && d.dogIds.includes(highlightId);
        if (isDogActive) return "#facc15";
        if (isCountryActive) return pointColor;
        return pointColor;
      })
      .attr("opacity", (d) => {
        const isCountryActive =
          !!activeCountryCode && (d.countryCode ?? "").toUpperCase() === activeCountryCode;
        const isDogActive = !!highlightId && d.dogIds.includes(highlightId);
        if (isDogActive) return 1;
        if (isCountryActive) return 1;
        return 0.55;
      });
  }

  function aggregateByCountry(rawPoints: WorldPoint[]): AggregatedWorldPoint[] {
    const byCountry = new Map<string, AggregatedWorldPoint>();

    for (const p of rawPoints) {
      const cc = p.countryCode?.trim().toUpperCase();
      const key = cc || `${p.lon.toFixed(3)}:${p.lat.toFixed(3)}`;
      const existing = byCountry.get(key);

      if (!existing) {
        byCountry.set(key, {
          id: key,
          lon: p.lon,
          lat: p.lat,
          label: cc || p.label || key,
          subtitle: "",
          countryCode: cc,
          dogIds: [p.id],
          dogNames: [p.dogName || p.label || p.id],
          count: 1,
        });
        continue;
      }

      existing.dogIds.push(p.id);
      existing.dogNames.push(p.dogName || p.label || p.id);
      existing.count += 1;
    }

    for (const item of byCountry.values()) {
      item.subtitle = item.dogNames.join(", ");
    }

    return Array.from(byCountry.values());
  }

  function toWorldPointPayload(d: AggregatedWorldPoint): WorldPoint {
    return {
      id: d.dogIds[0] ?? d.id,
      lon: d.lon,
      lat: d.lat,
      label: d.label,
      subtitle: d.subtitle,
      countryCode: d.countryCode,
      dogName: d.dogNames[0],
    };
  }

  function drawPoints() {
    const sel = gPts
      .selectAll<SVGCircleElement, AggregatedWorldPoint>("circle")
      .data(aggregatedPoints, (d: any) => d.id)
      .join(
        (enter) =>
          enter
            .append("circle")
            .attr("r", 3.2)
            .attr("fill", pointColor)
            .attr("opacity", 0.55),
        (update) => update,
        (exit) => exit.remove(),
      )
      .attr("cx", (d) => projection([d.lon, d.lat])?.[0] ?? -999)
      .attr("cy", (d) => projection([d.lon, d.lat])?.[1] ?? -999);

    applyHighlight(sel);

    sel.on("mouseenter", (ev, d) => opt.onHover?.(toWorldPointPayload(d), ev as any));
    sel.on("mousemove", (ev, d) => opt.onMove?.(toWorldPointPayload(d), ev as any));
    sel.on("mouseleave", () => opt.onLeave?.());
    sel.on("click", (ev, d) => opt.onClick?.(toWorldPointPayload(d), ev as any));
  }

  async function drawWorldIfNeeded() {
    const geo: any = await d3.json(worldUrl);
    if (!geo) return;

    projection.fitSize([width, height], geo);

    gLand
      .selectAll("path")
      .data(geo.features ?? [])
      .join("path")
      .attr("d", path as any)
      .attr("fill", "#f3f4f6")
      .attr("stroke", "#cbd5e1")
      .attr("stroke-width", 0.6);

    drawPoints();
  }

  void drawWorldIfNeeded();

  function update(next: WorldPoint[]) {
    points = next;
    aggregatedPoints = aggregateByCountry(points);
    drawPoints();
  }

  function setHighlight(id: string | null) {
    highlightId = id;
    const sel = gPts.selectAll<SVGCircleElement, AggregatedWorldPoint>("circle");
    applyHighlight(sel);
  }

  function setPointColor(color: string) {
    pointColor = color || "#f97316";
    const sel = gPts.selectAll<SVGCircleElement, AggregatedWorldPoint>("circle");
    applyHighlight(sel);
  }

  function setActiveCountry(countryCode: string | null) {
    activeCountryCode = countryCode?.toUpperCase() ?? null;
    const sel = gPts.selectAll<SVGCircleElement, AggregatedWorldPoint>("circle");
    applyHighlight(sel);
  }

  function resize(w: number, h: number) {
    width = Math.max(10, w);
    height = Math.max(10, h);

    svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
    void drawWorldIfNeeded();
  }

  function destroy() {
    svg.remove();
  }

  return { update, setHighlight, setPointColor, setActiveCountry, resize, destroy };
}
