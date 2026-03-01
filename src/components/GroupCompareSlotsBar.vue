<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RADAR_COLORS } from "@/d3Viz/createRadarChart";
import type { CompareGroup } from "@/types/compareGroup";

const props = defineProps<{
  slots: (CompareGroup | null)[];
  availableGroups: CompareGroup[];
  max: number;
  focusIndex?: number | null;
}>();

const emit = defineEmits<{
  (e: "update-slot", index: number, group: CompareGroup | null): void;
  (e: "toggle-focus", index: number): void;
}>();

const openIndex = ref<number | null>(null);
const root = ref<HTMLElement | null>(null);

const slotRadarColors = computed(() => {
  let colorIdx = 0;
  return props.slots.map((group) => {
    if (!group) return null;
    const color = RADAR_COLORS[colorIdx % RADAR_COLORS.length] ?? "#f59e0b";
    colorIdx += 1;
    return color;
  });
});

function toSoftBackground(color: string, alpha = 0.24) {
  if (/^#([\da-f]{3}|[\da-f]{6})$/i.test(color)) {
    const hex = color.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

function toggle(i: number) {
  openIndex.value = openIndex.value === i ? null : i;
}

function openFromPlus(i: number) {
  openIndex.value = i;
}

function pick(i: number, group: CompareGroup) {
  emit("update-slot", i, group);
  openIndex.value = null;
}

function clear(i: number) {
  emit("update-slot", i, null);
}

function onDocClick(e: MouseEvent) {
  const el = root.value;
  if (!el) return;
  if (!el.contains(e.target as Node)) openIndex.value = null;
}

onMounted(() => document.addEventListener("mousedown", onDocClick));
onBeforeUnmount(() => document.removeEventListener("mousedown", onDocClick));

function filteredList(currentIndex: number) {
  const selectedGroupIds = new Set(
    props.slots
      .map((group, idx) => (idx !== currentIndex ? group?.id : null))
      .filter((v): v is number => typeof v === "number"),
  );

  return props.availableGroups.filter((group) => !selectedGroupIds.has(group.id));
}
</script>

<template>
  <section class="topSlots" ref="root">
    <div
      v-for="i in props.max"
      :key="i"
      class="slot"
      :style="
        props.focusIndex === i - 1 && slotRadarColors[i - 1]
          ? { backgroundColor: toSoftBackground(slotRadarColors[i - 1]!) }
          : undefined
      "
      :class="{
        focused: props.focusIndex === i - 1,
        dim: props.focusIndex !== null && props.focusIndex !== undefined && props.focusIndex !== i - 1,
      }"
    >
      <button v-if="!props.slots[i - 1]" class="visual addArea" @click="openFromPlus(i - 1)">
        <span class="plus">+</span>
        <span class="label">Add</span>
      </button>

      <div
        v-else
        class="visual picked"
        @click.stop="emit('toggle-focus', i - 1)"
        role="button"
        tabindex="0"
      >
        <div class="picked-placeholder">
          <span>G{{ props.slots[i - 1]!.id }}</span>
        </div>
      </div>

      <div class="dropdownWrap">
        <div class="selectRow">
          <button class="trigger" @click="toggle(i - 1)">
            <span class="txt">
              {{ props.slots[i - 1] ? `${props.slots[i - 1]!.label}` : "choose group" }}
            </span>
            <span class="caret">{{ openIndex === i - 1 ? "^" : "v" }}</span>
          </button>
        </div>

        <div v-if="openIndex === i - 1" class="panel" data-open="true">
          <div class="searchRow">
            <div class="panelTitle">Select group</div>
            <button v-if="props.slots[i - 1]" class="clearBtn" @click="clear(i - 1)">Clear</button>
          </div>

          <div class="list">
            <button
              v-for="group in filteredList(i - 1)"
              :key="group.id"
              class="row"
              @click="pick(i - 1, group)"
            >
              {{ group.label }}
            </button>
            <div v-if="filteredList(i - 1).length === 0" class="empty">No groups available</div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.topSlots {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.slot {
  background: #f4f4f4;
  border-radius: 14px;
  padding: 14px;
  display: grid;
  gap: 12px;
  min-height: 160px;
  position: relative;
}

.slot.focused {
  background: #fff6cc;
}

.slot.dim {
  opacity: 0.45;
}

.visual {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 16px;
  background: #e9e9e9;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

.addArea {
  border: none;
  cursor: pointer;
  background: #e9e9e9;
}

.plus {
  font-size: 48px;
  opacity: 0.6;
}

.label {
  display: none;
}

.picked {
  padding: 0;
  background: #ffffff;
}

.picked-placeholder {
  width: 100%;
  height: 100%;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  color: #475569;
  display: grid;
  place-items: center;
  font-size: 28px;
  font-weight: 700;
}

.trigger {
  width: 100%;
  height: 38px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  background: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  cursor: pointer;
  flex: 1 1 auto;
  min-width: 0;
}

.selectRow {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dropdownWrap {
  position: relative;
}

.txt {
  opacity: 0.9;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.caret {
  opacity: 0.7;
}

.panel {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.14);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  z-index: 20;
}

.searchRow {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.panelTitle {
  font-size: 12px;
  font-weight: 700;
  color: #374151;
  display: flex;
  align-items: center;
}

.clearBtn {
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  background: #fafafa;
  padding: 0 10px;
  cursor: pointer;
}

.list {
  max-height: 220px;
  overflow: auto;
  padding: 6px;
  display: grid;
  gap: 6px;
}

.row {
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #fafafa;
  cursor: pointer;
}

.row:hover {
  background: #f0f0f0;
}

.empty {
  padding: 12px;
  opacity: 0.7;
}
</style>
