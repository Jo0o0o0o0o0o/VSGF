<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RADAR_COLORS, type AxisItem, type RadarDog } from "@/d3Viz/createRadarChart";
import {
  createStackedBar,
  type StackedBarSegment,
} from "@/d3Viz/createstackedbar";

const props = defineProps<{
  dogs: RadarDog[];
  axes: AxisItem[];
  focusIndex?: number | null;
}>();

const emit = defineEmits<{
  (e: "toggleFocus", index: number): void;
}>();

const wrapRef = ref<HTMLDivElement | null>(null);
const areaRef = ref<HTMLDivElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const hovered = ref<StackedBarSegment | null>(null);
const tip = ref({ x: 0, y: 0, show: false });

let chart: ReturnType<typeof createStackedBar> | null = null;
let ro: ResizeObserver | null = null;

function legendColor(idx: number) {
  return RADAR_COLORS[idx % RADAR_COLORS.length] ?? "#f59e0b";
}

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
  const width = Math.max(10, rect.width);
  const height = Math.max(10, rect.height);
  chart.update(props.dogs, {
    width,
    height,
    axes: props.axes,
    focusIndex: props.focusIndex ?? null,
  });
}

onMounted(() => {
  chart = createStackedBar(svgRef.value!, {
    onHover: (segment, ev) => {
      hovered.value = segment;
      tip.value.show = true;
      setTipFromEvent(ev);
    },
    onMove: (segment, ev) => {
      hovered.value = segment;
      setTipFromEvent(ev);
    },
    onLeave: () => {
      hovered.value = null;
      tip.value.show = false;
    },
    onClick: (dogIndex) => emit("toggleFocus", dogIndex),
  });

  resizeAndDraw();

  ro = new ResizeObserver(() => requestAnimationFrame(resizeAndDraw));
  if (areaRef.value) ro.observe(areaRef.value);
  window.addEventListener("resize", resizeAndDraw);
});

watch(
  () => [props.dogs, props.axes, props.focusIndex],
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
        <div class="title">{{ hovered.dogName }}</div>
        <div>{{ hovered.axisLabel }}: {{ hovered.value }}</div>
        <div>Total: {{ hovered.total }}</div>
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
          type="button"
          @click="emit('toggleFocus', idx)"
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

.legend {
  position: absolute;
  right: 10px;
  top: 10px;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 10px;
  border: 1px solid #d1d5db;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 45%;
}

.legendRow {
  all: unset;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 3px 4px;
  border-radius: 6px;
}

.legendRow:hover {
  background: rgba(0, 0, 0, 0.06);
}

.legendRow.dim {
  opacity: 0.42;
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  flex: 0 0 auto;
}

.label {
  font-size: 12px;
  font-weight: 600;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
