<script setup lang="ts">
import { computed } from "vue";
import type { RadarKey } from "@/d3Viz/createRadarChart";

export type AxisItem = {
  key: RadarKey;
  label: string;
};

const props = defineProps<{
  allAxes: AxisItem[];
  activeAxes: AxisItem[];
}>();

const emit = defineEmits<{
  (e: "update:activeAxes", axes: AxisItem[]): void;
}>();

const remainingAxes = computed(() => {
  const set = new Set(props.activeAxes.map((a) => a.key));
  return props.allAxes.filter((a) => !set.has(a.key));
});

function removeAxis(key: RadarKey) {
  if (props.activeAxes.length <= 3) return; // keep at least 3 dimensions
  const next = props.activeAxes.filter((a) => a.key !== key);
  emit("update:activeAxes", next);
}

function addAxis(key: RadarKey) {
  const found = props.allAxes.find((a) => a.key === key);
  if (!found) return;

  // Preserve original axis order so radar layout stays stable.
  const nextSet = new Set([...props.activeAxes.map((a) => a.key), found.key]);
  const next = props.allAxes.filter((a) => nextSet.has(a.key));
  emit("update:activeAxes", next);
}
</script>

<template>
  <div class="axisPanel">
    <div class="sectionTitle">Added Dimensions</div>

    <div class="chips topChips">
      <button
        v-for="a in activeAxes"
        :key="a.key"
        class="chip activeChip"
        :class="{ disabled: activeAxes.length <= 3 }"
        :disabled="activeAxes.length <= 3"
        @click="removeAxis(a.key)"
        type="button"
      >
        {{ a.label }} <span class="x">×</span>
      </button>
    </div>

    <div class="separator" aria-hidden="true"></div>

    <div class="sectionTitle">Reduced Dimensions</div>

    <div class="chips">
      <button
        v-for="a in remainingAxes"
        :key="a.key"
        class="chip reducedChip"
        @click="addAxis(a.key)"
        type="button"
      >
        {{ a.label }} <span class="plus">+</span>
      </button>

      <div v-if="remainingAxes.length === 0" class="emptyText">
        No reduced dimensions
      </div>
    </div>
  </div>
</template>

<style scoped>
.axisPanel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  margin-top: 4px;
  min-height: 360px;
}

.sectionTitle {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.85;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  border: 1px solid rgba(0, 0, 0, 0.14);
  background: #ffffff;
  border-radius: 999px;
  padding: 6px 10px;
  cursor: pointer;
  font-weight: 600;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition:
    border-color 0.14s ease,
    background-color 0.14s ease,
    transform 0.1s ease;
}

.chip:hover {
  transform: translateY(-1px);
}

.activeChip {
  background: #fff8e1;
  border-color: rgba(234, 179, 8, 0.55);
}

.activeChip.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.reducedChip {
  background: #fafafa;
}

.reducedChip:hover {
  border-color: rgba(234, 179, 8, 0.7);
  background: #fffdf3;
}

.chip .x,
.chip .plus {
  opacity: 0.72;
  font-size: 14px;
}

.separator {
  height: 2px;
  width: 100%;
  background: linear-gradient(
    90deg,
    rgba(234, 179, 8, 0.2) 0%,
    rgba(234, 179, 8, 0.95) 50%,
    rgba(234, 179, 8, 0.2) 100%
  );
  border-radius: 999px;
}

.emptyText {
  font-size: 12px;
  opacity: 0.65;
}
</style>
