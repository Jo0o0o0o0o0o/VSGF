<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import type { DogBreed } from "@/types/dogBreed";
import { drawDumbbellChart } from "@/d3Viz/createDumbbellChart";

const props = defineProps<{
  dogs: DogBreed[];
  colors: string[];            // aligned with dogs order
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
  const h = Math.max(260, Math.floor(rect.height));

  drawDumbbellChart(el, props.dogs, {
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

// dogs / focus change => redraw
watch(
  () => [props.dogs, props.focusIndex, props.colors],
  () => redraw(),
  { deep: true }
);
</script>

<template>
  <!-- position: relative 给 tooltip 用 -->
  <div ref="rootRef" class="dumbbellRoot"></div>
</template>

<style scoped>
.dumbbellRoot{
  position: relative;
  width: 100%;
  height: 380px;
}

</style>
