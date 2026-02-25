<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createHeatedMap, type HeatedCell } from "@/d3Viz/createHeatedMap";
import type { IvisRatingKey, IvisRecord } from "@/types/ivis23";

const props = defineProps<{
  records: IvisRecord[];
  ratingKeys: readonly IvisRatingKey[];
}>();
const emit = defineEmits<{
  (e: "selectRow", rowId: number): void;
}>();

const wrapRef = ref<HTMLDivElement | null>(null);
const areaRef = ref<HTMLDivElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);

const hovered = ref<HeatedCell | null>(null);
const tip = ref({ x: 0, y: 0, show: false });

let chart: ReturnType<typeof createHeatedMap> | null = null;
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
  const width = Math.max(10, rect.width);
  const height = Math.max(10, rect.height);
  chart.update(props.records, { width, height, ratingKeys: props.ratingKeys });
}

onMounted(() => {
  chart = createHeatedMap(svgRef.value!, {
    onHover: (cell, ev) => {
      hovered.value = cell;
      tip.value.show = true;
      setTipFromEvent(ev);
    },
    onMove: (cell, ev) => {
      hovered.value = cell;
      setTipFromEvent(ev);
    },
    onLeave: () => {
      hovered.value = null;
      tip.value.show = false;
    },
    onClick: (cell) => {
      emit("selectRow", cell.rowId);
    },
  });

  resizeAndDraw();

  ro = new ResizeObserver(() => requestAnimationFrame(resizeAndDraw));
  if (areaRef.value) ro.observe(areaRef.value);
  window.addEventListener("resize", resizeAndDraw);
});

watch(
  () => [props.records, props.ratingKeys],
  async () => {
    await nextTick();
    requestAnimationFrame(resizeAndDraw);
  },
  { deep: true },
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
        <div class="title">{{ hovered.rowLabel }}</div>
        <div>{{ hovered.ratingKey.replace(/_/g, " ") }}: {{ hovered.value }}</div>
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
