<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { IvisRecord } from "@/types/ivis23";
import { createParallelSetsPlot, type ParallelSetsLink } from "@/d3Viz/createParallelSetsPlot";

const props = defineProps<{
  records: IvisRecord[];
  skillKeys: readonly string[];
  skillLabels: Record<string, string>;
  highlightId?: number | null;
  topN?: number | null;
}>();

const wrapRef = ref<HTMLDivElement | null>(null);
const chartAreaRef = ref<HTMLDivElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);

let chart: ReturnType<typeof createParallelSetsPlot> | null = null;
let ro: ResizeObserver | null = null;

const hovered = ref<ParallelSetsLink | null>(null);
const tip = ref({ x: 0, y: 0, show: false });

function setTipFromEvent(ev: PointerEvent) {
  const wrap = wrapRef.value;
  if (!wrap) return;
  const r = wrap.getBoundingClientRect();
  tip.value.x = ev.clientX - r.left + 12;
  tip.value.y = ev.clientY - r.top + 12;
}

const links = computed<ParallelSetsLink[]>(() => {
  const out: ParallelSetsLink[] = [];
  const skillIndexByKey = new Map(props.skillKeys.map((key, index) => [key, index]));
  for (const [personIndex, person] of props.records.entries()) {
    const allSkills = props.skillKeys
      .map((skillKey) => ({
        skillKey,
        value: (person.ratings as Record<string, number | undefined>)?.[skillKey],
      }))
      .filter((item): item is { skillKey: string; value: number } => typeof item.value === "number" && Number.isFinite(item.value))
      .sort((a, b) => b.value - a.value);
    const pickedSkills = typeof props.topN === "number" && props.topN > 0 ? allSkills.slice(0, props.topN) : allSkills;

    for (const item of pickedSkills) {
      const skillKey = item.skillKey;
      out.push({
        personId: person.id,
        personName: person.alias,
        personIndex,
        skillKey,
        skillLabel: props.skillLabels[skillKey] ?? skillKey,
        skillIndex: skillIndexByKey.get(skillKey) ?? 0,
        value: item.value,
      });
    }
  }
  return out;
});

function resizeAndDraw() {
  if (!svgRef.value || !chart) return;
  const rect = svgRef.value.getBoundingClientRect();
  const width = Math.max(10, rect.width);
  const height = Math.max(10, rect.height);

  chart.update(links.value, {
    width,
    height,
    highlightId: props.highlightId ?? null,
  });
}

onMounted(() => {
  chart = createParallelSetsPlot(svgRef.value!, {
    onHover: (link, ev) => {
      hovered.value = link;
      tip.value.show = true;
      setTipFromEvent(ev);
    },
    onMove: (_link, ev) => setTipFromEvent(ev),
    onLeave: () => {
      tip.value.show = false;
      hovered.value = null;
    },
  });

  resizeAndDraw();

  ro = new ResizeObserver(() => requestAnimationFrame(resizeAndDraw));
  if (chartAreaRef.value) ro.observe(chartAreaRef.value);
  window.addEventListener("resize", resizeAndDraw);
});

watch(
  () => [props.records, props.skillKeys, props.highlightId],
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
    <div class="chartArea" ref="chartAreaRef">
      <svg ref="svgRef"></svg>
      <div v-if="tip.show && hovered" class="tooltip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">
        <div class="tTitle">{{ hovered.personName }} -> {{ hovered.skillLabel }}</div>
        <div class="tRow">Score: {{ hovered.value }}</div>
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
  width: 100%;
  height: 100%;
  min-height: 520px;
}

svg {
  width: 100%;
  height: 100%;
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
  max-width: 280px;
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
