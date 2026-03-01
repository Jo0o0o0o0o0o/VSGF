<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import GroupDetails from "@/views/GroupDetails.vue";
import CompareView from "@/views/ComparePerson.vue";
import studentsRaw from "../data/IVIS23_final.json";
import type { IvisRecord } from "@/types/ivis23";
import { formatHobbyLabel, getHobbyTagStyle } from "@/utils/hobbyTagColorMap";
import { writeComparePersonId } from "@/utils/compareSelection";

type Student = IvisRecord;

type Group = {
  id: number;
  members: Array<Student | null>;
};

type StoredGrouping = {
  version: 1;
  groups: Array<{
    id: number;
    memberIds: Array<number | null>;
  }>;
};

const GROUPING_STORAGE_KEY = "ivis23_grouping_v1";
const GROUPING_UPDATED_EVENT = "ivis23-grouping-updated";

const students = studentsRaw as Student[];

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

const groups = ref<Group[]>(
  buildGroupSlotSizes(students.length).map((size, index) => ({
    id: index + 1,
    members: Array(size).fill(null),
  }))
);

const activeTip = ref<{ groupId: number; slotIndex: number } | null>(null);
const detailsGroupId = ref<number | null>(null);
const detailsOpen = ref(false);
const compareDrawerOpen = ref(false);
const draggingStudentId = ref<number | null>(null);
const dragOverSlot = ref<
  { groupId: number; slotIndex: number; mode: "add" | "replace" } | null
>(null);

const usedStudentIds = computed(() => {
  const ids = new Set<number>();
  groups.value.forEach((group) => {
    group.members.forEach((member) => {
      if (member) {
        ids.add(member.id);
      }
    });
  });
  return ids;
});

const availableStudents = computed(() =>
  students.filter((student) => !usedStudentIds.value.has(student.id))
);
const slotSearchQuery = ref<Record<string, string>>({});

function slotKey(groupId: number, slotIndex: number) {
  return `${groupId}-${slotIndex}`;
}

function getFilteredStudents(groupId: number, slotIndex: number) {
  const q = (slotSearchQuery.value[slotKey(groupId, slotIndex)] ?? "").trim().toLowerCase();
  if (!q) return availableStudents.value;
  return availableStudents.value.filter((student) => {
    return student.alias.toLowerCase().includes(q) || String(student.id).includes(q);
  });
}

function toggleTip(groupId: number, slotIndex: number) {
  if (
    activeTip.value?.groupId === groupId &&
    activeTip.value.slotIndex === slotIndex
  ) {
    activeTip.value = null;
    return;
  }
  slotSearchQuery.value[slotKey(groupId, slotIndex)] = "";
  activeTip.value = { groupId, slotIndex };
}

function addMember(groupId: number, slotIndex: number, student: Student) {
  const group = groups.value.find((item) => item.id === groupId);
  if (!group) return;
  group.members[slotIndex] = student;
  slotSearchQuery.value[slotKey(groupId, slotIndex)] = "";
  activeTip.value = null;
}

function removeMember(groupId: number, slotIndex: number) {
  const group = groups.value.find((item) => item.id === groupId);
  if (!group) return;
  group.members[slotIndex] = null;
}

function onStudentDragStart(studentId: number, ev: DragEvent) {
  draggingStudentId.value = studentId;
  if (ev.dataTransfer) {
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData("text/plain", String(studentId));
  }
}

function onStudentDragEnd() {
  draggingStudentId.value = null;
  dragOverSlot.value = null;
}

function onSlotDragOver(groupId: number, slotIndex: number, ev: DragEvent) {
  const group = groups.value.find((item) => item.id === groupId);
  const studentId = draggingStudentId.value;
  const student = typeof studentId === "number" ? students.find((item) => item.id === studentId) : null;

  if (!group || typeof studentId !== "number" || !student) return;
  if (usedStudentIds.value.has(studentId)) return;

  ev.preventDefault();
  if (ev.dataTransfer) {
    ev.dataTransfer.dropEffect = "move";
  }
  dragOverSlot.value = {
    groupId,
    slotIndex,
    mode: group.members[slotIndex] ? "replace" : "add",
  };
}

function onSlotDragLeave(groupId: number, slotIndex: number) {
  if (
    dragOverSlot.value?.groupId === groupId &&
    dragOverSlot.value.slotIndex === slotIndex
  ) {
    dragOverSlot.value = null;
  }
}

