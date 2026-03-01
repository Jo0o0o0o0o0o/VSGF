<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import GroupCompareSlotsBar from "@/components/GroupCompareSlotsBar.vue";
import RadarChart from "@/components/RadarChart.vue";
import GroupDumbbellChart from "@/components/GroupDumbbellChart.vue";
import GroupDetailDumbbellChart from "@/components/GroupDetailDumbbellChart.vue";
import VarianceSdBarChart from "@/components/VarianceSdBarChart.vue";
import AxisSelector from "@/components/AxisSelector.vue";
import {
  RADAR_AXES,
  type RadarDog,
  type RadarKey,
} from "@/d3Viz/createRadarChart";
import ivisRecordsJson from "@/data/IVIS23_final.json";
import type { IvisRecord } from "@/types/ivis23";
import type { CompareGroup } from "@/types/compareGroup";
import { SKILL_CATEGORIES, type SkillCategoryKey } from "@/types/skillCategory";
import type { GroupDumbbellDatum } from "@/d3Viz/createGroupDumbbellChart";
import type { GroupDetailDumbbellDatum } from "@/d3Viz/createGroupDetailDumbbellChart";
import type { VarianceSdDatum } from "@/d3Viz/createVarianceSdBarChart";

const GROUPING_STORAGE_KEY = "ivis23_grouping_v1";
const GROUPING_UPDATED_EVENT = "ivis23-grouping-updated";
const COMPARE_GROUP_SLOTS_KEY = "ivis23_compare_group_slots_v1";

const MAX = 5;
const allAxes = RADAR_AXES;
const reducedDefaultKeys = new Set<RadarKey>([
  "computer_graphics_programming",
  "human_computer_interaction_programming",
  "user_experience_evaluation",
  "code_repository",
]);
const activeAxes = ref(allAxes.filter((a) => !reducedDefaultKeys.has(a.key)));

type StoredGrouping = {
  version: 1;
  groups: Array<{
    id: number;
    memberIds: Array<number | null>;
  }>;
};

const allPeople = ivisRecordsJson as IvisRecord[];
const peopleById = new Map(allPeople.map((person) => [person.id, person] as const));

const focusIndex = ref<number | null>(null);
const selectedCategoryKey = ref<SkillCategoryKey | null>(null);
const varianceUseCategoryMode = ref(false);
const slots = ref<(CompareGroup | null)[]>(Array.from({ length: MAX }, () => null));
const storedGrouping = ref<StoredGrouping>({ version: 1, groups: [] });
const hydratedCompareSlots = ref(false);

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
      const memberIds = allPeople.slice(cursor, cursor + size).map((r) => r.id);
      cursor += size;
      return { id: index + 1, memberIds };
    }),
  };
}

function readStoredGrouping(): StoredGrouping {
  try {
    const raw = localStorage.getItem(GROUPING_STORAGE_KEY);
    if (!raw) return buildDefaultGrouping(allPeople.length);
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return buildDefaultGrouping(allPeople.length);
    const maybe = parsed as Partial<StoredGrouping>;
    if (maybe.version !== 1 || !Array.isArray(maybe.groups)) {
      return buildDefaultGrouping(allPeople.length);
    }

    return {
      version: 1,
      groups: maybe.groups
        .filter((group) => group && typeof group.id === "number" && Array.isArray(group.memberIds))
        .map((group) => ({
          id: group.id,
          memberIds: group.memberIds.map((id) => (typeof id === "number" ? id : null)),
        })),
    };
  } catch {
    return buildDefaultGrouping(allPeople.length);
  }
}

const availableGroups = computed<CompareGroup[]>(() => {
  const usedMemberIds = new Set<number>();
  return storedGrouping.value.groups
    .map((group) => {
      const members: IvisRecord[] = [];
      for (const memberId of group.memberIds) {
        if (typeof memberId !== "number" || usedMemberIds.has(memberId)) continue;
        const person = peopleById.get(memberId);
        if (!person) continue;
        usedMemberIds.add(memberId);
        members.push(person);
      }
      return {
        id: group.id,
        label: `Group ${group.id} (${members.length})`,
        members,
      } as CompareGroup;
    })
    .filter((group) => group.members.length > 0)
    .sort((a, b) => a.id - b.id);
});

