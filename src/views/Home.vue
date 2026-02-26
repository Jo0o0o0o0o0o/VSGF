<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import ivisRecordsJson from "@/data/IVIS23_final.json";
import TraitLineChart from "@/components/TraitLineChart.vue";
import HeatedMap from "@/components/HeatedMap.vue";
import BeeswarmPlot from "@/components/BeeWarmPlot.vue";
import { IVIS_RATING_KEYS, type IvisRecord } from "@/types/ivis23";
import { COMPARE_PERSON_EVENT, readComparePersonId, writeComparePersonId } from "@/utils/compareSelection";

const beeswarmSectionRef = ref<HTMLElement | null>(null);
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
const selectedGroupId = ref<number | null>(null);
const selectedComparePersonId = ref<number | null>(null);
const selectedBeeswarmPersonId = ref<number | null>(null);

const groupedMembersById = computed(() => {
  const byId = new Map(ivisRecords.map((r) => [r.id, r] as const));
  const usedMemberIds = new Set<number>();
  const grouped = new Map<number, IvisRecord[]>();

  for (const group of storedGrouping.value.groups) {
    const members: IvisRecord[] = [];
    for (const id of group.memberIds) {
      if (typeof id !== "number" || usedMemberIds.has(id)) continue;
      const member = byId.get(id);
      if (!member) continue;
      usedMemberIds.add(id);
      members.push(member);
    }
    grouped.set(group.id, members);
  }

  return grouped;
});

const heatmapRecords = computed<IvisRecord[]>(() => {
  const grouped: IvisRecord[] = [];

  for (const group of storedGrouping.value.groups) {
    const members = groupedMembersById.value.get(group.id) ?? [];
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

const selectedGroupMembers = computed<IvisRecord[]>(() => {
  if (selectedGroupId.value === null) return [];
  return groupedMembersById.value.get(selectedGroupId.value) ?? [];
});

const selectedGroupLabel = computed(() => {
  if (selectedGroupId.value === null) return "Group";
  const group = heatmapRecords.value.find((item) => item.id === selectedGroupId.value);
  return group?.alias ?? `Group ${selectedGroupId.value}`;
});

watch(
  heatmapRecords,
  (records) => {
    if (!records.length) {
      selectedGroupId.value = null;
      return;
    }
    if (selectedGroupId.value === null || !records.some((r) => r.id === selectedGroupId.value)) {
      selectedGroupId.value = records[0]?.id ?? null;
    }
  },
  { immediate: true },
);

function onSelectHeatGroup(groupId: number) {
  selectedGroupId.value = groupId;
}

function onChooseGroupMember(memberId: number) {
  selectedComparePersonId.value = memberId;
  selectedBeeswarmPersonId.value = memberId;
  writeComparePersonId(memberId);
}

function onSelectBeeswarmPerson(personId: number) {
  selectedBeeswarmPersonId.value = personId;
  selectedComparePersonId.value = personId;
  writeComparePersonId(personId);
}

const beeswarmTraits = computed(() => [...IVIS_RATING_KEYS]);
const beeswarmTraitLabels: Record<string, string> = {
  information_visualization: "Information Visualization",
  statistical: "Statistical",
  mathematics: "Mathematics",
  drawing_and_artistic: "Drawing and Artistic",
  computer_usage: "Computer Usage",
  programming: "Programming",
  computer_graphics_programming: "Computer Graphics Programming",
  human_computer_interaction_programming: "HCI Programming",
  user_experience_evaluation: "UX Evaluation",
  communication: "Communication",
  collaboration: "Collaboration",
  code_repository: "Code Repository",
};

onMounted(() => {
  storedGrouping.value = readStoredGrouping();
  selectedComparePersonId.value = readComparePersonId();
  selectedBeeswarmPersonId.value = selectedComparePersonId.value;
  window.addEventListener("storage", onGroupingStorageChanged);
  window.addEventListener(GROUPING_UPDATED_EVENT, onGroupingStorageChanged);
  window.addEventListener(COMPARE_PERSON_EVENT, onCompareSelectionChanged);
});

onBeforeUnmount(() => {
  window.removeEventListener("storage", onGroupingStorageChanged);
  window.removeEventListener(GROUPING_UPDATED_EVENT, onGroupingStorageChanged);
  window.removeEventListener(COMPARE_PERSON_EVENT, onCompareSelectionChanged);
});

function onGroupingStorageChanged() {
  storedGrouping.value = readStoredGrouping();
  selectedComparePersonId.value = readComparePersonId();
  selectedBeeswarmPersonId.value = selectedComparePersonId.value;
}

function onCompareSelectionChanged() {
  selectedComparePersonId.value = readComparePersonId();
  selectedBeeswarmPersonId.value = selectedComparePersonId.value;
}
</script>

<template>
  <div class="home">
    <!-- 娑撳﹪娼版稉澶婃健閸楋紕澧栭敓?-->
    <section class="top">
      <div class="card right">
        <div class="title">Temperament traits</div>
        <div class="traitArea">
          <TraitLineChart />
        </div>
      </div>
    </section>

    <!-- 娑撳鏌熼敍姘亣 scatter + 閸欏厖鏅堕崚妤勩€?-->
    <section class="bottom">
      <div class="card scatter">
        <div class="title">Groups overview</div>

        <div class="plotArea">
          <HeatedMap
            :records="heatmapRecords"
            :ratingKeys="IVIS_RATING_KEYS"
            @selectRow="onSelectHeatGroup"
          />
        </div>
      </div>

      <div class="card list">
        <div class="listHeader">
          <div class="title">{{ selectedGroupLabel }}</div>
          <div class="subtitle">{{ selectedGroupMembers.length }} members</div>
        </div>

        <div class="listBody">
          <div
            v-for="member in selectedGroupMembers"
            :key="member.id"
            class="row memberRow"
            @click="onChooseGroupMember(member.id)"
          >
            <div class="name">{{ member.alias }}</div>
            <div class="memberMeta">{{ member.hobby_area.join(", ") || "No hobby area" }}</div>
          </div>

          <div v-if="selectedGroupMembers.length === 0" class="empty">
            Click a group row in the heatmap to see members.
          </div>
        </div>
      </div>
    </section>
    <section id="beeswarm-section" ref="beeswarmSectionRef" class="beeswarmSection">
      <div class="card beeswarm">

        <div class="plotArea beeswarmArea">
          <BeeswarmPlot
            :records="ivisRecords"
            :traits="beeswarmTraits"
            :traitLabels="beeswarmTraitLabels"
            :highlightId="selectedBeeswarmPersonId"
            
            @selectPerson="onSelectBeeswarmPerson"
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
  grid-template-columns: 1fr;
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
  height: 420px;
  width: 100%;
}
.scatter .plotArea {
  height: 660px;
}

.card.list {
  height: 660px; /* 妤傛ê瀹抽崶鍝勭暰娑撳秴褰?*/
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
  overflow-y: auto; /* 娑撳濯哄姘З */
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

/* 闁鑵戞妯瑰瘨 */
.row.active {
  background: #ffdf5d;
}

.memberRow {
  grid-template-columns: 1fr;
  border-radius: 14px;
  cursor: default;
}

.memberRow::after {
  content: none;
}

.memberMeta {
  margin-top: 4px;
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}


</style>


