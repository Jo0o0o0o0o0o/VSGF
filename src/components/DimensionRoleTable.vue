<script setup lang="ts">
import { computed } from "vue";
import type { IvisRecord } from "@/types/ivis23";

export type DimensionRoleRow = {
  key: string;
  label: string;
};

export type DimensionRoleAssignmentRow = {
  leaders: Array<number | null>;
  supports: Array<number | null>;
};

export type DimensionRoleAssignments = Record<string, DimensionRoleAssignmentRow>;

const props = defineProps<{
  dimensions: readonly DimensionRoleRow[];
  people: IvisRecord[];
  personColors: Record<number, string>;
  modelValue: DimensionRoleAssignments;
  leaderCount: number;
  supportCount: number;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: DimensionRoleAssignments): void;
  (e: "update:leaderCount", value: number): void;
  (e: "update:supportCount", value: number): void;
}>();

const personById = computed(() => new Map(props.people.map((p) => [p.id, p] as const)));
const leaderIndices = computed(() => Array.from({ length: props.leaderCount }, (_, i) => i));
const supportIndices = computed(() => Array.from({ length: props.supportCount }, (_, i) => i));

function rowFor(dimensionKey: string): DimensionRoleAssignmentRow {
  const row = props.modelValue[dimensionKey];
  if (!row) {
    return {
      leaders: Array.from({ length: props.leaderCount }, () => null),
      supports: Array.from({ length: props.supportCount }, () => null),
    };
  }
  return {
    leaders: [...row.leaders, ...Array.from({ length: Math.max(0, props.leaderCount - row.leaders.length) }, () => null)].slice(0, props.leaderCount),
    supports: [...row.supports, ...Array.from({ length: Math.max(0, props.supportCount - row.supports.length) }, () => null)].slice(0, props.supportCount),
  };
}

function onDragOver(ev: DragEvent) {
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
}

function onDropCell(dimensionKey: string, role: "leader" | "support", idx: number, ev: DragEvent) {
  ev.preventDefault();
  const raw = ev.dataTransfer?.getData("application/x-ivis-person-id") || ev.dataTransfer?.getData("text/plain");
  const personId = Number(raw);
  if (!Number.isFinite(personId)) return;
  if (!personById.value.has(personId)) return;

  const next: DimensionRoleAssignments = { ...props.modelValue };
  const row = rowFor(dimensionKey);
  if (role === "leader") row.leaders[idx] = personId;
  else row.supports[idx] = personId;
  next[dimensionKey] = row;
  emit("update:modelValue", next);
}

function clearCell(dimensionKey: string, role: "leader" | "support", idx: number) {
  const next: DimensionRoleAssignments = { ...props.modelValue };
  const row = rowFor(dimensionKey);
  if (role === "leader") row.leaders[idx] = null;
  else row.supports[idx] = null;
  next[dimensionKey] = row;
  emit("update:modelValue", next);
}

function personAt(dimensionKey: string, role: "leader" | "support", idx: number) {
  const row = rowFor(dimensionKey);
  const id = role === "leader" ? row.leaders[idx] ?? null : row.supports[idx] ?? null;
  if (id === null) return null;
  return personById.value.get(id) ?? null;
}

function addLeaderColumn() {
  emit("update:leaderCount", props.leaderCount + 1);
}

function removeLeaderColumn() {
  if (props.leaderCount <= 1) return;
  emit("update:leaderCount", props.leaderCount - 1);
}

function addSupportColumn() {
  emit("update:supportCount", props.supportCount + 1);
}

function removeSupportColumn() {
  if (props.supportCount <= 1) return;
  emit("update:supportCount", props.supportCount - 1);
}
</script>