function syncGroupingAndSlots() {
  storedGrouping.value = readStoredGrouping();

  const availableById = new Map(availableGroups.value.map((group) => [group.id, group] as const));

  if (!hydratedCompareSlots.value) {
    const savedIds = readStoredCompareGroupSlotIds();
    slots.value = savedIds.map((id) => (typeof id === "number" ? availableById.get(id) ?? null : null));
    hydratedCompareSlots.value = true;
  } else {
    slots.value = slots.value.map((slot) => {
      if (!slot) return null;
      return availableById.get(slot.id) ?? null;
    });
  }

  if (focusIndex.value !== null && (focusIndex.value < 0 || focusIndex.value >= slots.value.length)) {
    focusIndex.value = null;
  }

  persistCompareGroupSlots();
}

function toggleFocus(i: number) {
  focusIndex.value = focusIndex.value === i ? null : i;
}

function setSlot(i: number, group: CompareGroup | null) {
  slots.value[i] = group;
  persistCompareGroupSlots();
}

function setActiveAxes(v: { key: RadarKey; label: string }[]) {
  activeAxes.value = v;
}

function setSelectedCategory(key: string) {
  selectedCategoryKey.value = key as SkillCategoryKey;
}

const selectedGroups = computed(() => slots.value.filter(Boolean) as CompareGroup[]);

function sum(members: IvisRecord[], getter: (record: IvisRecord) => number) {
  if (!members.length) return 0;
  const total = members.reduce((acc, member) => acc + Number(getter(member) ?? 0), 0);
  return Number(total.toFixed(2));
}

function safeMemberValue(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, v);
}

const selectedRadarPeople = computed<RadarDog[]>(() =>
  selectedGroups.value.map((group) => ({
    name: group.label,
    information_visualization: sum(group.members, (p) => p.ratings.information_visualization),
    statistical: sum(group.members, (p) => p.ratings.statistical),
    mathematics: sum(group.members, (p) => p.ratings.mathematics),
    drawing_and_artistic: sum(group.members, (p) => p.ratings.drawing_and_artistic),
    computer_usage: sum(group.members, (p) => p.ratings.computer_usage),
    programming: sum(group.members, (p) => p.ratings.programming),
    computer_graphics_programming: sum(group.members, (p) => p.ratings.computer_graphics_programming),
    human_computer_interaction_programming: sum(
      group.members,
      (p) => p.ratings.human_computer_interaction_programming,
    ),
    user_experience_evaluation: sum(group.members, (p) => p.ratings.user_experience_evaluation),
    communication: sum(group.members, (p) => p.ratings.communication),
    collaboration: sum(group.members, (p) => p.ratings.collaboration),
    code_repository: sum(group.members, (p) => p.ratings.code_repository),
  })),
);

const radarMax = computed(() => {
  const axisKeys = activeAxes.value.map((axis) => axis.key);
  const maxValue =
    selectedRadarPeople.value.length && axisKeys.length
      ? Math.max(
          ...selectedRadarPeople.value.map((group) =>
            Math.max(...axisKeys.map((key) => Number(group[key]) || 0)),
          ),
        )
      : 10;

  const normalized = Math.ceil(maxValue / 5) * 5;
  return Math.max(10, normalized || 10);
});

const selectedCategory = computed(() =>
  selectedCategoryKey.value
    ? SKILL_CATEGORIES.find((category) => category.key === selectedCategoryKey.value) ?? null
    : null,
);

const detailAxes = computed(() => {
  if (!selectedCategory.value) return [];
  return selectedCategory.value.dimensions
    .map((key) => allAxes.find((axis) => axis.key === key) ?? null)
    .filter((axis): axis is (typeof allAxes)[number] => Boolean(axis));
});

