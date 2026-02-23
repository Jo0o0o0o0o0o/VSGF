<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import { createScatterPlot } from "@/d3Viz/createScatterPlot";
import type { ScatterDatum } from "@/types/viz";
import type { TraitKey } from "@/utils/traitFilter";
import { TRAIT_KEYS, traitLabels } from "@/utils/traitFilter";

const props = defineProps<{
  data: ScatterDatum[];
  highlightId?: string | null;
  // controls state from parent
  filterEnabled: boolean;
  breedGroupFilterEnabled: boolean;
  traitEnabled: Record<TraitKey, boolean>;
  hasSelectedDog: boolean;

  // counts
  filteredCount: number;
  totalCount: number;
}>();

const emit = defineEmits<{
  (e: "update:filterEnabled", v: boolean): void;
  (e: "update:breedGroupFilterEnabled", v: boolean): void;
  (e: "toggleTrait", k: TraitKey, v: boolean): void;
  (e: "selectDog", id: string | number): void;
}>();

const svgRef = ref<SVGSVGElement | null>(null);
let chart: ReturnType<typeof createScatterPlot> | null = null;

const hovered = ref<ScatterDatum | null>(null);
const tip = ref({ x: 0, y: 0, show: false });

function setTipFromEvent(ev: PointerEvent) {
  const chartArea = chartAreaRef.value;
  if (!chartArea) return;
  const r = chartArea.getBoundingClientRect();
  tip.value.x = ev.clientX - r.left + 8;
  tip.value.y = ev.clientY - r.top + 8;
}

function resizeAndDraw() {
  if (!svgRef.value || !chart) return;

  // ✅ 用 svg 的实际尺寸（flex 布局下这是“扣掉 controls 后”的剩余空间）
  const rect = svgRef.value.getBoundingClientRect();
  const w = Math.max(10, rect.width);
  const h = Math.max(10, rect.height);

  chart.update(props.data, {
    width: w,
    height: h,
    xLabel: "Height (cm)",
    yLabel: "Weight (kg)",
    highlightId: props.highlightId ?? null,
  });
}

const chartAreaRef = ref<HTMLDivElement | null>(null);
let ro: ResizeObserver | null = null;

onMounted(() => {
  chart = createScatterPlot(svgRef.value!, {
    onHover: (d, ev) => {
      hovered.value = d;
      tip.value.show = true;
      setTipFromEvent(ev);
    },
    onMove: (_d, ev) => {
      setTipFromEvent(ev);
    },
    onLeave: () => {
      tip.value.show = false;
      hovered.value = null;
    },
    onClick: (d) => {
      emit("selectDog", d.id);
    },
  });

  resizeAndDraw();

  // [ADDED] 容器尺寸变化 -> 重画
  ro = new ResizeObserver(() => {
    requestAnimationFrame(resizeAndDraw);
  });
  if (chartAreaRef.value) ro.observe(chartAreaRef.value);

  window.addEventListener("resize", resizeAndDraw);
});

watch(
  () => props.data,
  async () => {
    // ✅ 等 DOM / flex 重新分配完高度再画
    await nextTick();
    requestAnimationFrame(resizeAndDraw);
  },
  { deep: false }, // ✅ 这里不要 deep，监听引用变化更可靠
);

watch(
  () => [
    props.filterEnabled,
    props.breedGroupFilterEnabled,
    props.traitEnabled,
    props.hasSelectedDog,
  ],
  async () => {
    await nextTick();
    requestAnimationFrame(resizeAndDraw);
  },
  { deep: true },
);

watch(() => props.highlightId, resizeAndDraw);

onBeforeUnmount(() => {
  window.removeEventListener("resize", resizeAndDraw);
  ro?.disconnect();
  ro = null;
  chart?.destroy();
});

function onToggleFilter(e: Event) {
  const v = (e.target as HTMLInputElement).checked;
  emit("update:filterEnabled", v);
}

function onToggleTrait(k: TraitKey, e: Event) {
  const v = (e.target as HTMLInputElement).checked;
  emit("toggleTrait", k, v);
}

function onToggleBreedGroup(e: Event) {
  const v = (e.target as HTMLInputElement).checked;
  emit("update:breedGroupFilterEnabled", v);
}
</script>

