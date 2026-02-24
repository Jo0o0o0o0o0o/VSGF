<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick, computed } from "vue";
import { createRadarChart } from "@/d3Viz/createRadarChart";
import type { RadarDog, RadarKey, RadarHoverDatum } from "@/d3Viz/createRadarChart";
import { RADAR_COLORS } from "@/d3Viz/createRadarChart";

const props = defineProps<{
  dogs: RadarDog[];
  axes: { key: RadarKey; label: string }[];
  focusIndex?: number | null;
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

function legendColor(idx: number) {
  return RADAR_COLORS[idx % RADAR_COLORS.length] ?? "#f59e0b";
}

function lightenColorKeepAlpha(color: string, factor = 0.75) {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const lighten = (v: number) => clamp(v + (255 - v) * factor);

  if (/^#([\da-f]{3}|[\da-f]{6})$/i.test(color)) {
    const hex = color.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${lighten(r)}, ${lighten(g)}, ${lighten(b)}, 1)`;
  }

  const match = color.match(/^rgba?\(([^)]+)\)$/i);
  const channelList = match?.[1];
  if (channelList) {
    const parts = channelList.split(",").map((p) => p.trim());
    const r = Number(parts[0]);
    const g = Number(parts[1]);
    const b = Number(parts[2]);
    const a = parts[3] !== undefined ? Number(parts[3]) : 1;

    if ([r, g, b, a].every((v) => Number.isFinite(v))) {
      return `rgba(${lighten(r)}, ${lighten(g)}, ${lighten(b)}, ${a})`;
    }
  }

  return color;
}

const tooltipStyle = computed(() => {
  const dogIndex = hovered.value?.dogIndex;
  if (dogIndex === null || dogIndex === undefined) {
    return {
      left: `${tip.value.x}px`,
      top: `${tip.value.y}px`,
    };
  }

  return {
    left: `${tip.value.x}px`,
    top: `${tip.value.y}px`,
    backgroundColor: lightenColorKeepAlpha(legendColor(dogIndex)),
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
    min: 0,
    max: 10,
    levels: 10,
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
  background: rgba(255, 255, 255, 0.95);
  color: #111827;
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
}
.tRow {
  opacity: 0.92;
}
.legend {
  position: absolute;
  right: 12px;
  bottom: 12px;
  background: rgba(255, 248, 220, 0.95);
  border: 1px solid rgba(198, 142, 0, 0.35);
  border-radius: 12px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 45%;
  pointer-events: auto;
  backdrop-filter: blur(6px);
  box-shadow: 0 2px 12px rgba(198, 142, 0, 0.12);
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
  background: rgba(230, 168, 0, 0.12);
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
  box-shadow: 0 0 0 1px rgba(92, 66, 16, 0.15);
}

.label {
  font-size: 12px;
  font-weight: 600;
  color: rgba(72, 52, 12, 0.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
