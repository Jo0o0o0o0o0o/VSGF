<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import TraitLineChart from "@/components/TraitLineChart.vue";
import HeatedMap from "@/components/HeatedMap.vue";
import BeeswarmPlot from "@/components/BeeWarmPlot.vue";
import CompareView from "@/views/ComparePerson.vue";
import { IVIS_RATING_KEYS, type IvisRecord } from "@/types/ivis23";
import { COMPARE_PERSON_EVENT, readComparePersonId, writeComparePersonId } from "@/utils/compareSelection";
import {
  getActiveRecords,
  GROUPING_CONFIRMED_EVENT,
  GROUPING_UPDATED_EVENT,
  makeYearStorageKey,
} from "@/types/dataSource";

const beeswarmSectionRef = ref<HTMLElement | null>(null);
const ivisRecords = getActiveRecords() as IvisRecord[];
const GROUPING_STORAGE_KEY = makeYearStorageKey("grouping_v1");
const GROUPING_CONFIRM_STORAGE_KEY = makeYearStorageKey("grouping_confirmed_v1");

type StoredGrouping = {
  version: 2;
  preferredGroupSize: 4 | 5;
  groups: Array<{
    id: number;
    memberIds: Array<number | null>;
  }>;
};

type LegacyStoredGrouping = {
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
    version: 2,
    preferredGroupSize: 5,
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
    const maybeV2 = parsed as Partial<StoredGrouping>;
    const maybeV1 = parsed as Partial<LegacyStoredGrouping>;
    const isV2 = maybeV2.version === 2 && Array.isArray(maybeV2.groups);
    const isV1 = maybeV1.version === 1 && Array.isArray(maybeV1.groups);
    if (!isV2 && !isV1) {
      return buildDefaultGrouping(ivisRecords.length);
    }
    const rawGroups = (isV2 ? maybeV2.groups : maybeV1.groups) ?? [];
    return {
      version: 2,
      preferredGroupSize: maybeV2.preferredGroupSize === 4 ? 4 : 5,
      groups: rawGroups
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
const confirmedGroupIds = ref<number[]>([]);
const heatmapGroupMode = ref<"all" | "confirmed">("all");
const selectedGroupId = ref<number | null>(null);
const selectedComparePersonId = ref<number | null>(null);
const selectedBeeswarmPersonId = ref<number | null>(null);
const compareDrawerOpen = ref(false);
const beeswarmUseCategoryX = ref(false);
const moveMenu = ref<{ studentId: number; alias: string; x: number; y: number } | null>(null);
function readStoredConfirmedGroupIds() {
  try {
    const raw = localStorage.getItem(GROUPING_CONFIRM_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return [];
    const maybe = parsed as { confirmedGroupIds?: unknown };
    if (!Array.isArray(maybe.confirmedGroupIds)) return [];
    return maybe.confirmedGroupIds.filter((id): id is number => typeof id === "number");
  } catch {
    return [];
  }
}

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
  const confirmedOnly = heatmapGroupMode.value === "confirmed";
  const confirmedSet = new Set(confirmedGroupIds.value);
  const grouped: IvisRecord[] = [];

  for (const group of storedGrouping.value.groups) {
    if (confirmedOnly && !confirmedSet.has(group.id)) continue;
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

  if (grouped.length) {
    const averageRatings = IVIS_RATING_KEYS.reduce((acc, key) => {
      const total = grouped.reduce((sum, groupRecord) => sum + Number(groupRecord.ratings[key] ?? 0), 0);
      acc[key] = Number((total / grouped.length).toFixed(2));
      return acc;
    }, {} as IvisRecord["ratings"]);

    return [
      ...grouped,
      {
        id: -1,
        alias: `Average (${grouped.length} groups)`,
        time_year: "grouped",
        hobby_raw: "",
        hobby: [],
        hobby_area: [],
        ratings: averageRatings,
      },
    ];
  }
  return confirmedOnly ? [] : ivisRecords;
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
  compareDrawerOpen.value = true;
}

function findMemberLocation(studentId: number) {
  for (const group of storedGrouping.value.groups) {
    const slotIndex = group.memberIds.findIndex((id) => id === studentId);
    if (slotIndex >= 0) return { groupId: group.id, slotIndex };
  }
  return null;
}

function openMoveMenu(member: IvisRecord, ev: MouseEvent) {
  ev.preventDefault();
  const menuWidth = 240;
  const menuHeight = 280;
  const pad = 12;
  const x = Math.min(ev.clientX + 8, window.innerWidth - menuWidth - pad);
  const y = Math.min(ev.clientY + 8, window.innerHeight - menuHeight - pad);
  moveMenu.value = {
    studentId: member.id,
    alias: member.alias,
    x: Math.max(pad, x),
    y: Math.max(pad, y),
  };
}

function closeMoveMenu() {
  moveMenu.value = null;
}

const moveMenuStyle = computed(() => {
  if (!moveMenu.value) return {};
  return {
    left: `${moveMenu.value.x}px`,
    top: `${moveMenu.value.y}px`,
  };
});

const moveMenuTargets = computed(() => {
  const studentId = moveMenu.value?.studentId;
  return storedGrouping.value.groups.map((group) => {
    const used = group.memberIds.filter((id) => typeof id === "number").length;
    const emptySlotIndex = group.memberIds.findIndex((id) => id === null);
    const isCurrent = typeof studentId === "number" && group.memberIds.includes(studentId);
    const isFull = emptySlotIndex < 0;
    const disabled = isCurrent || isFull;
    const statusText = isCurrent ? "Current" : isFull ? "Full" : `${used}/${group.memberIds.length}`;
    return { id: group.id, disabled, emptySlotIndex, statusText };
  });
});

function moveMemberToGroup(targetGroupId: number) {
  const menu = moveMenu.value;
  if (!menu) return;

  const source = findMemberLocation(menu.studentId);
  if (!source) {
    closeMoveMenu();
    return;
  }
  if (source.groupId === targetGroupId) {
    closeMoveMenu();
    return;
  }

  const targetGroup = storedGrouping.value.groups.find((g) => g.id === targetGroupId);
  if (!targetGroup) return;
  const emptySlotIndex = targetGroup.memberIds.findIndex((id) => id === null);
  if (emptySlotIndex < 0) return;

  const sourceGroup = storedGrouping.value.groups.find((g) => g.id === source.groupId);
  if (!sourceGroup) return;

  sourceGroup.memberIds[source.slotIndex] = null;
  targetGroup.memberIds[emptySlotIndex] = menu.studentId;

  try {
    localStorage.setItem(GROUPING_STORAGE_KEY, JSON.stringify(storedGrouping.value));
    window.dispatchEvent(new Event(GROUPING_UPDATED_EVENT));
  } catch {
    // ignore storage failures
  }

  closeMoveMenu();
}

function onSelectBeeswarmPerson(personId: number) {
  selectedBeeswarmPersonId.value = personId;
  selectedComparePersonId.value = personId;
  writeComparePersonId(personId);
  compareDrawerOpen.value = true;
}

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
const beeswarmCategoryTraitGroups: Record<string, readonly (typeof IVIS_RATING_KEYS)[number][]> = {
  build: [
    "programming",
    "code_repository",
    "computer_graphics_programming",
    "human_computer_interaction_programming",
    "computer_usage",
  ],
  think_vis: ["statistical", "mathematics", "information_visualization"],
  design: ["user_experience_evaluation", "drawing_and_artistic"],
  team_collaboration: ["communication", "collaboration"],
};
const beeswarmCategoryLabels: Record<string, string> = {
  build: "Build",
  think_vis: "Think + Vis",
  design: "Design",
  team_collaboration: "Team Collaboration",
};
const beeswarmTraits = computed(() =>
  beeswarmUseCategoryX.value ? Object.keys(beeswarmCategoryTraitGroups) : [...IVIS_RATING_KEYS],
);
const beeswarmTraitGroups = computed(() =>
  beeswarmUseCategoryX.value ? beeswarmCategoryTraitGroups : undefined,
);
const beeswarmXAxisLabels = computed(() =>
  beeswarmUseCategoryX.value ? beeswarmCategoryLabels : beeswarmTraitLabels,
);

onMounted(() => {
  storedGrouping.value = readStoredGrouping();
  confirmedGroupIds.value = readStoredConfirmedGroupIds();
  selectedComparePersonId.value = readComparePersonId();
  selectedBeeswarmPersonId.value = selectedComparePersonId.value;
  window.addEventListener("storage", onGroupingStorageChanged);
  window.addEventListener(GROUPING_UPDATED_EVENT, onGroupingStorageChanged);
  window.addEventListener(GROUPING_CONFIRMED_EVENT, onGroupingStorageChanged);
  window.addEventListener(COMPARE_PERSON_EVENT, onCompareSelectionChanged);
  document.addEventListener("mousedown", onGlobalPointerDown);
  document.addEventListener("keydown", onGlobalEsc);
});

onBeforeUnmount(() => {
  window.removeEventListener("storage", onGroupingStorageChanged);
  window.removeEventListener(GROUPING_UPDATED_EVENT, onGroupingStorageChanged);
  window.removeEventListener(GROUPING_CONFIRMED_EVENT, onGroupingStorageChanged);
  window.removeEventListener(COMPARE_PERSON_EVENT, onCompareSelectionChanged);
  document.removeEventListener("mousedown", onGlobalPointerDown);
  document.removeEventListener("keydown", onGlobalEsc);
});

function onGroupingStorageChanged() {
  storedGrouping.value = readStoredGrouping();
  confirmedGroupIds.value = readStoredConfirmedGroupIds();
  selectedComparePersonId.value = readComparePersonId();
  selectedBeeswarmPersonId.value = selectedComparePersonId.value;
  closeMoveMenu();
}

function onCompareSelectionChanged() {
  selectedComparePersonId.value = readComparePersonId();
  selectedBeeswarmPersonId.value = selectedComparePersonId.value;
}

function closeCompareDrawer() {
  compareDrawerOpen.value = false;
}

function onGlobalPointerDown(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest(".globalMoveTip")) return;
  closeMoveMenu();
}

function onGlobalEsc(event: KeyboardEvent) {
  if (event.key === "Escape") {
    closeMoveMenu();
  }
}
</script>

<template>
  <div class="home">
    <!-- 濞戞挸锕鐗堢▔婢跺﹥鍋ラ柛妤嬬磿婢ф牠鏁?-->
    <section class="top">
      <div class="card level-1 right">
        <div class="title">Temperament traits</div>
        <div class="traitArea">
          <TraitLineChart @selectPerson="onSelectBeeswarmPerson" />
        </div>
      </div>
    </section>

    <!-- 濞戞挸顑嗛弻鐔兼晬濮橆兙浜?scatter + 闁告瑥鍘栭弲鍫曞礆濡ゅ嫨鈧?-->
    <section class="bottom">
      <div class="card level-1 scatter">
        <div class="heatmapHeader">
          <div class="title">Groups overview</div>
          <div class="heatmapToggle" role="group" aria-label="toggle groups display mode">
            <button
              class="heatmapToggleBtn"
              :class="{ active: heatmapGroupMode === 'all' }"
              type="button"
              @click="heatmapGroupMode = 'all'"
            >
              All groups
            </button>
            <button
              class="heatmapToggleBtn"
              :class="{ active: heatmapGroupMode === 'confirmed' }"
              type="button"
              @click="heatmapGroupMode = 'confirmed'"
            >
              Confirmed only
            </button>
          </div>
        </div>

        <div class="plotArea">
          <HeatedMap
            :records="heatmapRecords"
            :ratingKeys="IVIS_RATING_KEYS"
            @selectRow="onSelectHeatGroup"
          />
        </div>
      </div>

      <div class="card level-1 list">
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
            <div
              class="name"
              @contextmenu.prevent.stop="openMoveMenu(member, $event)"
            >{{ member.alias }}</div>
            <div class="memberMeta">{{ member.hobby_area.join(", ") || "No hobby area" }}</div>
          </div>

          <div v-if="selectedGroupMembers.length === 0" class="empty">
            Click a group row in the heatmap to see members.
          </div>
        </div>
      </div>
    </section>
    <section id="beeswarm-section" ref="beeswarmSectionRef" class="beeswarmSection">
      <div class="card level-1 beeswarm">
        <div class="beeswarmHeader">
          <div class="title">Trait distribution (beeswarm)</div>
          <div class="heatmapToggle" role="group" aria-label="toggle beeswarm x-axis mode">
            <button
              class="heatmapToggleBtn"
              :class="{ active: !beeswarmUseCategoryX }"
              type="button"
              @click="beeswarmUseCategoryX = false"
            >
              Current
            </button>
            <button
              class="heatmapToggleBtn"
              :class="{ active: beeswarmUseCategoryX }"
              type="button"
              @click="beeswarmUseCategoryX = true"
            >
              4D Set
            </button>
          </div>
        </div>
        <div class="plotArea beeswarmArea">
          <BeeswarmPlot
            :records="ivisRecords"
            :traits="beeswarmTraits"
            :traitLabels="beeswarmXAxisLabels"
            :traitGroups="beeswarmTraitGroups"
            :highlightId="selectedBeeswarmPersonId"
            
            @selectPerson="onSelectBeeswarmPerson"
          />
        </div>
      </div>
    </section>

    <div
      v-if="compareDrawerOpen"
      class="compareBackdrop"
      @click="closeCompareDrawer"
    ></div>
    <aside class="compareDrawer" :class="{ open: compareDrawerOpen }">
      <button class="compareDrawerClose" type="button" aria-label="close compare" @click="closeCompareDrawer">
        x
      </button>
      <CompareView />
    </aside>

    <div
      v-if="moveMenu"
      class="globalMoveTip"
      :style="moveMenuStyle"
      @click.stop
    >
      <div class="globalMoveTitle">Move {{ moveMenu.alias }} to group</div>
      <div class="globalMoveList">
        <button
          v-for="target in moveMenuTargets"
          :key="target.id"
          class="globalMoveItem"
          :disabled="target.disabled"
          type="button"
          @click="moveMemberToGroup(target.id)"
        >
          <span>Move to Group {{ target.id }}</span>
          <span class="globalMoveMeta">{{ target.statusText }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.beeswarmSection {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.heatmapHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.heatmapHeader .title {
  margin-bottom: 0;
}

.beeswarmHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.beeswarmHeader .title {
  margin-bottom: 0;
}

.heatmapToggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.heatmapToggleBtn {
  border: 1px solid #c8cdd5;
  background: #ffffff;
  color: #374151;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.heatmapToggleBtn.active {
  border-color: #1f8a53;
  background: #dff3e7;
  color: #166534;
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
  height: 660px; /* 濡ゅ倹锚鐎规娊宕堕崫鍕毎濞戞挸绉磋ぐ?*/
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
  overflow-y: auto; /* 濞戞挸顑嗘刊鍝勵煥濮橆剙袟 */
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

/* 闂侇偄顦懙鎴烆殗濡懓鐦?*/
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

.compareBackdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.18);
  z-index: 80;
}

.compareDrawer {
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  width: min(54vw, 860px);
  background: #f7f7f7;
  border-right: 1px solid #d1d5db;
  transform: translateX(-100%);
  transition: transform 0.24s ease;
  z-index: 90;
  overflow: auto;
}

.compareDrawer.open {
  transform: translateX(0);
}

.compareDrawerClose {
  position: sticky;
  top: 8px;
  margin-left: auto;
  margin-right: 8px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: #111827;
  color: #fff;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: grid;
  place-items: center;
  z-index: 3;
}

.globalMoveTip {
  position: fixed;
  width: 240px;
  max-height: 320px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.14);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14);
  z-index: 1200;
  overflow: hidden;
}

.globalMoveTitle {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  font-size: 13px;
  font-weight: 700;
  color: #334155;
}

.globalMoveList {
  padding: 6px;
  display: grid;
  gap: 6px;
  max-height: 260px;
  overflow: auto;
}

.globalMoveItem {
  width: 100%;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  background: #f8fafc;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  color: #0f172a;
  text-align: left;
  cursor: pointer;
}

.globalMoveItem:hover:not(:disabled) {
  background: #e6eef7;
}

.globalMoveItem:disabled {
  background: #f1f5f9;
  color: #94a3b8;
  cursor: not-allowed;
  opacity: 0.95;
}

.globalMoveMeta {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
}


</style>