function onSlotDrop(groupId: number, slotIndex: number, ev: DragEvent) {
  ev.preventDefault();
  const studentId =
    typeof draggingStudentId.value === "number"
      ? draggingStudentId.value
      : Number(ev.dataTransfer?.getData("text/plain"));

  if (typeof studentId !== "number" || !Number.isFinite(studentId)) {
    dragOverSlot.value = null;
    return;
  }

  const group = groups.value.find((item) => item.id === groupId);
  const student = students.find((item) => item.id === studentId);
  const isAlreadyUsed = usedStudentIds.value.has(studentId);

  if (!group || !student || isAlreadyUsed) {
    dragOverSlot.value = null;
    return;
  }

  group.members[slotIndex] = student;
  activeTip.value = null;
  dragOverSlot.value = null;
  draggingStudentId.value = null;
}

const selectedGroup = computed(() =>
  detailsGroupId.value === null
    ? null
    : groups.value.find((group) => group.id === detailsGroupId.value) ?? null,
);

const selectedGroupMembers = computed<IvisRecord[]>(() =>
  selectedGroup.value
    ? (selectedGroup.value.members.filter((member) => Boolean(member)) as IvisRecord[])
    : [],
);

const groupHobbiesMap = computed(() => {
  const byGroupId = new Map<number, string[]>();
  groups.value.forEach((group) => {
    const hobbies = new Set<string>();
    group.members.forEach((member) => {
      if (!member) return;
      member.hobby_area.forEach((hobby) => {
        const key = hobby.trim().toLowerCase();
        if (key) hobbies.add(key);
      });
    });
    byGroupId.set(group.id, Array.from(hobbies).sort((a, b) => a.localeCompare(b)));
  });
  return byGroupId;
});

const activeDragGroupId = computed<number | null>(() => dragOverSlot.value?.groupId ?? null);

function openGroupDetails(groupId: number) {
  detailsGroupId.value = groupId;
  detailsOpen.value = true;
  activeTip.value = null;
}

function closeGroupDetails() {
  detailsOpen.value = false;
}

function openCompareDrawer(memberId: number) {
  writeComparePersonId(memberId);
  compareDrawerOpen.value = true;
}

function closeCompareDrawer() {
  compareDrawerOpen.value = false;
}

