<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick, computed } from "vue";
import type { IvisRatingKey, IvisRecord } from "@/types/ivis23";
import { createBeeswarmPlot } from "@/d3Viz/createBeewarmPlot";

export type BeeswarmNode = d3.SimulationNodeDatum & {
  personId: number;
  personName: string;
  trait: IvisRatingKey;
  value: number;
  x?: number;
  y?: number;
};

const props = defineProps<{
  records: IvisRecord[];
  traits: readonly IvisRatingKey[];
  traitLabels: Record<string, string>;
  highlightId?: number | null;
}>();

const emit = defineEmits<{
  (e: "selectPerson", id: number): void;
}>();

const wrapRef = ref<HTMLDivElement | null>(null);
const chartAreaRef = ref<HTMLDivElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);

let chart: ReturnType<typeof createBeeswarmPlot> | null = null;
let ro: ResizeObserver | null = null;

const hovered = ref<BeeswarmNode | null>(null);
const tip = ref({ x: 0, y: 0, show: false });
const pointColor = computed(() => "#f97316");

function setTipFromEvent(ev: PointerEvent) {
  const wrap = wrapRef.value;
  if (!wrap) return;
  const r = wrap.getBoundingClientRect();
  tip.value.x = ev.clientX - r.left + 12;
  tip.value.y = ev.clientY - r.top + 12;
}

const nodes = computed<BeeswarmNode[]>(() => {
  const traits = [...props.traits];
  const out: BeeswarmNode[] = [];

  for (const record of props.records) {
    for (const trait of traits) {
      const value = record.ratings?.[trait];
      if (typeof value === "number" && Number.isFinite(value)) {
        out.push({
          personId: record.id,
          personName: record.alias,
          trait,
          value,
        });
      }
    }
  }

  return out;
});

function resizeAndDraw() {
  if (!svgRef.value || !chart) return;
  const rect = svgRef.value.getBoundingClientRect();
  const w = Math.max(10, rect.width);
  const h = Math.max(10, rect.height);

  chart.update(nodes.value, {
    width: w,
    height: h,
    traits: [...props.traits],
    traitLabels: props.traitLabels,
    highlightId: props.highlightId ?? null,
    pointColor: pointColor.value,
  });
}

onMounted(() => {
  chart = createBeeswarmPlot(svgRef.value!, {
    onHover: (n, ev) => {
      hovered.value = n;
      tip.value.show = true;
      setTipFromEvent(ev);
    },
    onMove: (_n, ev) => setTipFromEvent(ev),
    onLeave: () => {
      tip.value.show = false;
      hovered.value = null;
    },
    onClick: (n) => emit("selectPerson", n.personId),
  });

  resizeAndDraw();

  ro = new ResizeObserver(() => requestAnimationFrame(resizeAndDraw));
  if (chartAreaRef.value) ro.observe(chartAreaRef.value);

  window.addEventListener("resize", resizeAndDraw);
});

watch(
  () => [props.records, props.traits, props.highlightId],
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
  <div class="wrap" ref="wrapRef">
    <div class="header">
      <div class="title">Trait distribution (beeswarm)</div>
    </div>

    <div class="chartArea" ref="chartAreaRef">
      <svg ref="svgRef"></svg>

      <div
        v-if="tip.show && hovered"
        class="tooltip"
        :style="{ left: tip.x + 'px', top: tip.y + 'px' }"
      >
        <div class="tTitle">{{ hovered.personName }}</div>
        <div class="tRow">{{ traitLabels[hovered.trait] ?? hovered.trait }}: {{ hovered.value }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  height: 100%;
  width: 100%;
  min-height: 780px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.title {
  font-weight: 600;
  white-space: nowrap;
}

.chartArea {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  min-height: 780px;
}

svg {
  width: 100%;
  height: 100%;
  min-height: 780px;
  display: block;
}

.tooltip {
  position: absolute;
  pointer-events: none;
  background: rgba(15, 15, 15, 0.92);
  color: #fff;
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
  opacity: 0.92;
}
</style>