const categoryDumbbellData = computed<GroupDumbbellDatum[]>(() =>
  SKILL_CATEGORIES.flatMap((category) =>
    selectedGroups.value.map((group, groupIndex) => {
      const dimensionRanges = category.dimensions.map((dimension) => {
        const memberScores = group.members.map((member) =>
          safeMemberValue(Number(member.ratings[dimension])),
        );
        const dimMin = memberScores.length ? Math.min(...memberScores) : 0;
        const dimMax = memberScores.length ? Math.max(...memberScores) : 0;
        return { dimMin, dimMax };
      });

      const minValue = Number(
        dimensionRanges.reduce((sum, range) => sum + range.dimMin, 0).toFixed(2),
      );
      const maxValue = Number(
        dimensionRanges.reduce((sum, range) => sum + range.dimMax, 0).toFixed(2),
      );

      return {
        categoryKey: category.key,
        categoryLabel: category.label,
        groupIndex,
        groupName: group.label,
        minValue,
        maxValue,
      };
    }),
  ),
);

const detailDumbbellData = computed<GroupDetailDumbbellDatum[]>(() =>
  detailAxes.value.flatMap((axis) =>
    selectedGroups.value.map((group, groupIndex) => {
      const memberScores = group.members.map((member) => safeMemberValue(Number(member.ratings[axis.key])));
      const minValue = memberScores.length ? Math.min(...memberScores) : 0;
      const maxValue = memberScores.length ? Math.max(...memberScores) : 0;
      return {
        axisKey: axis.key,
        axisLabel: axis.label,
        groupIndex,
        groupName: group.label,
        minValue,
        maxValue,
      };
    }),
  ),
);

const selectedGroupNames = computed(() => selectedGroups.value.map((group) => group.label));

const varianceSdData = computed<VarianceSdDatum[]>(() => {
  if (varianceUseCategoryMode.value) {
    return SKILL_CATEGORIES.map((category) => {
      const groupTotals = selectedRadarPeople.value.map((group) => {
        const total = category.dimensions.reduce(
          (sum, key) => sum + safeMemberValue(Number(group[key])),
          0,
        );
        return Number(total.toFixed(4));
      });

      if (!groupTotals.length) {
        return {
          categoryKey: category.key,
          categoryLabel: category.label,
          variance: 0,
          sd: 0,
        };
      }

      const mean = groupTotals.reduce((sum, value) => sum + value, 0) / groupTotals.length;
      const variance =
        groupTotals.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) /
        groupTotals.length;
      const sd = Math.sqrt(variance);

      return {
        categoryKey: category.key,
        categoryLabel: category.label,
        variance: Number(variance.toFixed(4)),
        sd: Number(sd.toFixed(4)),
      };
    });
  }

  return RADAR_AXES.map((axis) => {
    const groupTotals = selectedRadarPeople.value.map((group) =>
      Number(safeMemberValue(Number(group[axis.key])).toFixed(4)),
    );

    if (!groupTotals.length) {
      return {
        categoryKey: axis.key,
        categoryLabel: axis.label,
        variance: 0,
        sd: 0,
      };
    }

    const mean = groupTotals.reduce((sum, value) => sum + value, 0) / groupTotals.length;
    const variance =
      groupTotals.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / groupTotals.length;
    const sd = Math.sqrt(variance);

    return {
      categoryKey: axis.key,
      categoryLabel: axis.label,
      variance: Number(variance.toFixed(4)),
      sd: Number(sd.toFixed(4)),
    };
  });
});

function readStoredCompareGroupSlotIds() {
  try {
    const raw = localStorage.getItem(COMPARE_GROUP_SLOTS_KEY);
    if (!raw) return Array.from({ length: MAX }, () => null) as Array<number | null>;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return Array.from({ length: MAX }, () => null) as Array<number | null>;
    return Array.from({ length: MAX }, (_v, i) => {
      const value = parsed[i];
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    });
  } catch {
    return Array.from({ length: MAX }, () => null) as Array<number | null>;
  }
}

