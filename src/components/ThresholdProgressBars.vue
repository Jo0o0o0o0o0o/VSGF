<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createThresholdProgressBars, type ThresholdProgressDatum } from "@/d3Viz/createThresholdProgressBars";
import type { IvisRecord } from "@/types/ivis23";
import type { RadarKey } from "@/d3Viz/createRadarChart";

type ThresholdDimensionDef = {
  key: string;
  label: string;
  keys: readonly RadarKey[];
};
type ThresholdAssignments = Record<string, { leaders: Array<number | null>; supports: Array<number | null> }>;

const props = defineProps<{
  records: IvisRecord[];
  dimensions: readonly ThresholdDimensionDef[];
  maxScore?: number;
  personColors?: Record<number, string>;
  assignments?: ThresholdAssignments;
}>();

const wrapRef = ref<HTMLDivElement | null>(null);
const chartAreaRef = ref<HTMLDivElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);

let chart: ReturnType<typeof createThresholdProgressBars> | null = null;
let ro: ResizeObserver | null = null;

const hovered = ref<ThresholdProgressDatum | null>(null);
const tip = ref({ x: 0, y: 0, show: false });

function setTipFromEvent(ev: PointerEvent) {
  const wrap = wrapRef.value;
  if (!wrap) return;
  const r = wrap.getBoundingClientRect();
  tip.value.x = ev.clientX - r.left + 12;
  tip.value.y = ev.clientY - r.top + 12;
}

function averageRating(record: IvisRecord, keys: readonly RadarKey[]) {
  if (!keys.length) return 0;
  const total = keys.reduce((sum, key) => sum + Number(record.ratings[key] ?? 0), 0);
  return Number((total / keys.length).toFixed(2));
}

const bars = computed<ThresholdProgressDatum[]>(() => {
  const personById = new Map(props.records.map((p) => [p.id, p] as const));

  if (props.assignments) {
    return props.dimensions.flatMap((dimension) => {
      const assigned = props.assignments?.[dimension.key] ?? { leaders: [null], supports: [null] };
      const leaderRows = (assigned.leaders ?? [null]).map((id) => {
        const person = id !== null ? personById.get(id) ?? null : null;
        return {
          dimensionKey: dimension.key,
          dimensionLabel: dimension.label,
          role: "leader" as const,
          personId: person?.id ?? null,
          personName: person?.alias ?? "-",
          score: person ? averageRating(person, dimension.keys) : 0,
          color: person ? props.personColors?.[person.id] : undefined,
        };
      });
      const supportRows = (assigned.supports ?? [null]).map((id) => {
        const person = id !== null ? personById.get(id) ?? null : null;
        return {
          dimensionKey: dimension.key,
          dimensionLabel: dimension.label,
          role: "support" as const,
          personId: person?.id ?? null,
          personName: person?.alias ?? "-",
          score: person ? averageRating(person, dimension.keys) : 0,
          color: person ? props.personColors?.[person.id] : undefined,
        };
      });

      return [...leaderRows, ...supportRows];
    });
  }

  const usedLeaderIds = new Set<number>();
  const usedSupportIds = new Set<number>();
  const dimensionOrder = props.dimensions.map((d) => d.key);

  const rankedByDimension = new Map<string, Array<{ personId: number; personName: string; score: number }>>();
  const bestDimensionByPerson = new Map<number, string>();

  for (const dimension of props.dimensions) {
    const ranked = props.records
      .map((person) => ({
        personId: person.id,
        personName: person.alias,
        score: averageRating(person, dimension.keys),
      }))
      .sort((a, b) => b.score - a.score);
    rankedByDimension.set(dimension.key, ranked);
  }

  for (const person of props.records) {
    let bestKey = dimensionOrder[0] ?? "";
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const dimension of props.dimensions) {
      const score = averageRating(person, dimension.keys);
      if (score > bestScore) {
        bestScore = score;
        bestKey = dimension.key;
      }
    }
    bestDimensionByPerson.set(person.id, bestKey);
  }

  return props.dimensions.flatMap((dimension) => {
    const ranked = rankedByDimension.get(dimension.key) ?? [];

    const leaderCandidate = ranked.find(
      (row) =>
        !usedLeaderIds.has(row.personId) &&
        bestDimensionByPerson.get(row.personId) === dimension.key,
    );
    const leader = leaderCandidate ?? { personId: null, personName: "-", score: 0 };
    if (leader.personId !== null) usedLeaderIds.add(leader.personId);

    const supportCandidate = ranked.find(
      (row) =>
        row.personId !== leader.personId &&
        !usedSupportIds.has(row.personId),
    );
    const support = supportCandidate ?? { personId: null, personName: "-", score: 0 };
    if (support.personId !== null) usedSupportIds.add(support.personId);

    return [
      {
        dimensionKey: dimension.key,
        dimensionLabel: dimension.label,
        role: "leader" as const,
        personId: leader.personId,
        personName: leader.personName,
        score: leader.score,
        color: leader.personId !== null ? props.personColors?.[leader.personId] : undefined,
      },
      {
        dimensionKey: dimension.key,
        dimensionLabel: dimension.label,
        role: "support" as const,
        personId: support.personId,
        personName: support.personName,
        score: support.score,
        color: support.personId !== null ? props.personColors?.[support.personId] : undefined,
      },
    ];
  });
});

const peopleLegend = computed(() =>
  props.records.map((person) => ({
    id: person.id,
    name: person.alias,
    color: props.personColors?.[person.id] ?? "#64748b",
  })),
);

function resizeAndDraw() {
  if (!svgRef.value || !chart) return;
  const rect = svgRef.value.getBoundingClientRect();
  const width = Math.max(10, rect.width);
  const height = Math.max(10, rect.height);

  chart.update(bars.value, {
    width,
    height,
    yMax: props.maxScore,
  });
}

onMounted(() => {
  chart = createThresholdProgressBars(svgRef.value!, {
    onHover: (datum, ev) => {
      hovered.value = datum;
      tip.value.show = true;
      setTipFromEvent(ev);
    },
    onMove: (_datum, ev) => setTipFromEvent(ev),
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
  () => [props.records, props.dimensions, props.maxScore, props.assignments],
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
        <div class="tTitle">{{ hovered.dimensionLabel }} · {{ hovered.role }}</div>
        <div class="tRow">{{ hovered.personName }}</div>
        <div class="tRow">Score: {{ hovered.score }}</div>
      </div>
    </div>
    <aside class="topTips">
      <div class="legendCard">
        <div v-for="item in peopleLegend" :key="item.id" class="legendRow">
          <span class="legendDot" :style="{ backgroundColor: item.color }"></span>
          <span class="legendName" :style="{ color: item.color }">{{ item.name }}</span>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.wrap {
  height: 100%;
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  gap: 12px;
}

.chartArea {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 240px;
}

.topTips {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legendCard {
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #ffffff;
  border-radius: 10px;
  padding: 10px 12px;
}

.legendRow {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-height: 24px;
}

.legendDot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  flex: 0 0 auto;
}

.legendName {
  font-weight: 700;
  font-size: 14px;
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
