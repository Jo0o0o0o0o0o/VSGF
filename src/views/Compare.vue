<script setup lang="ts">
import { computed, ref, watchEffect, onMounted} from "vue";
import { useRoute } from "vue-router"
import type { DogBreed } from "@/types/dogBreed";
import CompareSlotsBar from "@/components/CompareSlotsBar.vue";
import RadarChart from "@/components/RadarChart.vue";
import dogsJson from "@/data/dogs_ninjas_raw.json";
import { RADAR_AXES, RADAR_COLORS } from "@/d3Viz/createRadarChart";
import AxisSelector from "@/components/AxisSelector.vue";
import DumbbellChart from "@/components/DumbbellChart.vue";
import BoxPlotChart from "@/components/BoxPlotChart.vue";

const route = useRoute();

const dogs = ref<DogBreed[]>([]);
const allAxes = RADAR_AXES;
const reducedDefaultKeys = new Set(["shedding", "grooming", "drooling", "coat_length"]);
const activeAxes = ref(allAxes.filter((a) => !reducedDefaultKeys.has(a.key)));

const focusIndex = ref<number | null>(null);

// 点击同一只 = 取消
function toggleFocus(i: number) {
  focusIndex.value = focusIndex.value === i ? null : i;
}

function addDogToSlots(dog: DogBreed) {
  if (slots.value.some((d) => d?.name === dog.name)) return;

  const emptyIdx = slots.value.findIndex((d) => d === null);
  if (emptyIdx === -1) {
    return;
  } else {
    slots.value[emptyIdx] = dog;
  }
}

function addDogByName(name: string) {
  const dog = dogs.value.find((d) => d.name === name);
  if (dog) addDogToSlots(dog);
}

function consumeCompareAddFromStorage() {
  const queueRaw = localStorage.getItem("compare_add_queue");
  if (queueRaw) {
    try {
      const parsed = JSON.parse(queueRaw) as unknown;
      const names = Array.isArray(parsed)
        ? parsed.filter((v): v is string => typeof v === "string")
        : [];

      names.forEach((name) => addDogByName(name));
    } catch (_) {
      // ignore storage failures
    }
  }

  try {
    const name = localStorage.getItem("compare_add");
    if (!name) return;
    addDogByName(name);
    localStorage.removeItem("compare_add");
  } catch (_) {
    // ignore storage failures
  }
}


onMounted(() => {
  dogs.value = dogsJson as DogBreed[];
  consumeCompareAddFromStorage();
});

const MAX = 5;
const slots = ref<(DogBreed | null)[]>(Array.from({ length: MAX }, () => null));

function syncCompareQueueToStorage() {
  try {
    const names = slots.value
      .map((d) => d?.name)
      .filter((name): name is string => typeof name === "string" && name.length > 0);

    localStorage.setItem("compare_add_queue", JSON.stringify(names));
    localStorage.removeItem("compare_add");
    window.dispatchEvent(new Event("compare-queue-updated"));
  } catch (_) {
    // ignore storage failures
  }
}

function setSlot(i: number, dog: DogBreed | null) {
  slots.value[i] = dog;
  syncCompareQueueToStorage();
}

const selectedDogs = computed(() => slots.value.filter(Boolean) as DogBreed[]);

const selectedColors = computed(() => RADAR_COLORS.slice(0, selectedDogs.value.length));

watchEffect(() => {
  const q = route.query?.add;
  if (dogs.value.length === 0) return;

  const fromAdd = (Array.isArray(q) ? q : q ? [q] : []).filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  const fromIndexed = Array.from({ length: MAX }, (_, i) => route.query?.[`add${i + 1}`])
    .map((v) => (Array.isArray(v) ? v[0] : v))
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  [...fromAdd, ...fromIndexed].forEach((name) => addDogByName(name));
});
</script>


<template>
  <main class="comparePage">
    <CompareSlotsBar
  :dogs="dogs"
  :slots="slots"
  :max="MAX"
  :focusIndex="focusIndex"
  @update-slot="setSlot"
  @toggle-focus="toggleFocus"
/>

    <section class="grid">
      <div class="col leftCol">
        <div class="panel big">
          <h3>Temperament Traits Compare</h3>
          <div class="radarChartWrap">
            <RadarChart
              :dogs="selectedDogs"
              :axes="activeAxes"
              :focusIndex="focusIndex"
              @toggleFocus="toggleFocus"
            />
          </div>
        </div>

        <div class="panel">
          <h3>Difference Comparison</h3>
          <DumbbellChart
            :dogs="selectedDogs"
            :colors="selectedColors"
            :focusIndex="focusIndex"
            @toggleFocus="toggleFocus"
          />
        </div>
      </div>

      <div class="col rightCol">
        <div class="panel narrow">
          
          <AxisSelector
            :allAxes="allAxes"
            :activeAxes="activeAxes"
            @update:activeAxes="(v) => activeAxes = v"
          />
        </div>

        <div class="panel boxPanel">
          <h4>Population Distribution & Benchmark</h4>
          <BoxPlotChart
            :allDogs="dogs"
            :selectedDogs="selectedDogs"
            :colors="selectedColors"
            :focusIndex="focusIndex"
            @toggleFocus="toggleFocus"
          />
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.comparePage { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
.grid { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; align-items: start; }
.col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.panel { background: #f4f4f4; border-radius: 12px; padding: 12px; min-height: 220px; }
.panel h3 { margin: 0 0 12px; }
.panel.big { min-height: 580px; display: flex; flex-direction: column; }
.radarChartWrap { height: 480px; min-height: 420px; }
.panel.narrow { min-height: 0; }
.boxPanel { min-height: 380px; }
.hint { opacity: 0.7; margin-top: 8px; }
</style>




