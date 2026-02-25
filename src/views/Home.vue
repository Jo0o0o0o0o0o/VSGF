<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import dogsJson from "@/data/dogs_ninjas_raw.json";
import ivisRecordsJson from "@/data/IVIS23_final.json";
import type { DogBreed } from "@/types/dogBreed";
import TraitLineChart from "@/components/TraitLineChart.vue";
import HeatedMap from "@/components/HeatedMap.vue";
import BeeswarmPlot from "@/components/BeeWarmPlot.vue";
import { traitLabels } from "@/utils/traitFilter";
import theDogApiBreeds from "@/data/dogs_thedogapi_breeds.json";
import { findBreedGroupByName, getBreedGroupTagStyle } from "@/utils/fuzzyBreedGroup";
import { fuzzyFilter } from "@/utils/fuzzySearch";

import { IVIS_RATING_KEYS, type IvisRecord } from "@/types/ivis23";

import {
  TRAIT_KEYS,
  type TraitKey,
} from "@/utils/traitFilter";


const dogs = ref<DogBreed[]>([]);
const route = useRoute();
const router = useRouter();
const selectedName = ref<string>("");
const dogSearchQuery = ref("");
const dogSelectOpen = ref(false);
const dogSelectRoot = ref<HTMLElement | null>(null);
const dogSearchInput = ref<HTMLInputElement | null>(null);
const beeswarmSectionRef = ref<HTMLElement | null>(null);
const selectedBeeswarmBreedGroup = ref<string | null>(null);
const ivisRecords = ivisRecordsJson as IvisRecord[];
const GROUPING_STORAGE_KEY = "ivis23_grouping_v1";
const GROUPING_UPDATED_EVENT = "ivis23-grouping-updated";

type StoredGrouping = {
  version: 1;
  groups: Array<{
    id: number;
    memberIds: Array<number | null>;
  }>;
};

function buildGroupSlotSizes(totalStudents: number): number[] {
  if (totalStudents <= 0) return [5];
  if (totalStudents <= 5) return [totalStudents];

  const groupCount = Math.ceil(totalStudents / 5);
  const totalMaxSlots = groupCount * 5;
  const slotsToRemove = totalMaxSlots - totalStudents;
  const sizes = Array(groupCount).fill(5);

  for (let i = 0; i < slotsToRemove; i += 1) {
    sizes[i] = 4;
  }

  return sizes;
}

function buildDefaultGrouping(totalStudents: number): StoredGrouping {
  const slotSizes = buildGroupSlotSizes(totalStudents);
  let cursor = 0;

  return {
    version: 1,
    groups: slotSizes.map((size, index) => {
      const memberIds = ivisRecords
        .slice(cursor, cursor + size)
        .map((r) => r.id);
      cursor += size;
      return { id: index + 1, memberIds };
    }),
  };
}

function readStoredGrouping(): StoredGrouping {
  try {
    const raw = localStorage.getItem(GROUPING_STORAGE_KEY);
    if (!raw) return buildDefaultGrouping(ivisRecords.length);
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return buildDefaultGrouping(ivisRecords.length);
    const maybe = parsed as Partial<StoredGrouping>;
    if (maybe.version !== 1 || !Array.isArray(maybe.groups)) {
      return buildDefaultGrouping(ivisRecords.length);
    }
    return {
      version: 1,
      groups: maybe.groups
        .filter((g) => g && typeof g.id === "number" && Array.isArray(g.memberIds))
        .map((g) => ({
          id: g.id,
          memberIds: g.memberIds.map((id) => (typeof id === "number" ? id : null)),
        })),
    };
  } catch {
    return buildDefaultGrouping(ivisRecords.length);
  }
}

const storedGrouping = ref<StoredGrouping>(buildDefaultGrouping(ivisRecords.length));

const heatmapRecords = computed<IvisRecord[]>(() => {
  const byId = new Map(ivisRecords.map((r) => [r.id, r] as const));
  const usedMemberIds = new Set<number>();
  const grouped: IvisRecord[] = [];

  for (const group of storedGrouping.value.groups) {
    const members: IvisRecord[] = [];
    for (const id of group.memberIds) {
      if (typeof id !== "number" || usedMemberIds.has(id)) continue;
      const member = byId.get(id);
      if (!member) continue;
      usedMemberIds.add(id);
      members.push(member);
    }
    if (!members.length) continue;

    const summedRatings = IVIS_RATING_KEYS.reduce((acc, key) => {
      acc[key] = members.reduce((sum, member) => sum + Number(member.ratings[key] ?? 0), 0);
      return acc;
    }, {} as IvisRecord["ratings"]);

    grouped.push({
      id: group.id,
      alias: `Group ${group.id} (${members.length})`,
      time_year: "grouped",
      hobby_raw: "",
      hobby: [],
      hobby_area: [],
      ratings: summedRatings,
    });
  }

  return grouped.length ? grouped : ivisRecords;
});

