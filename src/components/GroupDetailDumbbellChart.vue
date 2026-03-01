<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { AxisItem } from "@/d3Viz/createRadarChart";
import {
  createGroupDetailDumbbellChart,
  type GroupDetailDumbbellDatum,
} from "@/d3Viz/createGroupDetailDumbbellChart";

const props = defineProps<{
  data: GroupDetailDumbbellDatum[];
  axes: AxisItem[];
  focusIndex?: number | null;
}>();

const emit = defineEmits<{
  (e: "toggleFocus", index: number): void;
}>();

const wrapRef = ref<HTMLDivElement | null>(null);
const areaRef = ref<HTMLDivElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const hovered = ref<GroupDetailDumbbellDatum | null>(null);
const tip = ref({ x: 0, y: 0, show: false });

let chart: ReturnType<typeof createGroupDetailDumbbellChart> | null = null;
let ro: ResizeObserver | null = null;

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
  chart.update(props.data, props.axes, {
    width: Math.max(10, rect.width),
    height: Math.max(10, rect.height),
    focusIndex: props.focusIndex ?? null,
  });
}

onMounted(() => {
  chart = createGroupDetailDumbbellChart(svgRef.value!, {
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
    onClick: (groupIndex) => emit("toggleFocus", groupIndex),
  });

  resizeAndDraw();
  ro = new ResizeObserver(() => requestAnimationFrame(resizeAndDraw));
  if (areaRef.value) ro.observe(areaRef.value);
  window.addEventListener("resize", resizeAndDraw);
});

watch(
  () => [props.data, props.axes, props.focusIndex],
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
  <div ref="wrapRef" class="wrap">
    <div ref="areaRef" class="chartArea">
      <svg ref="svgRef"></svg>
      <div
        v-if="tip.show && hovered"
        class="tooltip"
        :style="{ left: `${tip.x}px`, top: `${tip.y}px` }"
      >
        <div class="title">{{ hovered.groupName }}</div>
        <div>{{ hovered.axisLabel }}</div>
        <div>Min: {{ hovered.minValue.toFixed(2).replace(/\.00$/, "") }}</div>
        <div>Max: {{ hovered.maxValue.toFixed(2).replace(/\.00$/, "") }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  height: 100%;
  width: 100%;
}

.chartArea {
  position: relative;
  height: 100%;
  width: 100%;
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
  max-width: 280px;
}

.title {
  font-weight: 700;
  margin-bottom: 4px;
}
</style>