function readStoredGrouping(): StoredGrouping | null {
  try {
    const raw = localStorage.getItem(GROUPING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const maybe = parsed as Partial<StoredGrouping>;
    if (maybe.version !== 1 || !Array.isArray(maybe.groups)) return null;
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
    return null;
  }
}

function applyStoredGrouping(stored: StoredGrouping) {
  const byId = new Map(students.map((s) => [s.id, s] as const));
  const used = new Set<number>();

  groups.value.forEach((group) => {
    const saved = stored.groups.find((g) => g.id === group.id);
    if (!saved) return;

    for (let i = 0; i < group.members.length; i += 1) {
      const memberId = saved.memberIds[i];
      if (typeof memberId !== "number" || used.has(memberId)) continue;
      const student = byId.get(memberId);
      if (!student) continue;
      group.members[i] = student;
      used.add(memberId);
    }
  });
}

function persistGrouping() {
  try {
    const payload: StoredGrouping = {
      version: 1,
      groups: groups.value.map((group) => ({
        id: group.id,
        memberIds: group.members.map((member) => member?.id ?? null),
      })),
    };
    localStorage.setItem(GROUPING_STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new Event(GROUPING_UPDATED_EVENT));
  } catch {
    // ignore storage failures
  }
}

onMounted(() => {
  const stored = readStoredGrouping();
  if (stored) {
    applyStoredGrouping(stored);
  }
  persistGrouping();
});

watch(
  groups,
  () => {
    persistGrouping();
  },
  { deep: true }
);
</script>

<template>
  <div class="groupingLayout">
    <section class="unassignedSection">
      <div class="unassignedHeader">Select People</div>
      <div class="unassignedGrid">
        <div
          v-for="student in availableStudents"
          :key="`unassigned-${student.id}`"
          class="personBlock"
          :class="{ dragging: draggingStudentId === student.id }"
          draggable="true"
          @dragstart="onStudentDragStart(student.id, $event)"
          @dragend="onStudentDragEnd"
        >
          {{ student.alias }}
        </div>
        <div v-if="availableStudents.length === 0" class="unassignedEmpty">
          All people are grouped.
        </div>
      </div>
    </section>

    <main class="groupingPage">
    <section
      v-for="group in groups"
      :key="group.id"
      class="groupRow"
      :class="{ dropGroupActive: activeDragGroupId === group.id }"
    >
      <div class="groupHeader">
        <span class="groupId">{{ group.id }}</span>
        <div class="chipRow">
          <span
            v-for="hobby in groupHobbiesMap.get(group.id) ?? []"
            :key="`group-${group.id}-${hobby}`"
            class="chip"
            :style="getHobbyTagStyle(hobby)"
          >
            {{ formatHobbyLabel(hobby) }}
          </span>
          <span v-if="(groupHobbiesMap.get(group.id)?.length ?? 0) === 0" class="chip chipEmpty">
            No hobbies yet
          </span>
        </div>
      </div>

      <div class="slotRow" :style="{ '--slot-count': group.members.length }">
        <div
          v-for="(member, slotIndex) in group.members"
          :key="slotIndex"
          class="slotCardWrap"
          :class="{
            slotDropActive:
              dragOverSlot?.groupId === group.id && dragOverSlot.slotIndex === slotIndex,
            slotReplaceActive:
              dragOverSlot?.groupId === group.id &&
              dragOverSlot.slotIndex === slotIndex &&
              dragOverSlot.mode === 'replace',
          }"
          @dragover="onSlotDragOver(group.id, slotIndex, $event)"
          @dragleave="onSlotDragLeave(group.id, slotIndex)"
          @drop="onSlotDrop(group.id, slotIndex, $event)"
        >
          <button
            class="slotCard"
            type="button"
            @click="member && openCompareDrawer(member.id)"
          >
            <div v-if="member" class="memberContent">
              <span class="memberAlias">{{ member.alias }}</span>
              <div class="memberHobbyRow">
                <span
                  v-for="hobby in member.hobby_area"
                  :key="`member-${member.id}-${hobby}`"
                  class="memberHobbyChip"
                  :style="getHobbyTagStyle(hobby)"
                >
                  {{ formatHobbyLabel(hobby) }}
                </span>
                <span v-if="member.hobby_area.length === 0" class="memberHobbyChip memberHobbyEmpty">
                  No hobby
                </span>
              </div>
            </div>
            <span v-else class="plusMark">+</span>
          </button>

          <button
            v-if="member"
            class="removeBtn"
            type="button"
            aria-label="remove member"
            @click.stop="removeMember(group.id, slotIndex)"
          >
            x
          </button>

          <button
            class="slotPicker"
            type="button"
            @click="toggleTip(group.id, slotIndex)"
          >
            <span class="slotPickerText">
              {{ member ? `${member.alias} (#${member.id})` : "choose people" }}
            </span>
            <span class="slotPickerCaret">˅</span>
          </button>

          <div
            v-if="
              activeTip?.groupId === group.id && activeTip.slotIndex === slotIndex
            "
            class="topTip"
          >
            <div class="tipSearchWrap">
              <input
                v-model="slotSearchQuery[slotKey(group.id, slotIndex)]"
                class="tipSearchInput"
                type="text"
                placeholder="Search people..."
              />
            </div>
            <div v-if="getFilteredStudents(group.id, slotIndex).length" class="tipList">
              <button
                v-for="student in getFilteredStudents(group.id, slotIndex)"
                :key="student.id"
                class="tipItem"
                type="button"
                @click="addMember(group.id, slotIndex, student)"
              >
                {{ student.alias }}
              </button>
            </div>
            <p v-else class="tipEmpty">No matched student</p>
          </div>
        </div>
        <button
          class="nextBtn"
          type="button"
          aria-label="open group details"
          @click="openGroupDetails(group.id)"
        >
          &#8594;
        </button>
      </div>

      <div class="footerBar"></div>
    </section>

    <div v-if="detailsOpen" class="drawerBackdrop" @click="closeGroupDetails"></div>
    <aside class="detailsDrawer" :class="{ open: detailsOpen }">
      <button class="drawerClose" type="button" aria-label="close details" @click="closeGroupDetails">
        x</button>

      <GroupDetails
        v-if="selectedGroup"
        compact
        :panelTitle="`Group ${selectedGroup.id} Details`"
        :groupMembers="selectedGroupMembers"
      />
    </aside>

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
  </main>
  </div>
</template>