const selectedDog = computed(() => dogs.value.find((d) => d.name === selectedName.value) ?? null);

const highlightId = computed(() => selectedDog.value?.name ?? null);
const selectedBreedGroup = computed(() => {
  const dogName = selectedDog.value?.name;
  if (!dogName) return null;
  return findBreedGroupByName(
    dogName,
    theDogApiBreeds as { name: string; breed_group?: string | null }[],
  );
});
const selectedBreedGroupStyle = computed(() =>
  selectedBreedGroup.value ? getBreedGroupTagStyle(selectedBreedGroup.value) : null,
);

const filteredDogs = computed(() => dogs.value);

const filteredCount = computed(() => filteredDogs.value.length);
const totalCount = computed(() => dogs.value.length);
const dogSelectOptions = computed(() => {
  const matched = fuzzyFilter(dogs.value, dogSearchQuery.value, (d) => d.name, {
    limit: dogs.value.length,
  });
  const sel = selectedDog.value;
  if (!sel || matched.some((d) => d.name === sel.name)) return matched;
  return [sel, ...matched];
});

function focusDogSearch() {
  nextTick(() => {
    dogSearchInput.value?.focus();
  });
}

function toggleDogSelect() {
  dogSelectOpen.value = !dogSelectOpen.value;
  if (dogSelectOpen.value) {
    focusDogSearch();
    return;
  }
  dogSearchQuery.value = "";
}

function pickDogFromDropdown(name: string) {
  selectedName.value = name;
  dogSelectOpen.value = false;
  dogSearchQuery.value = "";
}

function onDocClick(e: MouseEvent) {
  const el = dogSelectRoot.value;
  if (!el) return;
  if (!el.contains(e.target as Node)) {
    dogSelectOpen.value = false;
    dogSearchQuery.value = "";
  }
}

function readSingleQueryValue(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.trim().length > 0 ? raw : null;
}

async function focusBeeswarmByBreedGroup(group: string | null) {
  if (!group) return;
  selectedBeeswarmBreedGroup.value = group;
  await nextTick();
  beeswarmSectionRef.value?.scrollIntoView({ behavior: "smooth", block: "start" });
  router.push({
    path: "/home",
    query: { ...route.query, beeswarmBreedGroup: group, homeSelectedDog: undefined },
    hash: "#beeswarm-section",
  });
}

const listDogs = computed(() => {
  const list = filteredDogs.value.slice(); // 当前筛选结�?= scatterplot 的数据源
  const sel = selectedDog.value;
  if (!sel) return list;
  const withoutSel = list.filter((d) => d.name !== sel.name);
  return [sel, ...withoutSel];
});

function onSelectDog(id: string | number) {
  selectedName.value = String(id);
}

function sendToCompare() {
  const dog = selectedDog.value;
  if (!dog) return;
  const name = dog.name;

  try {
    // fallback：如果由 query 丢了，Compare 页面还能从 localStorage 接到
    const queueKey = "compare_add_queue";
    const rawQueue = localStorage.getItem(queueKey);
    const queue = rawQueue ? (JSON.parse(rawQueue) as unknown) : [];
    const names = Array.isArray(queue) ? queue.filter((v): v is string => typeof v === "string") : [];

    if (!names.includes(name) && names.length < 5) {
      names.push(name);
    }

    localStorage.setItem(queueKey, JSON.stringify(names));
    localStorage.setItem("compare_add", name);
    window.dispatchEvent(new Event("compare-queue-updated"));
  } catch (_) {
    // ignore storage failures
  }

  // 通过 query 把名字带到 Compare
}

const beeswarmTraits = computed<TraitKey[]>(() => {
  return [...TRAIT_KEYS];
});

watch(
  () => selectedName.value,
  (next, prev) => {
    if (!next || next === prev) return;
  },
);

