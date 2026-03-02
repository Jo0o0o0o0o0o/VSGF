<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { IvisRecord } from "@/types/ivis23";
import { getActiveEmbeddings, getActiveRecords, type PrecomputedEmbeddingsFile } from "@/types/dataSource";
import { fuzzyFilter } from "@/utils/fuzzySearch";
import { RADAR_COLORS } from "@/d3Viz/createRadarChart";
import { formatHobbyLabel, getHobbyTagStyle } from "@/utils/hobbyTagColorMap";
import hobbyAreaRulesRaw from "@/data/hobby_area_rules.json";
import { EMBEDDING_MODEL_ID, EMBEDDING_TEXT_BUILDER_VERSION } from "@/embeddings/config";

const props = defineProps<{
  slots: (IvisRecord | null)[];
  max: number;
  focusIndex?: number | null;
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: "update-slot", index: number, person: IvisRecord | null): void;
  (e: "toggle-focus", index: number): void;
}>();

const people = getActiveRecords() as IvisRecord[];
const openIndex = ref<number | null>(null);
const query = ref("");
const root = ref<HTMLElement | null>(null);
const personTopAreaLabels = ref<Record<number, string[]>>({});

type HobbyAreaRule = {
  hobby_area: string;
  keywords: string[];
};

const hobbyAreaRules = hobbyAreaRulesRaw as HobbyAreaRule[];
const hobbyAreaKeys = Array.from(
  new Set(
    hobbyAreaRules
      .map((rule) => rule.hobby_area.trim().toLowerCase())
      .filter((area) => area && area !== "other"),
  ),
);
const keywordsByArea = new Map<string, string[]>(
  hobbyAreaRules.map((rule) => [rule.hobby_area.trim().toLowerCase(), rule.keywords ?? []]),
);
const precomputedEmbeddings = getActiveEmbeddings() as PrecomputedEmbeddingsFile | null;
const precomputedEmbeddingsCompatible =
  !!precomputedEmbeddings &&
  precomputedEmbeddings.model === EMBEDDING_MODEL_ID &&
  precomputedEmbeddings.textBuilderVersion === EMBEDDING_TEXT_BUILDER_VERSION;
const studentEmbeddingById = new Map<number, number[]>(
  precomputedEmbeddings?.embeddings.map((item) => [item.id, normalizeVector(item.vector)]) ?? [],
);
const areaQueryEmbeddingCache = new Map<string, number[]>();
let embeddingWorker: Worker | null = null;
let workerRequestId = 0;
const workerPending = new Map<
  number,
  {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }
>();

const slotRadarColors = computed(() => {
  let colorIdx = 0;
  return props.slots.map((person) => {
    if (!person) return null;
    const color = RADAR_COLORS[colorIdx % RADAR_COLORS.length] ?? "#f59e0b";
    colorIdx += 1;
    return color;
  });
});

const slotsGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${Math.max(1, props.max)}, minmax(0, 1fr))`,
}));

const isSingleSlot = computed(() => props.max === 1);

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

function focusSearch() {
  nextTick(() => {
    const input = root.value?.querySelector<HTMLInputElement>('.panel[data-open="true"] input');
    input?.focus();
  });
}

function toggle(i: number) {
  openIndex.value = openIndex.value === i ? null : i;
  query.value = "";
  if (openIndex.value !== null) focusSearch();
}

function openFromPlus(i: number) {
  openIndex.value = i;
  query.value = "";
  focusSearch();
}

function onPickedClick(i: number) {
  emit("toggle-focus", i);
  openIndex.value = i;
  query.value = "";
  focusSearch();
}

function onVisualContextMenu(i: number, event: MouseEvent) {
  event.preventDefault();
  openFromPlus(i);
}

function pick(i: number, person: IvisRecord) {
  emit("update-slot", i, person);
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
  const selectedIds = new Set(
    props.slots
      .map((p, idx) => (idx !== currentIndex ? p?.id : null))
      .filter((v): v is number => typeof v === "number"),
  );
  const available = people.filter((p) => !selectedIds.has(p.id));
  return fuzzyFilter(available, query.value, (p) => `${p.alias} ${p.id}`, { limit: available.length });
}

function dot(a: number[], b: number[]) {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i += 1) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

function normalizeVector(vec: number[]) {
  const norm = Math.sqrt(dot(vec, vec)) || 1;
  return vec.map((v) => v / norm);
}

function ensureEmbeddingWorker() {
  if (embeddingWorker) return embeddingWorker;
  embeddingWorker = new Worker(new URL("../workers/embeddingWorker.ts", import.meta.url), {
    type: "module",
  });
  embeddingWorker.onmessage = (event: MessageEvent) => {
    const msg = event.data as
      | { type: "query"; requestId: number; payload: { query: string; vector: number[] } }
      | { type: "error"; requestId: number; payload: { message: string } };

    const pending = workerPending.get(msg.requestId);
    if (!pending) return;
    workerPending.delete(msg.requestId);

    if (msg.type === "error") {
      pending.reject(new Error(msg.payload.message));
      return;
    }
    pending.resolve(msg.payload);
  };
  return embeddingWorker;
}

function callEmbeddingWorker<T>(request: { type: string; payload: unknown }): Promise<T> {
  const worker = ensureEmbeddingWorker();
  const requestId = ++workerRequestId;
  return new Promise<T>((resolve, reject) => {
    workerPending.set(requestId, { resolve: resolve as (value: unknown) => void, reject });
    worker.postMessage({ ...request, requestId });
  });
}

function buildAreaEmbeddingQuery(areaKey: string) {
  const areaLabel = formatHobbyLabel(areaKey);
  const keywords = (keywordsByArea.get(areaKey) ?? []).slice(0, 14);
  if (!keywords.length) return areaLabel;
  return `${areaLabel} hobbies: ${keywords.join(", ")}`;
}

async function ensureAreaQueryEmbedding(areaKey: string) {
  if (areaQueryEmbeddingCache.has(areaKey)) {
    return areaQueryEmbeddingCache.get(areaKey) ?? [];
  }
  const query = buildAreaEmbeddingQuery(areaKey);
  const result = await callEmbeddingWorker<{ query: string; vector: number[] }>({
    type: "embed-query",
    payload: { query },
  });
  const normalized = normalizeVector(result.vector ?? []);
  areaQueryEmbeddingCache.set(areaKey, normalized);
  return normalized;
}

async function getTopEmbeddingAreasForPerson(person: IvisRecord) {
  if (person.hobby_area.length <= 3) return person.hobby_area;
  if (!precomputedEmbeddingsCompatible) return person.hobby_area.slice(0, 3);
  const studentVec = studentEmbeddingById.get(person.id);
  if (!studentVec?.length) return person.hobby_area.slice(0, 3);

  const areaVectors = await Promise.all(
    hobbyAreaKeys.map(async (areaKey) => ({
      areaKey,
      vec: await ensureAreaQueryEmbedding(areaKey),
    })),
  );
  const ranked = areaVectors
    .map((item) => ({
      areaKey: item.areaKey,
      score: item.vec.length ? Math.max(0, dot(studentVec, item.vec)) : 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.areaKey);
  return ranked.length ? ranked : person.hobby_area.slice(0, 3);
}

async function refreshDisplayedTopAreas() {
  const members = props.slots.filter((p): p is IvisRecord => Boolean(p));
  if (!members.length) {
    personTopAreaLabels.value = {};
    return;
  }

  const next: Record<number, string[]> = {};
  await Promise.all(
    members.map(async (member) => {
      try {
        next[member.id] = await getTopEmbeddingAreasForPerson(member);
      } catch {
        next[member.id] = member.hobby_area.slice(0, 3);
      }
    }),
  );
  personTopAreaLabels.value = next;
}

function displayedHobbyAreas(person: IvisRecord) {
  if (person.hobby_area.length <= 3) return person.hobby_area;
  return personTopAreaLabels.value[person.id] ?? person.hobby_area.slice(0, 3);
}

watch(
  () => props.slots.map((slot) => slot?.id ?? "x").join(","),
  () => {
    refreshDisplayedTopAreas();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  workerPending.forEach((pending) => pending.reject(new Error("Embedding worker terminated.")));
  workerPending.clear();
  embeddingWorker?.terminate();
  embeddingWorker = null;
});
</script>

<template>
  <section class="topSlots" :class="{ single: isSingleSlot, compact: !!props.compact }" :style="slotsGridStyle" ref="root">
    <div
      v-for="i in props.max"
      :key="i"
      class="slot level-1"
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
      <button
        v-if="!props.slots[i - 1]"
        class="visual addArea"
        @click="openFromPlus(i - 1)"
        @contextmenu.stop.prevent="onVisualContextMenu(i - 1, $event)"
      >
        <span class="plus">+</span>
        <span class="label">Add</span>
      </button>

      <div
        v-else
        class="visual picked"
        @click.stop="onPickedClick(i - 1)"
        @contextmenu.stop.prevent="onVisualContextMenu(i - 1, $event)"
        role="button"
        tabindex="0"
      >
        <button class="singleClearBtn" type="button" @click.stop="clear(i - 1)">x</button>
        <div class="picked-placeholder level-2">
          <span class="pickedAlias">{{ props.slots[i - 1]!.alias }}</span>
          <div class="pickedHobbyRow">
            <span
              v-for="hobby in displayedHobbyAreas(props.slots[i - 1]!)"
              :key="`slot-${i - 1}-${props.slots[i - 1]!.id}-${hobby}`"
              class="pickedHobbyChip"
              :style="getHobbyTagStyle(hobby)"
            >
              {{ formatHobbyLabel(hobby) }}
            </span>
            <span v-if="displayedHobbyAreas(props.slots[i - 1]!).length === 0" class="pickedHobbyChip pickedHobbyEmpty">
              No hobby
            </span>
          </div>
        </div>
      </div>

      <div class="dropdownWrap">
        <div class="selectRow">
          <button class="trigger" @click="toggle(i - 1)">
            <span class="txt">
              {{ props.slots[i - 1] ? `${props.slots[i - 1]!.alias} (#${props.slots[i - 1]!.id})` : "choose people" }}
            </span>
            <span class="caret">{{ openIndex === i - 1 ? "^" : "v" }}</span>
          </button>
        </div>

        <div v-if="openIndex === i - 1" class="panel" data-open="true">
          <div class="searchRow">
            <input v-model="query" placeholder="Search people" />
            <button v-if="props.slots[i - 1]" class="clearBtn" @click="clear(i - 1)">Clear</button>
          </div>

          <div class="list">
            <button
              v-for="p in filteredList(i - 1)"
              :key="p.id"
              class="row"
              @click="pick(i - 1, p)"
            >
              {{ p.alias }} (#{{ p.id }})
            </button>
            <div v-if="filteredList(i - 1).length === 0" class="empty">No results</div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.topSlots {
  display: grid;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.slot {
  background: #f4f4f4;
  border-radius: 14px;
  padding: 14px;
  display: grid;
  gap: 12px;
  min-height: 160px;
  position: relative;
  min-width: 0;
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
  background: transparent;
  min-height: 132px;
}

.picked-placeholder {
  width: 100%;
  height: 100%;
  color: #475569;
  position: relative;
  padding: 8px;
  overflow: hidden;
}

.pickedAlias {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  font-size: clamp(10px, 1.3vw, 16px);
  font-weight: 700;
  line-height: 1.15;
  max-width: calc(100% - 20px);
  word-break: break-word;
  z-index: 1;
}

.pickedHobbyRow {
  position: absolute;
  right: 12px;
  bottom: 14px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  align-content: flex-end;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 5px;
  max-width: calc(100% - 24px);
  max-height: calc(100% - 24px);
  overflow: auto;
  z-index: 2;
}

.pickedHobbyChip {
  min-height: 16px;
  border-radius: 999px;
  border: none;
  padding: 1px 7px;
  font-size: 9px;
  line-height: 1;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  white-space: normal;
  overflow-wrap: anywhere;
}

.pickedHobbyEmpty {
  color: #666;
  background: #ececec;
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
  min-width: 0;
}

.txt {
  opacity: 0.9;
  font-weight: 600;
  font-size: 14px;
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

.searchRow input {
  width: 100%;
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  padding: 0 10px;
  outline: none;
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

.topSlots.single .slot {
  grid-template-columns: 1fr;
  align-items: start;
  row-gap: 10px;
  min-height: 0;
  padding: 12px;
}

.topSlots.compact .slot {
  min-height: 118px;
  padding: 10px;
  gap: 8px;
}

.topSlots.compact .visual {
  aspect-ratio: 1.6 / 1;
  border-radius: 12px;
}

.topSlots.compact .picked-placeholder {
  padding: 8px 8px 34px;
}

.topSlots.compact .pickedAlias {
  font-size: clamp(10px, 1.6vw, 18px);
}

.topSlots.compact .pickedHobbyChip {
  min-height: 17px;
  padding: 1px 7px;
  font-size: 9px;
}

.topSlots.compact .trigger {
  height: 34px;
}

.topSlots.single .visual {
  width: 100%;
  min-width: 0;
  aspect-ratio: 1.15 / 1;
  border-radius: 14px;
}

.topSlots.single .selectRow {
  width: 100%;
}

.topSlots.single .dropdownWrap {
  width: 100%;
}

.topSlots.single .trigger {
  height: 42px;
  border-radius: 12px;
}

@media (max-width: 760px) {
  .topSlots.single .slot {
    grid-template-columns: 1fr;
    padding: 10px;
  }

  .topSlots.single .visual {
    width: 100%;
    min-width: 0;
  }

  .topSlots.single .picked-placeholder {
    font-size: 20px;
  }

  .topSlots.single .txt {
    font-size: 12px;
  }
}

.singleClearBtn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: none;
  background: rgba(55, 65, 81, 0.9);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  z-index: 2;
}

</style>
