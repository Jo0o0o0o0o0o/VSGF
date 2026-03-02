<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick, computed } from "vue";
import { createRadarChart } from "@/d3Viz/createRadarChart";
import type { RadarDog, RadarKey, RadarHoverDatum } from "@/d3Viz/createRadarChart";
import { RADAR_COLORS } from "@/d3Viz/createRadarChart";

const props = defineProps<{
  dogs: RadarDog[];
  axes: { key: RadarKey; label: string }[];
  focusIndex?: number | null;
  min?: number;
  max?: number;
  levels?: number;
}>();
const emit = defineEmits<{
  (e: "toggleFocus", index: number): void;
}>();

const svgRef = ref<SVGSVGElement | null>(null);
const chartAreaRef = ref<HTMLDivElement | null>(null);
const hovered = ref<RadarHoverDatum | null>(null);
const tip = ref({ x: 0, y: 0, show: false });

let chart: ReturnType<typeof createRadarChart> | null = null;
let ro: ResizeObserver | null = null;

const dogs = computed(() => props.dogs ?? []);
const AVERAGE_RADAR_COLOR = "#6b7280";

function legendColor(idx: number) {
  const name = dogs.value[idx]?.name?.trim().toLowerCase();
  if (name === "average") return AVERAGE_RADAR_COLOR;
  return RADAR_COLORS[idx % RADAR_COLORS.length] ?? "#f59e0b";
}

const tooltipStyle = computed(() => {
  return {
    left: `${tip.value.x}px`,
    top: `${tip.value.y}px`,
    backgroundColor: "rgba(239, 246, 255, 0.96)",
  };
});

function setTipFromEvent(ev: PointerEvent) {
  const chartArea = chartAreaRef.value;
  if (!chartArea) return;
  const r = chartArea.getBoundingClientRect();
  tip.value.x = ev.clientX - r.left + 8;
  tip.value.y = ev.clientY - r.top + 8;
}

function resizeAndDraw() {
  if (!svgRef.value || !chart || !chartAreaRef.value) {
    console.warn("[RadarChart] resize skipped", {
      svg: !!svgRef.value,
      chart: !!chart,
      area: !!chartAreaRef.value,
    });
    return;
  }

  const rect = chartAreaRef.value.getBoundingClientRect();
  const w = Math.max(10, rect.width);
  const h = Math.max(10, rect.height);

  console.log("[RadarChart] draw", {
    w,
    h,
    dogs: props.dogs?.length,
    focus: props.focusIndex,
  });

  chart.update(props.dogs ?? [], {
    width: w,
    height: h,
    min: props.min ?? 0,
    max: props.max ?? 10,
    levels: props.levels ?? 10,
    axes: props.axes,
    focusIndex: props.focusIndex ?? null,
  });
}

onMounted(() => {
  chart = createRadarChart(svgRef.value!, {
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
      tip.value.show = false;
      hovered.value = null;
    },
    onClick: (dogIndex) => {
      emit("toggleFocus", dogIndex);
    },
  });
  resizeAndDraw();

  ro = new ResizeObserver(() => requestAnimationFrame(resizeAndDraw));
  if (chartAreaRef.value) ro.observe(chartAreaRef.value);

  window.addEventListener("resize", resizeAndDraw);
});

watch(
  [() => props.dogs, () => props.axes, () => props.focusIndex],
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
  tip.value.show = false;
  hovered.value = null;
});
</script>

<template>
  <div class="wrap">
    <div class="chartArea" ref="chartAreaRef">
      <svg ref="svgRef"></svg>
      <div
        v-if="tip.show && hovered"
        class="tooltip"
        :style="tooltipStyle"
      >
        <div class="tTitle">{{ hovered.dogName }}</div>
        <div v-for="item in hovered.dimensions" :key="item.axisKey" class="tRow">
          {{ item.axisLabel }}: {{ item.value }}
        </div>
      </div>
      <div class="legend" v-if="dogs.length">
        <button
          v-for="(d, idx) in dogs"
          :key="d.name"
          class="legendRow"
          :class="{
            dim:
              props.focusIndex !== null &&
              props.focusIndex !== undefined &&
              props.focusIndex !== idx,
          }"
          @click="emit('toggleFocus', idx)"
          type="button"
        >
          <span class="dot" :style="{ backgroundColor: legendColor(idx) }"></span>
          <span class="label">{{ d.name }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  height: 100%;
  width: 100%;
  display: flex;
}
.chartArea {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 420px;

  border-radius: 14px;
}
svg {
  width: 100%;
  height: 100%;
  display: block;
}
.tooltip {
  position: absolute;
  pointer-events: none;
  background: rgba(239, 246, 255, 0.96);
  color: #0f172a;
  border: 1px solid rgba(147, 197, 253, 0.7);
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.25;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.18);
  z-index: 30;
}
.tTitle {
  font-weight: 700;
  margin-bottom: 4px;
  color: #1d4ed8;
}
.tRow {
  opacity: 0.92;
}
.legend {
  position: absolute;
  right: 12px;
  bottom: 12px;
  background: rgba(239, 246, 255, 0.96);
  border: 1px solid rgba(147, 197, 253, 0.78);
  border-radius: 12px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 45%;
  pointer-events: auto;
  backdrop-filter: blur(6px);
  box-shadow: 0 2px 12px rgba(59, 130, 246, 0.14);
}

.legendRow {
  all: unset;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 8px;
  transition:
    background-color 0.2s ease,
    opacity 0.2s ease;
}

.legendRow:hover {
  background: rgba(59, 130, 246, 0.12);
}

.legendRow.dim {
  opacity: 0.4;
}

.legendRow.dim:hover {
  opacity: 0.7;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  flex: 0 0 auto;
  box-shadow: 0 0 0 1px rgba(30, 64, 175, 0.16);
}

.label {
  font-size: 12px;
  font-weight: 600;
  color: rgba(30, 58, 138, 0.92);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
