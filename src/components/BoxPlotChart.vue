<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import type { DogBreed } from "@/types/dogBreed";
import { drawBoxPlotChart } from "@/d3Viz/createBoxPlotChart";

const props = defineProps<{
  allDogs: DogBreed[];
  selectedDogs: DogBreed[];
  colors: string[];
  focusIndex: number | null;
}>();

const emit = defineEmits<{
  (e: "toggleFocus", i: number): void;
}>();

const rootRef = ref<HTMLElement | null>(null);
let ro: ResizeObserver | null = null;

function redraw() {
  const el = rootRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const w = Math.max(320, Math.floor(rect.width));
  const h = Math.max(340, Math.floor(rect.height));

  drawBoxPlotChart(el, props.allDogs, props.selectedDogs, {
    width: w,
    height: h,
    colors: props.colors,
    focusIndex: props.focusIndex,
    onToggleFocus: (i) => emit("toggleFocus", i),
  });
}

onMounted(() => {
  if (!rootRef.value) return;
  ro = new ResizeObserver(() => redraw());
  ro.observe(rootRef.value);
  redraw();
});

onBeforeUnmount(() => {
  ro?.disconnect();
  ro = null;
});

watch(
  () => [props.allDogs, props.selectedDogs, props.colors, props.focusIndex],
  () => redraw(),
  { deep: true }
);
</script>

<template>
  <div ref="rootRef" class="boxRoot"></div>
</template>

<style scoped>
.boxRoot {
  position: relative;
  width: 100%;
  height: clamp(520px, 62vh, 900px);
}
</style>
