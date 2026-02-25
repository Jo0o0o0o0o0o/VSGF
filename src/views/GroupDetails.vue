<script setup lang="ts">
import { computed, ref } from "vue";
import CompareSlotsBar from "@/components/CompareSlotsBar.vue";
import RadarChart from "@/components/RadarChart.vue";
import GroupDetailsHeatmap from "@/components/GroupDetailsHeatmap.vue";
import AxisSelector from "@/components/AxisSelector.vue";
import {
  RADAR_AXES,
  type RadarDog,
  type RadarKey,
} from "@/d3Viz/createRadarChart";
import type { IvisRecord } from "@/types/ivis23";

const MAX = 5;
const allAxes = RADAR_AXES;
const reducedDefaultKeys = new Set<RadarKey>([
  "computer_graphics_programming",
  "human_computer_interaction_programming",
  "user_experience_evaluation",
  "code_repository",
]);
const activeAxes = ref(allAxes.filter((a) => !reducedDefaultKeys.has(a.key)));

const focusIndex = ref<number | null>(null);
const slots = ref<(IvisRecord | null)[]>(Array.from({ length: MAX }, () => null));

function toggleFocus(i: number) {
  focusIndex.value = focusIndex.value === i ? null : i;
}

function setSlot(i: number, person: IvisRecord | null) {
  slots.value[i] = person;
}

function setActiveAxes(v: { key: RadarKey; label: string }[]) {
  activeAxes.value = v;
}

const selectedPeople = computed(() => slots.value.filter(Boolean) as IvisRecord[]);

const selectedRadarPeople = computed<RadarDog[]>(() =>
  selectedPeople.value.map((p) => ({
    name: p.alias,
    information_visualization: p.ratings.information_visualization,
    statistical: p.ratings.statistical,
    mathematics: p.ratings.mathematics,
    drawing_and_artistic: p.ratings.drawing_and_artistic,
    computer_usage: p.ratings.computer_usage,
    programming: p.ratings.programming,
    computer_graphics_programming: p.ratings.computer_graphics_programming,
    human_computer_interaction_programming: p.ratings.human_computer_interaction_programming,
    user_experience_evaluation: p.ratings.user_experience_evaluation,
    communication: p.ratings.communication,
    collaboration: p.ratings.collaboration,
    code_repository: p.ratings.code_repository,
  })),
);
</script>

<template>
  <main class="comparePage">
    <CompareSlotsBar
      :slots="slots"
      :max="MAX"
      :focusIndex="focusIndex"
      @update-slot="setSlot"
      @toggle-focus="toggleFocus"
    />

    <section class="grid">
      <div class="panel big">
        <h3>Ratings Heatmap</h3>
        <div class="heatmapChartWrap">
          <GroupDetailsHeatmap
            :dogs="selectedRadarPeople"
            :axes="activeAxes"
            :focusIndex="focusIndex"
            @toggleFocus="toggleFocus"
          />
        </div>

        <h3>Ratings Radar Compare</h3>
        <div class="radarChartWrap">
          <RadarChart
            :dogs="selectedRadarPeople"
            :axes="activeAxes"
            :focusIndex="focusIndex"
            @toggleFocus="toggleFocus"
          />
        </div>
      </div>

      <div class="panel narrow">
        <AxisSelector
          :allAxes="allAxes"
          :activeAxes="activeAxes"
          @update:activeAxes="setActiveAxes"
        />
      </div>
    </section>
  </main>
</template>

<style scoped>
.comparePage {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 12px;
  align-items: start;
}

.panel {
  background: #f4f4f4;
  border-radius: 12px;
  padding: 12px;
}

.panel h3 {
  margin: 0 0 12px;
}

.panel.big {
  min-height: 580px;
  display: flex;
  flex-direction: column;
}

.heatmapChartWrap {
  height: 280px;
  min-height: 260px;
  margin-bottom: 12px;
}

.radarChartWrap {
  height: 420px;
  min-height: 360px;
}

.panel.narrow {
  min-height: 0;
}
</style>