watch(
  () => [route.query.beeswarmBreedGroup, route.query.homeSelectedDog, route.hash, dogs.value.length] as const,
  async ([groupQuery, homeSelectedDogQuery, hash]) => {
    selectedBeeswarmBreedGroup.value = readSingleQueryValue(groupQuery);
    const targetDogName = readSingleQueryValue(homeSelectedDogQuery);
    if (targetDogName && dogs.value.some((d) => d.name === targetDogName)) {
      selectedName.value = targetDogName;
    }
    if (!selectedBeeswarmBreedGroup.value && hash !== "#beeswarm-section") return;

    await nextTick();
    beeswarmSectionRef.value?.scrollIntoView({ behavior: "smooth", block: "start" });
  },
  { immediate: true },
);

onMounted(() => {
  dogs.value = dogsJson as DogBreed[];

  const first = dogs.value[0];
  if (first) selectedName.value = first.name;

  document.addEventListener("mousedown", onDocClick);
  storedGrouping.value = readStoredGrouping();
  window.addEventListener("storage", onGroupingStorageChanged);
  window.addEventListener(GROUPING_UPDATED_EVENT, onGroupingStorageChanged);
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDocClick);
  window.removeEventListener("storage", onGroupingStorageChanged);
  window.removeEventListener(GROUPING_UPDATED_EVENT, onGroupingStorageChanged);
});

function onGroupingStorageChanged() {
  storedGrouping.value = readStoredGrouping();
}
</script>

<template>
  <div class="home">
    <!-- 上面三块卡片�?-->
    <section class="top">
      <div class="card left">
        <div class="title">Select a dog</div>

        <div class="dogSelect" ref="dogSelectRoot">
          <button class="select selectTrigger" type="button" @click="toggleDogSelect">
            <span class="selectValue">{{ selectedDog?.name ?? "Select a breed" }}</span>
            <span class="selectCaret">{{ dogSelectOpen ? "^" : "v" }}</span>
          </button>

          <div v-if="dogSelectOpen" class="dogSelectPanel">
            <div class="dogSelectSearchWrap">
              <input
                ref="dogSearchInput"
                v-model="dogSearchQuery"
                class="dogSelectSearch"
                type="text"
                placeholder="Search dogs"
              />
            </div>

            <div class="dogSelectList">
              <button
                v-for="d in dogSelectOptions"
                :key="d.name"
                class="dogSelectRow"
                :class="{ active: d.name === selectedName }"
                type="button"
                @click="pickDogFromDropdown(d.name)"
              >
                {{ d.name }}
              </button>

              <div v-if="dogSelectOptions.length === 0" class="dogSelectEmpty">No matching dogs</div>
            </div>
          </div>
        </div>

        <div class="imgBox">
          <img v-if="selectedDog" :src="selectedDog.image_link" :alt="selectedDog.name" />
          <div v-else class="placeholder">狗的 image</div>
        </div>

        <button
          v-if="selectedBreedGroup"
          class="breedGroupTag"
          :style="selectedBreedGroupStyle"
          type="button"
          @click="focusBeeswarmByBreedGroup(selectedBreedGroup)"
        >
          {{ selectedBreedGroup }}
        </button>

         <button class="compareBtn" :disabled="!selectedDog" @click="sendToCompare">
          Compare
        </button>
      </div>

      <div class="card right">
        <div class="title">Temperament traits</div>
        <div class="traitArea">
          <TraitLineChart />
        </div>
      </div>
    </section>

    <!-- 下方：大 scatter + 右侧列表 -->
    <section class="bottom">
      <div class="card scatter">
        <div class="title">Dogs overview</div>

        <div class="plotArea">
          <HeatedMap :records="heatmapRecords" :ratingKeys="IVIS_RATING_KEYS" />
        </div>
      </div>

      <div class="card list">
        <div class="listHeader">
          <div class="title">Dog list</div>
          <div class="subtitle">{{ filteredCount }} / {{ totalCount }} breeds</div>
        </div>

        <div class="listBody">
          <button
            v-for="d in listDogs"
            :key="d.name"
            class="row"
            :class="{ active: d.name === selectedName }"
            @click="selectedName = d.name"
          >
            <img :src="d.image_link" :alt="d.name" />
            <div class="name">{{ d.name }}</div>
          </button>

          <div v-if="listDogs.length === 0" class="empty">
            No matching dogs. Try adjusting the trait filters.
          </div>
        </div>
      </div>
    </section>
    <section id="beeswarm-section" ref="beeswarmSectionRef" class="beeswarmSection">
      <div class="card beeswarm">

        <div class="plotArea beeswarmArea">
          <BeeswarmPlot
            :dogs="dogs"
            :traits="beeswarmTraits"
            :traitLabels="traitLabels"
            :highlightId="highlightId"
            :selectedBreedGroup="selectedBeeswarmBreedGroup"
            @selectDog="onSelectDog"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.top {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  align-items: stretch;
  height: fit-content;
}