function persistCompareGroupSlots() {
  try {
    const payload = slots.value.map((slot) => slot?.id ?? null);
    localStorage.setItem(COMPARE_GROUP_SLOTS_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage failures
  }
}

watch(
  () => selectedGroups.value.length,
  (len) => {
    if (focusIndex.value !== null && (focusIndex.value < 0 || focusIndex.value >= len)) {
      focusIndex.value = null;
    }
  },
);

onMounted(() => {
  syncGroupingAndSlots();
  window.addEventListener("storage", syncGroupingAndSlots);
  window.addEventListener(GROUPING_UPDATED_EVENT, syncGroupingAndSlots);
});

onBeforeUnmount(() => {
  window.removeEventListener("storage", syncGroupingAndSlots);
  window.removeEventListener(GROUPING_UPDATED_EVENT, syncGroupingAndSlots);
});
</script>

<template>
  <main class="comparePage">
    <GroupCompareSlotsBar
      :slots="slots"
      :availableGroups="availableGroups"
      :max="MAX"
      :focusIndex="focusIndex"
      @update-slot="setSlot"
      @toggle-focus="toggleFocus"
    />

    <section class="grid">
      <div class="panel big">
        <h3>Group Ratings Radar Compare</h3>
        <div class="radarChartWrap">
          <RadarChart
            :dogs="selectedRadarPeople"
            :axes="activeAxes"
            :focusIndex="focusIndex"
            :min="0"
            :max="radarMax"
            :levels="5"
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

      <div class="panel full">
        <h3>Group Category Dumbbell</h3>
        <div class="dumbbellSplitWrap">
          <div class="dumbbellMainWrap">
            <GroupDumbbellChart
              :data="categoryDumbbellData"
              :groupNames="selectedGroupNames"
              :focusIndex="focusIndex"
              @toggleFocus="toggleFocus"
              @categoryClick="setSelectedCategory"
            />
          </div>

          <div class="dumbbellDetailWrap">
            <template v-if="selectedCategory && detailAxes.length">
              <h4 class="detailTitle">{{ selectedCategory.label }} Details</h4>
              <GroupDetailDumbbellChart
                :data="detailDumbbellData"
                :axes="detailAxes"
                :focusIndex="focusIndex"
                @toggleFocus="toggleFocus"
              />
            </template>
            <div v-else class="detailEmpty">
              Click one category label in the left dumbbell chart to open detail view.
            </div>
          </div>
        </div>
      </div>

      <div class="panel full">
        <h3>Variance / SD (Across Groups, Balance)</h3>
        <div class="varianceToolbar">
          <button
            type="button"
            class="varianceToggleBtn"
            :class="{ on: varianceUseCategoryMode }"
            @click="varianceUseCategoryMode = !varianceUseCategoryMode"
          >
            {{ varianceUseCategoryMode ? "Category Dimensions: ON" : "Category Dimensions: OFF" }}
          </button>
        </div>
        <div class="varianceChartWrap">
          <VarianceSdBarChart :data="varianceSdData" />
        </div>
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

.radarChartWrap {
  height: 480px;
  min-height: 420px;
  margin-bottom: 12px;
}

.dumbbellChartWrap {
  height: 360px;
  min-height: 320px;
}

.panel.full {
  grid-column: 1 / -1;
}

.varianceChartWrap {
  height: 320px;
  min-height: 280px;
}

.varianceToolbar {
  margin-bottom: 8px;
}

.varianceToggleBtn {
  border: 1px solid #9ca3af;
  background: #f8fafc;
  color: #111827;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.varianceToggleBtn.on {
  border-color: #0ea5e9;
  background: #e0f2fe;
  color: #0c4a6e;
}

.dumbbellSplitWrap {
  display: grid;
  grid-template-columns: 2fr 1.2fr;
  gap: 12px;
  align-items: stretch;
}

.dumbbellMainWrap {
  height: 360px;
  min-height: 320px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.55);
  padding: 4px;
}

.dumbbellDetailWrap {
  height: 360px;
  min-height: 320px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.8);
  padding: 8px;
  display: flex;
  flex-direction: column;
}

.detailTitle {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}

.detailEmpty {
  height: 100%;
  border: 1px dashed #9ca3af;
  border-radius: 8px;
  display: grid;
  place-items: center;
  text-align: center;
  padding: 12px;
  color: #4b5563;
  font-size: 12px;
}

.panel.narrow {
  min-height: 0;
}
</style>
