<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, reactive, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ScatterPlot from "@/components/ScatterPlot.vue";
import dogsJson from "@/data/dogs_ninjas_raw.json";
import type { DogBreed } from "@/types/dogBreed";
import type { ScatterDatum } from "@/types/viz";
import TraitLineChart from "@/components/TraitLineChart.vue";
import HeightCompareChart from "@/components/HeightCompareChart.vue";
import { computeAverageTraits } from "@/utils/computeAverageTraits";
import BeeswarmPlot from "@/components/BeeWarmPlot.vue";
import { traitLabels } from "@/utils/traitFilter";
import theDogApiBreeds from "@/data/dogs_thedogapi_breeds.json";
import { findBreedGroupByName, getBreedGroupTagStyle } from "@/utils/fuzzyBreedGroup";
import { fuzzyFilter } from "@/utils/fuzzySearch";

import WorldPlot from "@/components/WorldPlot.vue";
import type { DogApiBreed } from "@/types/dogApiBreed";
import { buildDogOriginPoints } from "@/utils/buildDogOriginPoints";
import type { WorldPoint } from "@/d3Viz/createWorldPlot";

import {
  TRAIT_KEYS,
  type TraitKey,
  createDefaultTraitEnabled,
  filterDogsBySelectedTraits,
  
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

const avgTraits = ref(computeAverageTraits([] as DogBreed[]));

const selectedDog = computed(() => dogs.value.find((d) => d.name === selectedName.value) ?? null);

const scatterData = computed<ScatterDatum[]>(() =>
  filteredDogs.value.map((d) => ({
    id: d.name,
    label: d.name,
    breedGroup: findBreedGroupByName(
      d.name,
      theDogApiBreeds as { name: string; breed_group?: string | null }[],
    ),
    x: Math.round(((d.max_height_male + d.max_height_female) / 2) * 2.54),
    y: Math.round(((d.max_weight_male + d.max_weight_female) / 2) * 0.45359237),
    size: d.max_life_expectancy,
  })),
);

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

const filterEnabled = ref(false);
const breedGroupFilterEnabled = ref(false);
const traitEnabled = reactive<Record<TraitKey, boolean>>(createDefaultTraitEnabled());

function toggleTrait(k: TraitKey, v: boolean) {
  traitEnabled[k] = v;
}

const filteredDogs = computed(() => {
  const traitFiltered = filterDogsBySelectedTraits(
    dogs.value,
    selectedDog.value,
    filterEnabled.value,
    traitEnabled,
  );

  if (!filterEnabled.value || !breedGroupFilterEnabled.value || !selectedDog.value) {
    return traitFiltered;
  }

  const selectedGroup = findBreedGroupByName(
    selectedDog.value.name,
    theDogApiBreeds as { name: string; breed_group?: string | null }[],
  );

  return traitFiltered.filter((d) => {
    const group = findBreedGroupByName(
      d.name,
      theDogApiBreeds as { name: string; breed_group?: string | null }[],
    );
    if (!selectedGroup) return !group;
    return group === selectedGroup;
  });
});

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

const apiBreeds = computed(() => theDogApiBreeds as DogApiBreed[]);

const worldPoints = computed<WorldPoint[]>(() =>
  buildDogOriginPoints(dogs.value, apiBreeds.value),
);

const UNKNOWN_BREED_GROUP_KEY = "__UNKNOWN_BREED_GROUP__";
const selectedWorldBreedGroup = ref<string | null>(null);

const worldBreedGroupTags = computed(() => {
  const groups = new Set<string>();

  for (const d of dogs.value) {
    const group = findBreedGroupByName(
      d.name,
      theDogApiBreeds as { name: string; breed_group?: string | null }[],
    );

    if (group) {
      groups.add(group);
      continue;
    }

  }

  const sortedGroups = Array.from(groups).sort((a, b) => a.localeCompare(b));
  const tags = sortedGroups.map((g) => ({ key: g, label: g, style: getBreedGroupTagStyle(g) }));


  return tags;
});

const worldDisplayPoints = computed<WorldPoint[]>(() => {
  const selectedGroup = selectedWorldBreedGroup.value;
  if (!selectedGroup) return worldPoints.value;

  return worldPoints.value.filter((p) => {
    const dogName = p.dogName ?? p.label ?? p.id;
    const group = findBreedGroupByName(
      dogName,
      theDogApiBreeds as { name: string; breed_group?: string | null }[],
    );

    if (selectedGroup === UNKNOWN_BREED_GROUP_KEY) {
      return !group;
    }

    return group === selectedGroup;
  });
});
const worldPointColor = computed(() => {
  const key = selectedWorldBreedGroup.value;
  if (!key) return "#f97316";
  const tag = worldBreedGroupTags.value.find((t) => t.key === key);
  return (tag?.style?.backgroundColor as string | undefined) ?? "#f97316";
});

const selectedCountryCode = ref<string | null>(null);
const selectedDogCountryCode = computed(() => {
  const sel = selectedDog.value;
  if (!sel) return null;

  const point = worldPoints.value.find((p) => (p.dogName ?? p.label ?? p.id) === sel.name);
  return point?.countryCode?.toUpperCase() ?? null;
});
const countryListCountryCode = computed(() => selectedCountryCode.value ?? selectedDogCountryCode.value);
const countryDogList = computed(() => {
  const cc = countryListCountryCode.value;
  if (!cc) return [] as DogBreed[];

  const names = Array.from(
    new Set(
      worldPoints.value
        .filter((p) => (p.countryCode ?? "").toUpperCase() === cc)
        .map((p) => p.dogName ?? p.label ?? p.id),
    ),
  );

  const inCountry = names
    .map((name) => dogs.value.find((d) => d.name === name))
    .filter((d): d is DogBreed => Boolean(d));

  const sel = selectedDog.value;
  if (!sel) return inCountry;

  if (!inCountry.some((d) => d.name === sel.name)) {
    return inCountry;
  }

  return [sel, ...inCountry.filter((d) => d.name !== sel.name)];
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

function onSelectCountry(countryCode: string) {
  selectedCountryCode.value = countryCode.toUpperCase();
}

function toggleWorldBreedGroup(groupKey: string) {
  selectedWorldBreedGroup.value = selectedWorldBreedGroup.value === groupKey ? null : groupKey;
  selectedCountryCode.value = null;
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
  const enabled = TRAIT_KEYS.filter((k) => traitEnabled[k]);
  return enabled.length ? enabled : [...TRAIT_KEYS];
});

watch(
  () => selectedName.value,
  (next, prev) => {
    if (!next || next === prev) return;
    selectedCountryCode.value = null;
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
  avgTraits.value = computeAverageTraits(dogs.value);

  const first = dogs.value[0];
  if (first) selectedName.value = first.name;

  document.addEventListener("mousedown", onDocClick);
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDocClick);
});
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

      <div class="card mid">
        <div class="title">Dog vs human height</div>
        <div class="midBody">
          <HeightCompareChart class="midChart" :dog="selectedDog" />
        </div>
      </div>

      <div class="card right">
        <div class="title">Temperament traits</div>
        <div class="traitArea">
          <TraitLineChart :dog="selectedDog" :avgTraits="avgTraits" />
        </div>
      </div>
    </section>

    <!-- 下方：大 scatter + 右侧列表 -->
    <section class="bottom">
      <div class="card scatter">
        <div class="title">Dogs overview</div>

        <div class="plotArea">
          <ScatterPlot
            :data="scatterData"
            :highlightId="highlightId"

            :filterEnabled="filterEnabled"
            :breedGroupFilterEnabled="breedGroupFilterEnabled"
            :traitEnabled="traitEnabled"
            :hasSelectedDog="!!selectedDog"
            :filteredCount="filteredCount"
            :totalCount="totalCount"
            @update:filterEnabled="filterEnabled = $event"
            @update:breedGroupFilterEnabled="breedGroupFilterEnabled = $event"
            @toggleTrait="toggleTrait"
            @selectDog="onSelectDog"
          />
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
    <div class="card mapCard">
      <div class="title">Breed origins</div>
      <div class="worldLayout">
        <div class="countryDogs">
          <div class="listHeader">
            <div class="title">Dogs list</div>
            <div class="subtitle">
              {{ countryListCountryCode ?? "Select a dog or click a country" }}
            </div>
          </div>

          <div class="groupTags">
            <button
              v-for="tag in worldBreedGroupTags"
              :key="`group-${tag.key}`"
              class="groupTag"
              :style="tag.style"
              :class="{ active: selectedWorldBreedGroup === tag.key }"
              @click="toggleWorldBreedGroup(tag.key)"
            >
              {{ tag.label }}
            </button>
          </div>

          <div class="countryBody">
            <button
              v-for="d in countryDogList"
              :key="`country-${d.name}`"
              class="row"
              :class="{ active: d.name === selectedName }"
              @click="selectedName = d.name"
            >
              <img :src="d.image_link" :alt="d.name" />
              <div class="name">{{ d.name }}</div>
            </button>
            <div v-if="countryDogList.length === 0" class="empty">
              Select a dog or click a country to show dogs from that country.
            </div>
          </div>
        </div>

        <div class="mapArea">
          <WorldPlot
            :points="worldDisplayPoints"
            :highlightId="highlightId"
            :pointColor="worldPointColor"
            :activeCountryCode="selectedCountryCode"
            @selectCountry="onSelectCountry"
          />
        </div>
      </div>
      <div class="hint">Showing {{ worldDisplayPoints.length }} breeds with country info.</div>
    </div>
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
  grid-template-columns: auto 1fr 2fr; /* left=内容宽，mid 左侧对齐 left 右侧，mid 更宽 */
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

.card.mid .title {
  flex: 0 0 auto;
  margin-bottom: 8px;
}
.card.mid {
  display: grid;
  flex-direction: column;
}

.card.right {
  display: grid;
  flex-direction: column;
}
.card.scatter {
  background: #f6f6f600;
}

.midBody {
  flex: 1 1 auto;
  min-height: 0; /* 重要：防止 flex 子项计算高度出问题*/
  position: relative;
}

/* [ADDED] 让组件自身高度 100%，它的 bottom:0 才会贴到 midBody 底部 */
.midChart {
  height: 100%;
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

.worldLayout {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 18px;
  height: 520px;
  min-width: 0;
  overflow: hidden;
}

.countryDogs {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.groupTags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
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

.groupTag:hover {
  background: #fff8e5;
}

.groupTag.active {
  border-color: #facc15;
  font-weight: 700;
  border: 2px solid;
}

.countryBody {
  flex: 1 1 auto;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 6px;
  padding-bottom: 4px;
}

.countryBody::-webkit-scrollbar {
  width: 6px;
}

.countryBody::-webkit-scrollbar-track {
  background: transparent;
}

.countryBody::-webkit-scrollbar-thumb {
  background: rgba(206, 214, 225, 0.6);
  border-radius: 999px;
}

.countryBody::-webkit-scrollbar-thumb:hover {
  background: rgba(71, 85, 105, 0.85);
}

.mapArea {
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.hint {
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.75;
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