<style scoped>
.groupingLayout {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.groupingPage {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.unassignedSection {
  background: #d2d2d4;
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.unassignedHeader {
  font-size: 14px;
  font-weight: 700;
  color: #111;
  letter-spacing: 0.02em;
}

.unassignedGrid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.personBlock {
  background: #ffffff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  width: 92px;
  aspect-ratio: 1 / 1;
  display: grid;
  place-items: center;
  text-align: center;
  padding: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  line-height: 1.2;
  overflow: hidden;
  word-break: break-word;
  cursor: grab;
  user-select: none;
}

.personBlock.dragging {
  opacity: 0.45;
  cursor: grabbing;
}

.unassignedEmpty {
  font-size: 12px;
  color: #4b5563;
}

.groupRow {
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: box-shadow 0.16s ease;
}

.groupRow.dropGroupActive {
  box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.25);
  border-radius: 8px;
}

.groupHeader {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 26px;
}

.groupId {
  font-size: 30px;
  line-height: 1;
  color: #222;
  font-weight: 500;
}

.chipRow {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.chip {
  min-height: 28px;
  border-radius: 999px;
  background: #d2d2d4;
  border: 1px solid transparent;
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.chipEmpty {
  color: #666;
  background: #ececec;
  border-color: #d3d3d3;
}

.slotRow {
  display: grid;
  grid-template-columns: repeat(var(--slot-count), minmax(120px, 1fr)) 36px;
  gap: 16px;
  align-items: stretch;
}

.slotCardWrap {
  position: relative;
  background: #dddddf;
  border-radius: 14px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.slotCardWrap.slotDropActive .slotCard {
  outline: 2px dashed #3b82f6;
  outline-offset: -4px;
  background: #dde9ff;
}

.slotCardWrap.slotReplaceActive .slotCard {
  outline: 2px dashed #ef4444;
  outline-offset: -4px;
  background: #fee2e2;
}

.slotCard {
  width: 100%;
  border: none;
  cursor: pointer;
  aspect-ratio: 1 / 1;
  background: #d2d2d4;
  position: relative;
  overflow: hidden;
  display: grid;
  place-items: center;
  border-radius: 14px;
}

.memberContent {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
}

.memberAlias {
  font-size: clamp(16px, 2vw, 34px);
  line-height: 1.2;
  color: #111;
  font-weight: 600;
  padding: 10px 8px 48px;
  text-align: center;
  word-break: break-word;
}

.memberHobbyRow {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  display: flex;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 6px;
}

.memberHobbyChip {
  min-height: 20px;
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 2px 8px;
  font-size: 10px;
  line-height: 1;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.memberHobbyEmpty {
  color: #666;
  background: #ececec;
  border-color: #d3d3d3;
}

.plusMark {
  font-size: clamp(48px, 8vw, 78px);
  line-height: 1;
  color: #000;
  font-weight: 300;
}

.removeBtn {
  position: absolute;
  top: 18px;
  right: 18px;
  border: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.slotPicker {
  border: 1px solid #c8c8cd;
  background: #efefef;
  border-radius: 10px;
  min-height: 38px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  cursor: pointer;
}

.slotPickerText {
  font-size: 18px;
  font-weight: 700;
  color: #111;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slotPickerCaret {
  font-size: 17px;
  color: #555;
  line-height: 1;
}

.topTip {
  position: absolute;
  left: 12px;
  right: 12px;
  top: calc(100% + 6px);
  width: auto;
  max-height: 240px;
  overflow: hidden;
  background: #ffffff;
  border: 1px solid #bfc3ca;
  border-radius: 10px;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.12);
  z-index: 30;
  padding: 8px;
}

.tipSearchWrap {
  margin-bottom: 8px;
}

.tipSearchInput {
  width: 100%;
  box-sizing: border-box;
  height: 32px;
  padding: 0 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
}

.tipList {
  max-height: 160px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tipItem {
  border: none;
  background: #eceef2;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.tipItem:hover {
  background: #dfe3ea;
}

.tipEmpty {
  margin: 2px 0;
  font-size: 13px;
  color: #666;
}

.nextBtn {
  border: none;
  background: #d2d2d4;
  color: #111;
  font-size: clamp(32px, 4vw, 56px);
  cursor: pointer;
}

.drawerBackdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.28);
  z-index: 35;
}

.detailsDrawer {
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  width: min(70vw, 1000px);
  background: #f7f7f7;
  border-left: 1px solid #d1d5db;
  transform: translateX(100%);
  transition: transform 0.25s ease;
  z-index: 40;
  overflow: auto;
  padding: 16px 16px 24px;
}

.detailsDrawer.open {
  transform: translateX(0);
}

.drawerClose {
  position: sticky;
  top: 8px;
  margin-left: auto;
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

.footerBar {
  height: 44px;
  background: #d2d2d4;
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

@media (max-width: 920px) {
  .slotRow {
    grid-template-columns: repeat(3, minmax(100px, 1fr));
  }

  .nextBtn {
    min-height: 90px;
  }

  .slotPickerText {
    font-size: 14px;
  }

  .detailsDrawer {
    width: 100vw;
    padding: 12px 10px 16px;
  }
}
</style>
