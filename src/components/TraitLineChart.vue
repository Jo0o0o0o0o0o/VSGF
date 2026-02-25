<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import * as d3 from "d3";
import ivisData from "@/data/IVIS23_final.json";
import {
  IVIS_RATING_KEYS,
  type IvisRatingKey,
  type IvisRecord,
} from "@/types/ivis23";

defineProps<{
  dog?: unknown;
  avgTraits?: unknown;
}>();

type LinePoint = {
  key: IvisRatingKey;
  value: number;
};

type LineSeries = {
  id: number;
  alias: string;
  values: LinePoint[];
};

const svgRef = ref<SVGSVGElement | null>(null);
let ro: ResizeObserver | null = null;

const dataset = ivisData as IvisRecord[];

const fieldLabel = (key: IvisRatingKey) =>
  key
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");

function toSeries(data: IvisRecord[]): LineSeries[] {
  return data.map((row) => ({
    id: row.id,
    alias: row.alias,
    values: IVIS_RATING_KEYS.map((key) => ({
      key,
      value: Number(row.ratings[key]),
    })),
  }));
}

function draw() {
  if (!svgRef.value) return;

  const host = svgRef.value.parentElement;
  if (!host) return;

  const rect = host.getBoundingClientRect();
  const width = Math.max(640, Math.floor(rect.width));
  const height = Math.max(260, Math.floor(rect.height));

  const margin = { top: 42, right: 16, bottom: 80, left: 46 };
  const innerW = Math.max(10, width - margin.left - margin.right);
  const innerH = Math.max(10, height - margin.top - margin.bottom);

  const svg = d3
    .select(svgRef.value)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "none");

  svg.selectAll("*").remove();

  const root = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const allSeries = toSeries(dataset);

  const x = d3
    .scalePoint<IvisRatingKey>()
    .domain([...IVIS_RATING_KEYS])
    .range([0, innerW])
    .padding(0.2);

  const y = d3.scaleLinear().domain([0, 10]).nice().range([innerH, 0]);

  const line = d3
    .line<LinePoint>()
    .x((d) => x(d.key) ?? 0)
    .y((d) => y(d.value))
    .defined((d) => Number.isFinite(d.value));

  const avgSeries: LinePoint[] = IVIS_RATING_KEYS.map((key) => {
    const values = allSeries
      .map((s) => s.values.find((v) => v.key === key)?.value)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

    const avg = values.length ? d3.mean(values)! : NaN;
    return { key, value: avg };
  });

  root
    .append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x))
    .call((g) => g.select(".domain").attr("stroke", "#94a3b8"))
    .call((g) =>
      g
        .selectAll<SVGTextElement, IvisRatingKey>("text")
        .text((d) => fieldLabel(d))
        .attr("font-size", 10)
        .attr("fill", "#475569")
        .attr("text-anchor", "end")
        .attr("transform", "rotate(-23)")
        .attr("dx", "-0.5em")
        .attr("dy", "0.25em"),
    )
    .call((g) => g.selectAll("line").attr("stroke", "#cbd5e1"));

  root
    .append("g")
    .call(d3.axisLeft(y).ticks(11))
    .call((g) => g.select(".domain").attr("stroke", "#94a3b8"))
    .call((g) => g.selectAll("line").attr("stroke", "#e2e8f0"))
    .call((g) => g.selectAll("text").attr("fill", "#475569").attr("font-size", 10));

  root
    .append("g")
    .selectAll("path.student-line")
    .data(allSeries)
    .join("path")
    .attr("class", "student-line")
    .attr("fill", "none")
    .attr("stroke", (_, i) => d3.interpolateSinebow(i / Math.max(1, allSeries.length - 1)))
    .attr("stroke-width", 1.2)
    .attr("stroke-opacity", 0.22)
    .attr("d", (d) => line(d.values) ?? "");

  root
    .append("path")
    .datum(avgSeries)
    .attr("fill", "none")
    .attr("stroke", "#f97316")
    .attr("stroke-width", 2.8)
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round")
    .attr("d", (d) => line(d) ?? "");

  root
    .append("text")
    .attr("x", innerW)
    .attr("y", -20)
    .attr("text-anchor", "end")
    .attr("fill", "#475569")
    .style("font-size", "10px")
    .text(`students: ${allSeries.length}`);
}

onMounted(() => {
  draw();
  if (svgRef.value?.parentElement) {
    ro = new ResizeObserver(() => draw());
    ro.observe(svgRef.value.parentElement);
  }
});

onBeforeUnmount(() => {
  ro?.disconnect();
  ro = null;
});
</script>

<template>
  <svg ref="svgRef"></svg>
</template>

<style scoped>
svg {
  width: 100%;
  height: 100%;
  min-height: 260px;
}
</style>