.bottom {
  display: grid;
  grid-template-columns: 1fr 260px;
  gap: 18px;
  align-items: stretch;
  height: 720px;
}

.card {
  background: #eeedeb;
  border-radius: 10px;
  padding: 12px;
}

.card.right {
  display: grid;
  flex-direction: column;
}
.card.scatter {
  background: #f6f6f600;
}

.card.left {
  width: fit-content;
  flex-direction: column;
}

.title {
  font-weight: 600;
  margin-bottom: 10px;
}

.select {
  width: 100%;
  padding: 8px;
  border-radius: 8px;
}

.dogSelect {
  position: relative;
}

.selectTrigger {
  border: 1px solid rgba(0, 0, 0, 0.2);
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}

.selectValue {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selectCaret {
  opacity: 0.7;
}

.dogSelectPanel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: #efefef;
  border: 1px solid transparent;
  border-radius: 12px;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.12);
  z-index: 30;
  overflow: hidden;
}

.dogSelectSearchWrap {
  padding: 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.dogSelectSearch {
  width: 100%;
  box-sizing: border-box;
  height: 36px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  background: #fff;
  outline: none;
}

.dogSelectList {
  max-height: 260px;
  overflow: auto;
  padding: 8px;
  display: grid;
  gap: 8px;
}

.dogSelectRow {
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: #f3f3f3;
  cursor: pointer;
}

.dogSelectRow:hover {
  background: #fff8e5;
}

.dogSelectRow.active {
  border-color: rgba(245, 158, 11, 0.7);
  background: #ffefbb;
}

.dogSelectEmpty {
  font-size: 12px;
  opacity: 0.75;
  padding: 8px;
}

.imgBox {
  margin-top: 10px;
  height: 240px;
  width: 240px;
  border-radius: 10px;
  overflow: hidden;
  background: #ddd;
  display: grid;
  place-items: center;
}
.imgBox img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.placeholder {
  opacity: 0.7;
}

.breedGroupTag {
  margin-top: 10px;
  border: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.compareBtn {
  margin-top: 12px;
  border: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  background: #facc15;
  color: #1f2937;
  cursor: pointer;
}

.compareBtn:hover:not(:disabled) {
  background: #eab308;
}

.compareBtn:disabled {
  background: #fde68a;
  color: #6b7280;
  cursor: not-allowed;
}

.traitArea {
  height: 260px;
  width: 100%;
}
.scatter .plotArea {
  height: 660px;
}

.card.list {
  height: 660px; /* 高度固定不变 */
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff3ae;
}

.listHeader {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.25);
}

.subtitle {
  font-size: 12px;
  opacity: 0.75;
  color: #6b7280;
}

.listBody {
  flex: 1 1 auto;
  overflow-y: auto; /* 下拉滚动 */
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 6px;
  padding-bottom: 4px;
}

.listBody::-webkit-scrollbar {
  width: 6px;
}

.listBody::-webkit-scrollbar-track {
  background: transparent;
}

.listBody::-webkit-scrollbar-thumb {
  background: rgba(206, 214, 225, 0.6);
  border-radius: 999px;
}

.listBody::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.85);
}

.row {
  position: relative;
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border: 0;
  background: #ffffff;
  border-radius: 30px;
  cursor: pointer;
  transition:
    background 0.16s ease,
    transform 0.16s ease,
    box-shadow 0.16s ease;
}

.row::after {
  content: ">";
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 13px;
  color: #acaf9c;
}

.row:hover {
  background: #fff8e5;
  transform: translateY(-1px);
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.12);
}

/* 选中高亮 */
.row.active {
  background: #ffdf5d;
}

/* 可选：让选中的更“像选中”一样*/
.row.active .name {
  font-weight: 700;
}

.row img {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 20px;
  border: 1px solid rgba(148, 163, 184, 0.6);
}

.name {
  text-align: left;
  font-size: 13px;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 12px; /* 为右侧箭头留出空间*/
}

.empty {
  opacity: 0.8;
  font-size: 12px;
  padding: 10px;
  border-radius: 10px;
  background: #eef2ff;
  color: #6b7280;
}
.beeswarmSection {
  height: 860px;
}

.card.beeswarm {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.beeswarmArea {
  flex: 1 1 auto;
  min-height: 780px;
}
</style>
