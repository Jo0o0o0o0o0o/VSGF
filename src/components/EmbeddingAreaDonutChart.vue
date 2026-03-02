<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  createEmbeddingAreaDonutChart,
} from "@/d3Viz/createEmbeddingAreaDonutChart";
import type { EmbeddingAreaDatum } from "@/d3Viz/createEmbeddingAreaBarChart";

const props = withDefaults(
  defineProps<{
    data: EmbeddingAreaDatum[];
    showLegend?: boolean;
    colorByKey?: Record<string, string>;
  }>(),
  {
    showLegend: true,
    colorByKey: undefined,
  },
);

const wrapRef = ref<HTMLDivElement | null>(null);
const areaRef = ref<HTMLDivElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const tip = ref({ x: 0, y: 0, show: false });
const hovered = ref<EmbeddingAreaDatum | null>(null);

let chart: ReturnType<typeof createEmbeddingAreaDonutChart> | null = null;
let ro: ResizeObserver | null = null;
const DONUT_COLORS = [
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#f97316",
  "#a78bfa",
  "#14b8a6",
  "#ef4444",
  "#3b82f6",
  "#84cc16",
  "#ec4899",
];

const rankedData = computed(() =>
  props.data
    .filter((row) => Number.isFinite(row.score) && row.score > 0)
    .slice()
    .sort((a, b) => b.score - a.score),
);

const localColorByKey = computed<Record<string, string>>(() =>
  Object.fromEntries(
    rankedData.value.map((row, idx) => [row.areaKey, DONUT_COLORS[idx % DONUT_COLORS.length] ?? "#0ea5e9"]),
  ),
);
const mergedColorByKey = computed<Record<string, string>>(() => ({
  ...localColorByKey.value,
  ...(props.colorByKey ?? {}),
}));

function setTipFromEvent(ev: PointerEvent) {
  const host = wrapRef.value;
  if (!host) return;
  const rect = host.getBoundingClientRect();
  tip.value.x = ev.clientX - rect.left + 12;
  tip.value.y = ev.clientY - rect.top + 12;
}

function resizeAndDraw() {
  if (!chart || !areaRef.value) return;
  const rect = areaRef.value.getBoundingClientRect();
  chart.update(props.data, {
    width: Math.max(10, rect.width),
    height: Math.max(10, rect.height),
    colorByKey: mergedColorByKey.value,
  });
}

onMounted(() => {
  chart = createEmbeddingAreaDonutChart(svgRef.value!, {
    onHover: (d, ev) => {
      hovered.value = d;
      tip.value.show = true;
      setTipFromEvent(ev);
    },
    onMove: (d, ev) => {
      hovered.value = d;
      setTipFromEvent(ev);
    },
    onLeave: () => {
      hovered.value = null;
      tip.value.show = false;
    },
  });

  resizeAndDraw();
  ro = new ResizeObserver(() => requestAnimationFrame(resizeAndDraw));
  if (areaRef.value) ro.observe(areaRef.value);
  window.addEventListener("resize", resizeAndDraw);
});

watch(
  () => props.data,
  async () => {
    await nextTick();
    requestAnimationFrame(resizeAndDraw);
  },
  { deep: false },
);

onBeforeUnmount(() => {
  window.removeEventListener("resize", resizeAndDraw);
  ro?.disconnect();
  ro = null;
  chart?.destroy();
});
</script>

<template>
  <div ref="wrapRef" class="wrap" :class="{ noLegend: !props.showLegend }">
    <div ref="areaRef" class="chartArea">
      <svg ref="svgRef"></svg>
      <div
        v-if="tip.show && hovered"
        class="tooltip"
        :style="{ left: `${tip.x}px`, top: `${tip.y}px` }"
      >
        <div class="title">{{ hovered.areaLabel }}</div>
        <div>score: {{ hovered.score.toFixed(1) }}</div>
      </div>
    </div>
    <div v-if="props.showLegend" class="topTipLegend">
      <div class="topTipTitle">Color = Dimension</div>
      <div v-if="rankedData.length" class="topTipList">
        <div v-for="row in rankedData" :key="row.areaKey" class="topTipItem">
          <span class="topTipDot" :style="{ background: mergedColorByKey[row.areaKey] }"></span>
          <span class="topTipText">{{ row.areaLabel }}</span>
        </div>
      </div>
      <div v-else class="topTipEmpty">No embedding dimensions.</div>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  height: 100%;
  width: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 12px;
}

.chartArea {
  position: relative;
  height: 100%;
  width: min(68%, 360px);
  min-width: 220px;
}

.wrap.noLegend .chartArea {
  width: 100%;
  min-width: 0;
}

svg {
  width: 100%;
  height: 100%;
  display: block;
}

.tooltip {
  position: absolute;
  pointer-events: none;
  background: rgba(15, 23, 42, 0.95);
  color: #f8fafc;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.25;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
  max-width: 240px;
}

.title {
  font-weight: 700;
  margin-bottom: 4px;
}

.topTipLegend {
  flex: 1 1 auto;
  min-width: 140px;
  padding: 6px 0;
}

.topTipTitle {
  font-size: 12px;
  font-weight: 700;
  color: #334155;
  margin-bottom: 6px;
}

.topTipList {
  display: grid;
  gap: 6px;
}

.topTipItem {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.topTipDot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.topTipText {
  font-size: 12px;
  color: #1f2937;
}

.topTipEmpty {
  font-size: 12px;
  color: #6b7280;
}

@media (max-width: 880px) {
  .wrap {
    flex-direction: column;
  }

  .chartArea {
    width: 100%;
    min-width: 0;
  }
}
</style>