<template>
  <!--  根容器加 ref，用于 tooltip 定位 -->
  <div class="wrap">
    <div class="filterBar">
      <div class="filterMain">
        <label class="switch" :class="{ on: filterEnabled, disabled: !hasSelectedDog }">
          <input
            type="checkbox"
            :checked="filterEnabled"
            @change="onToggleFilter"
            :disabled="!hasSelectedDog"
          />
          <span class="switchTrack">
            <span class="switchThumb"></span>
          </span>
          <span class="switchLabel">Filter traits</span>
        </label>

        <div class="count">
          Showing
          <span class="countStrong">{{ filteredCount }}</span>
          /
          <span>{{ totalCount }}</span>
          dogs
        </div>
      </div>

      <div class="chips" :class="{ disabled: !filterEnabled || !hasSelectedDog }">
        <label class="chip">
          <input
            type="checkbox"
            :checked="breedGroupFilterEnabled"
            @change="onToggleBreedGroup"
            :disabled="!filterEnabled || !hasSelectedDog"
          />
          <span class="chipLabel">breedgroup</span>
        </label>

        <label v-for="k in TRAIT_KEYS" :key="k" class="chip">
          <input
            type="checkbox"
            :checked="traitEnabled[k]"
            @change="onToggleTrait(k, $event)"
            :disabled="!filterEnabled || !hasSelectedDog"
          />
          <span class="chipLabel">{{ traitLabels[k] }}</span>
        </label>
      </div>
    </div>

    <!--  chartArea：svg + tooltip 必须放这里，position: relative -->
    <div class="chartArea" ref="chartAreaRef">
      <svg ref="svgRef"></svg>

      <!--  tooltip：由 Vue 状态控制显示和内容 -->
      <div
        v-if="tip.show && hovered"
        class="tooltip"
        :style="{ left: tip.x + 'px', top: tip.y + 'px' }"
      >
        <div class="tTitle">{{ hovered.label ?? hovered.id }}</div>
        <div class="tRow">Breed-Group: {{ hovered.breedGroup ?? "-" }}</div>
        <div class="tRow">Max-Life: {{ hovered.size ?? "-" }}</div>
        <div class="tRow">Max-Height: {{ hovered.x }}</div>
        <div class="tRow">Max-Weight: {{ hovered.y }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.chartArea {
  position: relative;
  flex: 1;
  min-height: 0;
}
.tooltip {
  position: absolute;
  pointer-events: none;
  background: rgba(235, 235, 235, 0.92);
  color: #000000;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.25;
  max-width: 220px;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.25);
}
.tTitle {
  font-weight: 700;
  margin-bottom: 6px;
}
.tRow {
  opacity: 0.95;
}
.filterBar {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.filterMain {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.filterBar input[type="checkbox"] {
  accent-color: #facc15;
}

.switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}

.switch input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: inherit;
}

.switchTrack {
  position: relative;
  width: 40px;
  height: 22px;
  border-radius: 999px;
  background: #e5e7eb;
  transition: background 0.16s ease;
}

.switchThumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.25);
  transition: transform 0.16s ease;
}

.switch.on .switchTrack {
  background: #facc15;
}

.switch.on .switchThumb {
  transform: translateX(18px);
}

.switch.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.switchLabel {
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.8;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chips.disabled {
  opacity: 0.45;
  pointer-events: none;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  font-size: 11px;
  background-color: #ffffff94;
  cursor: pointer;
  transition:
    border-color 0.14s ease,
    background 0.14s ease,
    color 0.14s ease;
}

.chip input {
  margin: 0;
  transform: translateY(1px);
}

.chipLabel {
  white-space: nowrap;
}

.chip:hover {
  border-color: rgba(250, 204, 21, 0.95);
  background: rgba(250, 204, 21, 0.10);
}

.count {
  margin-left: auto;
  font-size: 12px;
  opacity: 0.75;
  display: flex;
  align-items: center;
  gap: 4px;
}

.countStrong {
  font-weight: 600;
}

svg {
  width: 100%;
  height: 100%;
  min-height: 200px;
  display: block;
}
</style>
