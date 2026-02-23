<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import type { DogBreed } from "@/types/dogBreed";
import { createTraitLineChart } from "@/d3Viz/createTraitLineChart";
import type { TraitAverages } from "@/utils/computeAverageTraits";
const props = defineProps<{
  dog: DogBreed | null;
  avgTraits: TraitAverages; 
}>();

const svgRef = ref<SVGSVGElement | null>(null);
let chart: ReturnType<typeof createTraitLineChart> | null = null;

function resizeAndDraw() {
  if (!svgRef.value || !chart) return;
  const rect = svgRef.value.parentElement!.getBoundingClientRect();
  chart.update(props.dog, props.avgTraits, { width: rect.width, height: rect.height });
  console.log(rect.width, rect.height)
}

onMounted(() => {
  chart = createTraitLineChart(svgRef.value!);
  resizeAndDraw();
  window.addEventListener("resize", resizeAndDraw);
});

watch(() => props.dog, () => resizeAndDraw(), { deep: true });

onBeforeUnmount(() => {
  window.removeEventListener("resize", resizeAndDraw);
  chart?.destroy();
});
</script>

<template>
  <svg ref="svgRef"></svg>
</template>

<style scoped>
svg { width: 100%; height: 100%; }
</style>
