<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick, computed } from "vue";
import type { DogBreed } from "@/types/dogBreed";
import type { TraitKey } from "@/utils/traitFilter";
import { createBeeswarmPlot } from "@/d3Viz/createBeewarmPlot";
import theDogApiBreeds from "@/data/dogs_thedogapi_breeds.json";
import { findBreedGroupByName, getBreedGroupTagStyle } from "@/utils/fuzzyBreedGroup";

export type BeeswarmNode = d3.SimulationNodeDatum & {
  dogId: string;
  dogName: string;
  trait: TraitKey;
  value: number;
  x?: number;
  y?: number;
};

const props = defineProps<{
  dogs: DogBreed[];
  traits: readonly TraitKey[]; // ✅ 接受 readonly，避免类型坑
  traitLabels: Record<string, string>;
  highlightId?: string | null;
  selectedBreedGroup?: string | null;
}>();

const emit = defineEmits<{
  (e: "selectDog", id: string): void;
}>();

const wrapRef = ref<HTMLDivElement | null>(null);
const chartAreaRef = ref<HTMLDivElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);

let chart: ReturnType<typeof createBeeswarmPlot> | null = null;
let ro: ResizeObserver | null = null;

// tooltip
const hovered = ref<BeeswarmNode | null>(null);
const tip = ref({ x: 0, y: 0, show: false });
const selectedBreedGroup = ref<string | null>(null);
const UNKNOWN_BREED_GROUP_KEY = "__UNKNOWN_BREED_GROUP__";

const breedGroupTags = computed(() => {
  const groups = new Set<string>();
  let hasUnknown = false;
  for (const d of props.dogs) {
    const group = findBreedGroupByName(
      d.name,
      theDogApiBreeds as { name: string; breed_group?: string | null }[],
    );
    if (group) {
      groups.add(group);
    } else {
      hasUnknown = true;
    }
  }

  const knownTags = Array.from(groups)
    .sort((a, b) => a.localeCompare(b))
    .map((group) => ({
      key: group,
      label: group,
      style: getBreedGroupTagStyle(group),
    }));

  if (hasUnknown) {
    knownTags.push({
      key: UNKNOWN_BREED_GROUP_KEY,
      label: "unknow",
      style: getBreedGroupTagStyle("unknow"),
    });
  }

  return knownTags;
});

const filteredDogs = computed(() => {
  if (!selectedBreedGroup.value) return props.dogs;

  return props.dogs.filter((d) => {
    const group = findBreedGroupByName(
      d.name,
      theDogApiBreeds as { name: string; breed_group?: string | null }[],
    );
    if (selectedBreedGroup.value === UNKNOWN_BREED_GROUP_KEY) return !group;
    return group === selectedBreedGroup.value;
  });
});

const pointColor = computed(() => {
  if (!selectedBreedGroup.value) return "#f97316";
  const tag = breedGroupTags.value.find((t) => t.key === selectedBreedGroup.value);
  return (tag?.style?.backgroundColor as string | undefined) ?? "#f97316";
});

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

  for (const d of filteredDogs.value) {
    for (const t of traits) {
      const v = (d as any)[t];
      if (typeof v === "number" && Number.isFinite(v)) {
        out.push({
          dogId: d.name,
          dogName: d.name,
          trait: t,
          value: v,
        });
      }
    }
  }
  return out;
});

watch(
  breedGroupTags,
  (tags) => {
    if (selectedBreedGroup.value && !tags.some((t) => t.key === selectedBreedGroup.value)) {
      selectedBreedGroup.value = null;
    }
  },
  { immediate: true },
);

watch(
  () => props.selectedBreedGroup,
  (next) => {
    selectedBreedGroup.value = next ?? null;
  },
  { immediate: true },
);

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
    onClick: (n) => emit("selectDog", n.dogId),
  });

  resizeAndDraw();

  ro = new ResizeObserver(() => requestAnimationFrame(resizeAndDraw));
  if (chartAreaRef.value) ro.observe(chartAreaRef.value);

  window.addEventListener("resize", resizeAndDraw);
});

watch(
  () => [props.dogs, props.traits, props.highlightId, selectedBreedGroup.value],
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
      <div class="groupTags">
        <button
          class="groupTag allTag"
          :class="{ active: !selectedBreedGroup }"
          type="button"
          @click="selectedBreedGroup = null"
        >
          All
        </button>
        <button
          v-for="tag in breedGroupTags"
          :key="`beeswarm-group-${tag.key}`"
          class="groupTag"
          :style="tag.style"
          :class="{ active: selectedBreedGroup === tag.key }"
          type="button"
          @click="selectedBreedGroup = tag.key"
        >
          {{ tag.label }}
        </button>
      </div>
    </div>

    <div class="chartArea" ref="chartAreaRef">
      <svg ref="svgRef"></svg>

      <div
        v-if="tip.show && hovered"
        class="tooltip"
        :style="{ left: tip.x + 'px', top: tip.y + 'px' }"
      >
        <div class="tTitle">{{ hovered.dogName }}</div>
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
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.title {
  font-weight: 600;
  white-space: nowrap;
}

.groupTags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.groupTag {
  border: 1px solid transparent;
  background: #ffffff;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  line-height: 1.2;
  cursor: pointer;
}

.allTag {
  border-color: rgba(0, 0, 0, 0.18);
}

.groupTag.active {
  border-width: 2px;
  border-color: #facc15;
  font-weight: 700;
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
  opacity: 0.95;
}
</style>