<template>
  <div class="roleTableWrap">
    <table class="roleTable">
      <thead>
        <tr>
          <th class="dimHeader">Dimension</th>
          <th
            v-for="idx in leaderIndices"
            :key="`leader-col-${idx}`"
            class="roleHeader"
          >
            <div class="headerRow">
              <span>Leader {{ idx + 1 }}</span>
              <span v-if="idx === 0" class="headerBtns">
                <button type="button" class="headBtn" @click="removeLeaderColumn" :disabled="leaderCount <= 1">-</button>
                <button type="button" class="headBtn" @click="addLeaderColumn">+</button>
              </span>
            </div>
          </th>
          <th
            v-for="idx in supportIndices"
            :key="`support-col-${idx}`"
            class="roleHeader"
          >
            <div class="headerRow">
              <span>Support {{ idx + 1 }}</span>
              <span v-if="idx === 0" class="headerBtns">
                <button type="button" class="headBtn" @click="removeSupportColumn" :disabled="supportCount <= 1">-</button>
                <button type="button" class="headBtn" @click="addSupportColumn">+</button>
              </span>
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="dimension in dimensions" :key="dimension.key">
          <td class="dimCell">{{ dimension.label }}</td>
          <td
            v-for="idx in leaderIndices"
            :key="`leader-${dimension.key}-${idx}`"
            class="dropCell"
            @dragover="onDragOver"
            @drop="onDropCell(dimension.key, 'leader', idx, $event)"
          >
            <div v-if="personAt(dimension.key, 'leader', idx)" class="personPill">
              <span class="dot" :style="{ backgroundColor: personColors[personAt(dimension.key, 'leader', idx)!.id] ?? '#64748b' }"></span>
              <span class="personName" :style="{ color: personColors[personAt(dimension.key, 'leader', idx)!.id] ?? '#1f2937' }">
                {{ personAt(dimension.key, "leader", idx)!.alias }}
              </span>
              <button class="clearBtn" type="button" @click="clearCell(dimension.key, 'leader', idx)">x</button>
            </div>
            <div v-else class="emptyDrop">Drop person</div>
          </td>
          <td
            v-for="idx in supportIndices"
            :key="`support-${dimension.key}-${idx}`"
            class="dropCell"
            @dragover="onDragOver"
            @drop="onDropCell(dimension.key, 'support', idx, $event)"
          >
            <div v-if="personAt(dimension.key, 'support', idx)" class="personPill">
              <span class="dot" :style="{ backgroundColor: personColors[personAt(dimension.key, 'support', idx)!.id] ?? '#64748b' }"></span>
              <span class="personName" :style="{ color: personColors[personAt(dimension.key, 'support', idx)!.id] ?? '#1f2937' }">
                {{ personAt(dimension.key, "support", idx)!.alias }}
              </span>
              <button class="clearBtn" type="button" @click="clearCell(dimension.key, 'support', idx)">x</button>
            </div>
            <div v-else class="emptyDrop">Drop person</div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.roleTableWrap {
  width: 100%;
  overflow: auto;
}

.roleTable {
  width: 100%;
  border-collapse: collapse;
  min-width: 680px;
}

th,
td {
  border: 1px solid rgba(15, 23, 42, 0.15);
  padding: 8px;
}

th {
  background: #334155;
  color: #e2e8f0;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-align: left;
}

.dimHeader {
  min-width: 150px;
}

.roleHeader {
  min-width: 160px;
}

.headerRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.headerBtns {
  display: inline-flex;
  gap: 4px;
}

.headBtn {
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  border-radius: 6px;
  width: 20px;
  height: 20px;
  cursor: pointer;
  line-height: 1;
  font-weight: 700;
}

.headBtn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.dimCell {
  font-weight: 700;
  color: #0f172a;
}

.dropCell {
  background: #f8fafc;
}

.personPill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  flex: 0 0 auto;
}

.personName {
  font-weight: 700;
  font-size: 13px;
}

.emptyDrop {
  color: #94a3b8;
  font-size: 12px;
}

.clearBtn {
  border: none;
  background: rgba(15, 23, 42, 0.08);
  border-radius: 999px;
  width: 18px;
  height: 18px;
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
}
</style>
