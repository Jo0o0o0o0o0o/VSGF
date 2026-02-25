<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import GroupDetails from "@/views/GroupDetails.vue";
import studentsRaw from "../data/IVIS23_final.json";
import type { IvisRecord } from "@/types/ivis23";

type Student = IvisRecord;

type Group = {
  id: number;
  showChips: boolean;
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
    showChips: true,
    members: Array(size).fill(null),
  }))
);

const activeTip = ref<{ groupId: number; slotIndex: number } | null>(null);
const detailsGroupId = ref<number | null>(null);
const detailsOpen = ref(false);

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

function toggleTip(groupId: number, slotIndex: number) {
  if (
    activeTip.value?.groupId === groupId &&
    activeTip.value.slotIndex === slotIndex
  ) {
    activeTip.value = null;
    return;
  }
  activeTip.value = { groupId, slotIndex };
}

function addMember(groupId: number, slotIndex: number, student: Student) {
  const group = groups.value.find((item) => item.id === groupId);
  if (!group) return;
  group.members[slotIndex] = student;
  activeTip.value = null;
}

function removeMember(groupId: number, slotIndex: number) {
  const group = groups.value.find((item) => item.id === groupId);
  if (!group) return;
  group.members[slotIndex] = null;
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

function openGroupDetails(groupId: number) {
  detailsGroupId.value = groupId;
  detailsOpen.value = true;
  activeTip.value = null;
}

function closeGroupDetails() {
  detailsOpen.value = false;
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
  <main class="groupingPage">
    <section v-for="group in groups" :key="group.id" class="groupRow">
      <div class="groupHeader">
        <span class="groupId">{{ group.id }}</span>
        <div v-if="group.showChips" class="chipRow">
          <span class="chip"></span>
          <span class="chip"></span>
          <span class="chip"></span>
        </div>
      </div>

      <div class="slotRow" :style="{ '--slot-count': group.members.length }">
        <div
          v-for="(member, slotIndex) in group.members"
          :key="slotIndex"
          class="slotCardWrap"
        >
          <button
            class="slotCard"
            type="button"
            @click="toggleTip(group.id, slotIndex)"
          >
            <span v-if="member" class="memberAlias">{{ member.alias }}</span>
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

          <div
            v-if="
              activeTip?.groupId === group.id && activeTip.slotIndex === slotIndex
            "
            class="topTip"
          >
            <div v-if="availableStudents.length" class="tipList">
              <button
                v-for="student in availableStudents"
                :key="student.id"
                class="tipItem"
                type="button"
                @click="addMember(group.id, slotIndex, student)"
              >
                {{ student.alias }}
              </button>
            </div>
            <p v-else class="tipEmpty">No student left</p>
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
        ×
      </button>

      <GroupDetails
        v-if="selectedGroup"
        compact
        :panelTitle="`Group ${selectedGroup.id} Details`"
        :groupMembers="selectedGroupMembers"
      />
    </aside>
  </main>
</template>

<style scoped>
.groupingPage {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.groupRow {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  gap: 12px;
}

.chip {
  width: 90px;
  height: 28px;
  border-radius: 999px;
  background: #d2d2d4;
}

.slotRow {
  display: grid;
  grid-template-columns: repeat(var(--slot-count), minmax(120px, 1fr)) 36px;
  gap: 16px;
  align-items: stretch;
}

.slotCardWrap {
  position: relative;
}

.slotCard {
  width: 100%;
  border: none;
  cursor: pointer;
  aspect-ratio: 1 / 1;
  background: #d2d2d4;
  display: grid;
  place-items: center;
}

.memberAlias {
  font-size: clamp(16px, 2vw, 22px);
  line-height: 1.2;
  color: #111;
  font-weight: 600;
  padding: 10px;
  text-align: center;
  word-break: break-word;
}

.plusMark {
  font-size: clamp(48px, 8vw, 78px);
  line-height: 1;
  color: #000;
  font-weight: 300;
}

.removeBtn {
  position: absolute;
  top: 8px;
  right: 8px;
  border: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.topTip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  transform: translateX(-50%);
  width: min(220px, 94vw);
  max-height: 220px;
  overflow: auto;
  background: #ffffff;
  border: 1px solid #bfc3ca;
  border-radius: 10px;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.12);
  z-index: 30;
  padding: 8px;
}

.tipList {
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

@media (max-width: 920px) {
  .slotRow {
    grid-template-columns: repeat(3, minmax(100px, 1fr));
  }

  .nextBtn {
    min-height: 90px;
  }

  .detailsDrawer {
    width: 100vw;
    padding: 12px 10px 16px;
  }
}
</style>
