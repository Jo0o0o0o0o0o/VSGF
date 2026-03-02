<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import CompareSlotsBar from "@/components/CompareSlotsBar.vue";
import CompareView from "@/views/ComparePerson.vue";
import RadarChart from "@/components/RadarChart.vue";
import GroupDetailsHeatmap from "@/components/GroupDetailsHeatmap.vue";
import StackBar from "@/components/stackbar.vue";
import EmbeddingAreaBarChart from "@/components/EmbeddingAreaBarChart.vue";
import AxisSelector from "@/components/AxisSelector.vue";
import ParallelSetsChart from "@/components/ParallelSetsChart.vue";
import ThresholdProgressBars from "@/components/ThresholdProgressBars.vue";
import DimensionRoleTable, { type DimensionRoleAssignments } from "@/components/DimensionRoleTable.vue";
import type { EmbeddingAreaDatum } from "@/d3Viz/createEmbeddingAreaBarChart";
import {
  RADAR_AXES,
  RADAR_COLORS,
  type AxisItem,
  type RadarDog,
  type RadarKey,
} from "@/d3Viz/createRadarChart";
import hobbyAreaRulesRaw from "@/data/hobby_area_rules.json";
import { EMBEDDING_MODEL_ID, EMBEDDING_TEXT_BUILDER_VERSION } from "@/embeddings/config";
import { IVIS_RATING_KEYS, type IvisRecord } from "@/types/ivis23";
import { GROUPING_UPDATED_EVENT, getActiveEmbeddings, getActiveRecords, makeYearStorageKey } from "@/types/dataSource";
import { formatHobbyLabel } from "@/utils/hobbyTagColorMap";
import { writeComparePersonId } from "@/utils/compareSelection";

const props = withDefaults(
  defineProps<{
    groupMembers?: IvisRecord[];
    groupSlots?: (IvisRecord | null)[];
    panelTitle?: string;
    compact?: boolean;
    groupId?: number | null;
    canAddSlot?: boolean;
    canRemoveEmptySlot?: boolean;
    addSlotWarning?: string;
    removeSlotWarning?: string;
  }>(),
  {
    groupMembers: () => [],
    groupSlots: () => [],
    panelTitle: "Group Details",
    compact: false,
    groupId: null,
    canAddSlot: false,
    canRemoveEmptySlot: false,
    addSlotWarning: "",
    removeSlotWarning: "",
  },
);
const emit = defineEmits<{
  (e: "update-group-slots", payload: { groupId: number; memberIds: Array<number | null> }): void;
}>();

const DEFAULT_MAX = 5;
const allAxes = RADAR_AXES;
const activeAxes = ref(allAxes);
const heatmapUseCategoryX = ref(false);
const heatmapCategoryAxes: AxisItem[] = [
  {
    key: "programming",
    label: "Build",
    hint: "Programming, Code Repository, CG Programming, HCI Programming, Computer Usage",
  },
  {
    key: "information_visualization",
    label: "Think + Vis",
    hint: "Statistical, Mathematics, Information Visualization",
  },
  {
    key: "drawing_and_artistic",
    label: "Design",
    hint: "UX Evaluation, Drawing/Art",
  },
  {
    key: "communication",
    label: "Team Collaboration",
    hint: "Communication, Collaboration",
  },
];
const thresholdDimensions: Array<{
  key: string;
  label: string;
  keys: readonly RadarKey[];
}> = [
  {
    key: "build",
    label: "Build",
    keys: [
      "programming",
      "code_repository",
      "computer_graphics_programming",
      "human_computer_interaction_programming",
      "computer_usage",
    ] as const,
  },
  {
    key: "think_vis",
    label: "Think + Vis",
    keys: ["statistical", "mathematics", "information_visualization"] as const,
  },
  {
    key: "design",
    label: "Design",
    keys: ["user_experience_evaluation", "drawing_and_artistic"] as const,
  },
  {
    key: "team_collaboration",
    label: "Team Collaboration",
    keys: ["communication", "collaboration"] as const,
  },
] as const;
const thresholdRoleRows = thresholdDimensions.map((d) => ({ key: d.key, label: d.label }));
const HEATMAP_CATEGORY_KEYS = {
  build: [
    "programming",
    "code_repository",
    "computer_graphics_programming",
    "human_computer_interaction_programming",
    "computer_usage",
  ] as const,
  thinkVis: ["statistical", "mathematics", "information_visualization"] as const,
  design: ["user_experience_evaluation", "drawing_and_artistic"] as const,
  team: ["communication", "collaboration"] as const,
};
const parallelSetsSkillLabels: Record<string, string> = {
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
const parallelSetsCategorySkillLabels: Record<string, string> = {
  programming: "Build",
  information_visualization: "Think + Vis",
  drawing_and_artistic: "Design",
  communication: "Team Collaboration",
};

const focusIndex = ref<number | null>(null);
const slots = ref<(IvisRecord | null)[]>(Array.from({ length: DEFAULT_MAX }, () => null));
const compareDrawerOpen = ref(false);
const leaderCount = ref(1);
const supportCount = ref(1);
const thresholdAssignments = ref<DimensionRoleAssignments>(
  Object.fromEntries(
    thresholdRoleRows.map((row) => [
      row.key,
      { leaders: Array.from({ length: leaderCount.value }, () => null), supports: Array.from({ length: supportCount.value }, () => null) },
    ]),
  ),
);
const groupAreaEmbeddingStatus = ref<"idle" | "loading" | "ready" | "error">("idle");
const groupAreaEmbeddingErrorMessage = ref("");
const groupAreaEmbeddingScores = ref<EmbeddingAreaDatum[]>([]);
const AREA_EMBED_SCORE_MAX_PER_PERSON = 20;
const AREA_EMBED_SCORE_GAMMA = 1.6;

type HobbyAreaRule = {
  hobby_area: string;
  keywords: string[];
};

type PrecomputedEmbeddingsFile = {
  model: string;
  textBuilderVersion: string;
  embeddings: Array<{ id: number; vector: number[] }>;
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
  precomputedEmbeddings?.embeddings.map((item) => [item.id, item.vector]) ?? [],
);
const areaQueryEmbeddingCache = new Map<string, number[]>();
const AREA_QUERY_CACHE_KEY = makeYearStorageKey(
  `area_query_embeddings_${EMBEDDING_MODEL_ID.replace(/[^a-z0-9]+/gi, "_")}_${EMBEDDING_TEXT_BUILDER_VERSION}`,
);
const GROUP_LEADER_LABELS_STORAGE_KEY = makeYearStorageKey("group_leader_labels_v1");
const GROUP_ROLE_ASSIGNMENTS_STORAGE_KEY = makeYearStorageKey("group_role_assignments_v1");
let areaEmbeddingPreloadStarted = false;
let areaEmbeddingTaskSeq = 0;
let embeddingWorker: Worker | null = null;
let workerRequestId = 0;
const workerPending = new Map<
  number,
  {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }
>();

function toggleFocus(i: number) {
  const nextIndex = focusIndex.value === i ? null : i;
  focusIndex.value = nextIndex;

  if (nextIndex === null) return;
  const person = slots.value[nextIndex];
  if (!person) return;
  writeComparePersonId(person.id);
  compareDrawerOpen.value = true;
}

function setSlot(i: number, person: IvisRecord | null) {
  slots.value[i] = person;
  emitGroupSlotsToParent();
}

function closeCompareDrawer() {
  compareDrawerOpen.value = false;
}

function reconcileThresholdAssignmentsToCounts() {
  const next: DimensionRoleAssignments = { ...thresholdAssignments.value };
  for (const row of thresholdRoleRows) {
    const prev = next[row.key] ?? { leaders: [], supports: [] };
    next[row.key] = {
      leaders: [
        ...prev.leaders,
        ...Array.from({ length: Math.max(0, leaderCount.value - prev.leaders.length) }, () => null),
      ].slice(0, leaderCount.value),
      supports: [
        ...prev.supports,
        ...Array.from({ length: Math.max(0, supportCount.value - prev.supports.length) }, () => null),
      ].slice(0, supportCount.value),
    };
  }
  thresholdAssignments.value = next;
}

function updateLeaderCount(next: number) {
  leaderCount.value = Math.max(1, next);
  reconcileThresholdAssignmentsToCounts();
}

function updateSupportCount(next: number) {
  supportCount.value = Math.max(1, next);
  reconcileThresholdAssignmentsToCounts();
}

function setActiveAxes(v: { key: RadarKey; label: string }[]) {
  activeAxes.value = v;
}

function buildSlotsFromMembers(members: IvisRecord[]) {
  const next: (IvisRecord | null)[] = Array.from({ length: DEFAULT_MAX }, () => null);
  for (let i = 0; i < Math.min(DEFAULT_MAX, members.length); i += 1) {
    next[i] = members[i] ?? null;
  }
  return next;
}

function emitGroupSlotsToParent() {
  if (typeof props.groupId !== "number") return;
  emit("update-group-slots", {
    groupId: props.groupId,
    memberIds: slots.value.map((person) => person?.id ?? null),
  });
}

function removeEmptySlot(index: number) {
  if (!props.canRemoveEmptySlot) return;
  if (slots.value[index] !== null) return;
  if (slots.value.length <= 1) return;
  slots.value.splice(index, 1);
  emitGroupSlotsToParent();
}

function addEmptySlot() {
  if (!props.canAddSlot) return;
  slots.value.push(null);
  emitGroupSlotsToParent();
}

const selectedPeople = computed(() => slots.value.filter(Boolean) as IvisRecord[]);
const allYearPeople = getActiveRecords() as IvisRecord[];
const stackBarAxisAverages = computed<Partial<Record<RadarKey, number>>>(() => {
  const out: Partial<Record<RadarKey, number>> = {};
  if (!allYearPeople.length) return out;
  const groupSize = selectedPeople.value.length;
  if (!groupSize) return out;

  if (!heatmapUseCategoryX.value) {
    for (const axis of modeAxes.value) {
      const total = allYearPeople.reduce((sum, person) => sum + Number(person.ratings[axis.key] ?? 0), 0);
      out[axis.key] = Number(((total / allYearPeople.length) * groupSize).toFixed(2));
    }
    return out;
  }

  out.programming = Number(
    (
      (allYearPeople.reduce((sum, person) => sum + averageRating(person, HEATMAP_CATEGORY_KEYS.build), 0) /
        allYearPeople.length) *
      groupSize
    ).toFixed(2),
  );
  out.information_visualization = Number(
    (
      (allYearPeople.reduce((sum, person) => sum + averageRating(person, HEATMAP_CATEGORY_KEYS.thinkVis), 0) /
        allYearPeople.length) *
      groupSize
    ).toFixed(2),
  );
  out.drawing_and_artistic = Number(
    (
      (allYearPeople.reduce((sum, person) => sum + averageRating(person, HEATMAP_CATEGORY_KEYS.design), 0) /
        allYearPeople.length) *
      groupSize
    ).toFixed(2),
  );
  out.communication = Number(
    (
      (allYearPeople.reduce((sum, person) => sum + averageRating(person, HEATMAP_CATEGORY_KEYS.team), 0) /
        allYearPeople.length) *
      groupSize
    ).toFixed(2),
  );
  return out;
});
const thresholdPersonColors = computed<Record<number, string>>(() =>
  Object.fromEntries(
    selectedPeople.value.map((person, idx) => [person.id, RADAR_COLORS[idx % RADAR_COLORS.length] ?? "#0f766e"]),
  ),
);
const thresholdLeaderWarnings = computed<string[]>(() => {
  const personById = new Map(selectedPeople.value.map((p) => [p.id, p] as const));
  const dimensionsByLeader = new Map<number, string[]>();

  for (const row of thresholdRoleRows) {
    const leaders = thresholdAssignments.value[row.key]?.leaders ?? [];
    for (const leaderId of leaders) {
      if (leaderId === null) continue;
      if (!dimensionsByLeader.has(leaderId)) dimensionsByLeader.set(leaderId, []);
      dimensionsByLeader.get(leaderId)?.push(row.label);
    }
  }

  return Array.from(dimensionsByLeader.entries())
    .filter(([, dims]) => dims.length >= 2)
    .map(([leaderId, dims]) => {
      const name = personById.get(leaderId)?.alias ?? `#${leaderId}`;
      return `${name} is assigned as leader for multiple dimensions: ${dims.join(", ")}`;
    });
});

function computeAutoThresholdAssignments(records: IvisRecord[]): DimensionRoleAssignments {
  const out: DimensionRoleAssignments = Object.fromEntries(
    thresholdRoleRows.map((row) => [
      row.key,
      {
        leaders: Array.from({ length: leaderCount.value }, () => null),
        supports: Array.from({ length: supportCount.value }, () => null),
      },
    ]),
  );
  if (!records.length) return out;

  const rankedByDimension = new Map<string, Array<{ personId: number; score: number }>>();
  for (const dimension of thresholdDimensions) {
    const ranked = records
      .map((person) => ({
        personId: person.id,
        score: averageRating(person, dimension.keys),
      }))
      .sort((a, b) => b.score - a.score);
    rankedByDimension.set(dimension.key, ranked);
  }

  const bestDimensionByPerson = new Map<number, string>();
  for (const person of records) {
    let bestKey: string = thresholdDimensions[0]?.key ?? "";
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const dimension of thresholdDimensions) {
      const score = averageRating(person, dimension.keys);
      if (score > bestScore) {
        bestScore = score;
        bestKey = dimension.key;
      }
    }
    bestDimensionByPerson.set(person.id, bestKey);
  }

  const usedLeaderIds = new Set<number>();
  const usedSupportIds = new Set<number>();
  for (const dimension of thresholdDimensions) {
    const dimKey = dimension.key;
    const row = out[dimKey] ?? {
      leaders: Array.from({ length: leaderCount.value }, () => null),
      supports: Array.from({ length: supportCount.value }, () => null),
    };
    const ranked = rankedByDimension.get(dimension.key) ?? [];
    const leaders = ranked
      .filter(
        (rowItem) =>
          !usedLeaderIds.has(rowItem.personId) &&
          bestDimensionByPerson.get(rowItem.personId) === dimension.key,
      )
      .slice(0, leaderCount.value);
    row.leaders = Array.from({ length: leaderCount.value }, (_, idx) => leaders[idx]?.personId ?? null);
    leaders.forEach((item) => usedLeaderIds.add(item.personId));

    const leaderSet = new Set(row.leaders.filter((id): id is number => id !== null));
    const supports = ranked
      .filter((rowItem) => !leaderSet.has(rowItem.personId) && !usedSupportIds.has(rowItem.personId))
      .slice(0, supportCount.value);
    row.supports = Array.from({ length: supportCount.value }, (_, idx) => supports[idx]?.personId ?? null);
    out[dimKey] = row;
    supports.forEach((s) => usedSupportIds.add(s.personId));
  }

  return out;
}

type StoredGroupLeaderLabels = {
  version: 1;
  groups: Record<string, Record<string, string[]>>;
};
type StoredGroupRoleAssignments = {
  version: 1;
  groups: Record<string, DimensionRoleAssignments>;
};

function readStoredGroupLeaderLabels(): StoredGroupLeaderLabels {
  try {
    const raw = localStorage.getItem(GROUP_LEADER_LABELS_STORAGE_KEY);
    if (!raw) return { version: 1, groups: {} };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { version: 1, groups: {} };
    const maybe = parsed as Partial<StoredGroupLeaderLabels>;
    if (maybe.version !== 1 || !maybe.groups || typeof maybe.groups !== "object") {
      return { version: 1, groups: {} };
    }
    return {
      version: 1,
      groups: Object.fromEntries(
        Object.entries(maybe.groups).map(([groupId, memberMap]) => [
          groupId,
          memberMap && typeof memberMap === "object" ? (memberMap as Record<string, string[]>) : {},
        ]),
      ),
    };
  } catch {
    return { version: 1, groups: {} };
  }
}

function collectLeaderLabelsByPerson(): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const row of thresholdRoleRows) {
    const leaderIds = thresholdAssignments.value[row.key]?.leaders ?? [];
    for (const leaderId of leaderIds) {
      if (typeof leaderId !== "number") continue;
      const personKey = String(leaderId);
      if (!next[personKey]) next[personKey] = [];
      if (!next[personKey].includes(row.label)) next[personKey].push(row.label);
    }
  }
  return next;
}

function persistLeaderLabelsForGroup() {
  if (typeof props.groupId !== "number") return;

  try {
    const stored = readStoredGroupLeaderLabels();
    const groupKey = String(props.groupId);
    const labelsByPerson = collectLeaderLabelsByPerson();

    if (Object.keys(labelsByPerson).length === 0) {
      delete stored.groups[groupKey];
    } else {
      stored.groups[groupKey] = labelsByPerson;
    }

    localStorage.setItem(GROUP_LEADER_LABELS_STORAGE_KEY, JSON.stringify(stored));
    window.dispatchEvent(new Event(GROUPING_UPDATED_EVENT));
  } catch {
    // ignore storage failures
  }
}

function readStoredGroupRoleAssignments(): StoredGroupRoleAssignments {
  try {
    const raw = localStorage.getItem(GROUP_ROLE_ASSIGNMENTS_STORAGE_KEY);
    if (!raw) return { version: 1, groups: {} };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { version: 1, groups: {} };
    const maybe = parsed as Partial<StoredGroupRoleAssignments>;
    if (maybe.version !== 1 || !maybe.groups || typeof maybe.groups !== "object") {
      return { version: 1, groups: {} };
    }
    return {
      version: 1,
      groups: Object.fromEntries(
        Object.entries(maybe.groups).map(([groupId, assignment]) => [
          groupId,
          assignment && typeof assignment === "object" ? (assignment as DimensionRoleAssignments) : {},
        ]),
      ),
    };
  } catch {
    return { version: 1, groups: {} };
  }
}

function normalizeAssignmentsForStorage(assignments: DimensionRoleAssignments): DimensionRoleAssignments {
  const next: DimensionRoleAssignments = {};
  for (const row of thresholdRoleRows) {
    const current = assignments[row.key];
    next[row.key] = {
      leaders: (current?.leaders ?? []).map((id) => (typeof id === "number" ? id : null)),
      supports: (current?.supports ?? []).map((id) => (typeof id === "number" ? id : null)),
    };
  }
  return next;
}

function persistRoleAssignmentsForGroup() {
  if (typeof props.groupId !== "number") return;
  try {
    const stored = readStoredGroupRoleAssignments();
    const groupKey = String(props.groupId);
    stored.groups[groupKey] = normalizeAssignmentsForStorage(thresholdAssignments.value);
    localStorage.setItem(GROUP_ROLE_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(stored));
    window.dispatchEvent(new Event(GROUPING_UPDATED_EVENT));
  } catch {
    // ignore storage failures
  }
}

const selectedRadarPeople = computed<RadarDog[]>(() =>
  selectedPeople.value.map((p) => ({
    name: p.alias,
    information_visualization: p.ratings.information_visualization,
    statistical: p.ratings.statistical,
    mathematics: p.ratings.mathematics,
    drawing_and_artistic: p.ratings.drawing_and_artistic,
    computer_usage: p.ratings.computer_usage,
    programming: p.ratings.programming,
    computer_graphics_programming: p.ratings.computer_graphics_programming,
    human_computer_interaction_programming: p.ratings.human_computer_interaction_programming,
    user_experience_evaluation: p.ratings.user_experience_evaluation,
    communication: p.ratings.communication,
    collaboration: p.ratings.collaboration,
    code_repository: p.ratings.code_repository,
  })),
);

function averageRating(record: IvisRecord, keys: readonly RadarKey[]) {
  if (!keys.length) return 0;
  const total = keys.reduce((sum, key) => sum + Number(record.ratings[key] ?? 0), 0);
  return Number((total / keys.length).toFixed(2));
}

const modeDogs = computed<RadarDog[]>(() => {
  if (!heatmapUseCategoryX.value) return selectedRadarPeople.value;
  return selectedPeople.value.map((p) => {
    const base: RadarDog = {
      name: p.alias,
      information_visualization: p.ratings.information_visualization,
      statistical: p.ratings.statistical,
      mathematics: p.ratings.mathematics,
      drawing_and_artistic: p.ratings.drawing_and_artistic,
      computer_usage: p.ratings.computer_usage,
      programming: p.ratings.programming,
      computer_graphics_programming: p.ratings.computer_graphics_programming,
      human_computer_interaction_programming: p.ratings.human_computer_interaction_programming,
      user_experience_evaluation: p.ratings.user_experience_evaluation,
      communication: p.ratings.communication,
      collaboration: p.ratings.collaboration,
      code_repository: p.ratings.code_repository,
    };
    base.programming = averageRating(p, HEATMAP_CATEGORY_KEYS.build);
    base.information_visualization = averageRating(p, HEATMAP_CATEGORY_KEYS.thinkVis);
    base.drawing_and_artistic = averageRating(p, HEATMAP_CATEGORY_KEYS.design);
    base.communication = averageRating(p, HEATMAP_CATEGORY_KEYS.team);
    return base;
  });
});

const modeAxes = computed(() => (heatmapUseCategoryX.value ? heatmapCategoryAxes : activeAxes.value));
const parallelSetsSkillKeys = computed(() =>
  heatmapUseCategoryX.value
    ? (["programming", "information_visualization", "drawing_and_artistic", "communication"] as const)
    : IVIS_RATING_KEYS,
);
const parallelSetsAxisLabels = computed(() =>
  heatmapUseCategoryX.value ? parallelSetsCategorySkillLabels : parallelSetsSkillLabels,
);
const parallelSetsRecords = computed<IvisRecord[]>(() => {
  if (!heatmapUseCategoryX.value) return selectedPeople.value;
  return selectedPeople.value.map((p) => ({
    ...p,
    ratings: {
      ...p.ratings,
      programming: averageRating(p, HEATMAP_CATEGORY_KEYS.build),
      information_visualization: averageRating(p, HEATMAP_CATEGORY_KEYS.thinkVis),
      drawing_and_artistic: averageRating(p, HEATMAP_CATEGORY_KEYS.design),
      communication: averageRating(p, HEATMAP_CATEGORY_KEYS.team),
    },
  }));
});

const groupAreaChartMaxScore = computed(() =>
  Math.max(AREA_EMBED_SCORE_MAX_PER_PERSON, selectedPeople.value.length * AREA_EMBED_SCORE_MAX_PER_PERSON),
);

watch(
  () =>
    props.groupSlots.length
      ? props.groupSlots.map((p) => p?.id ?? "x").join(",")
      : props.groupMembers.map((p) => p.id).join(","),
  () => {
    if (props.groupSlots.length) {
      slots.value = props.groupSlots.slice();
    } else {
      slots.value = buildSlotsFromMembers(props.groupMembers);
    }
  },
  { immediate: true },
);

watch(
  () => selectedPeople.value.length,
  (len) => {
    if (focusIndex.value !== null && (focusIndex.value < 0 || focusIndex.value >= len)) {
      focusIndex.value = null;
    }
  },
);

watch(
  () => selectedPeople.value.map((p) => p.id).join(","),
  () => {
    thresholdAssignments.value = computeAutoThresholdAssignments(selectedPeople.value);
  },
  { immediate: true },
);

watch(
  [() => props.groupId, thresholdAssignments, () => selectedPeople.value.map((p) => p.id).join(",")],
  () => {
    persistLeaderLabelsForGroup();
    persistRoleAssignmentsForGroup();
  },
  { deep: true, immediate: true },
);

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
      | { type: "warmup"; requestId: number; payload: { ok: true } }
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

function persistAreaQueryEmbeddingCache() {
  try {
    const queryObject = Object.fromEntries(areaQueryEmbeddingCache.entries());
    localStorage.setItem(AREA_QUERY_CACHE_KEY, JSON.stringify(queryObject));
  } catch {
    // ignore storage failures
  }
}

function restoreAreaQueryEmbeddingCache() {
  try {
    const rawQueries = localStorage.getItem(AREA_QUERY_CACHE_KEY);
    if (!rawQueries) return;
    const parsed = JSON.parse(rawQueries) as Record<string, number[]>;
    Object.entries(parsed).forEach(([query, vector]) => {
      if (!Array.isArray(vector)) return;
      areaQueryEmbeddingCache.set(query, vector.map((v) => Number(v)));
    });
  } catch {
    // ignore cache parse failures
  }
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
  persistAreaQueryEmbeddingCache();
  return normalized;
}

async function startAreaEmbeddingPreload() {
  if (areaEmbeddingPreloadStarted) return;
  areaEmbeddingPreloadStarted = true;
  restoreAreaQueryEmbeddingCache();

  if (!precomputedEmbeddingsCompatible) {
    groupAreaEmbeddingStatus.value = "error";
    groupAreaEmbeddingErrorMessage.value =
      "Precomputed embeddings metadata does not match configured model/version.";
    return;
  }

  groupAreaEmbeddingStatus.value = "loading";
  groupAreaEmbeddingErrorMessage.value = "";

  try {
    ensureEmbeddingWorker();
    await callEmbeddingWorker<{ ok: true }>({ type: "warmup", payload: {} });
    await Promise.all(hobbyAreaKeys.map((areaKey) => ensureAreaQueryEmbedding(areaKey)));
    groupAreaEmbeddingStatus.value = "ready";
  } catch (error) {
    groupAreaEmbeddingStatus.value = "error";
    groupAreaEmbeddingErrorMessage.value =
      error instanceof Error ? error.message : "Failed to preload area embeddings.";
  }
}

function mapAreaEmbeddingScore(raw: number, minRaw: number, maxRaw: number) {
  if (raw <= 0) return 0;
  if (maxRaw <= minRaw + 1e-9) return AREA_EMBED_SCORE_MAX_PER_PERSON;
  const normalized = Math.max(0, Math.min(1, (raw - minRaw) / (maxRaw - minRaw)));
  const contrasted = normalized ** AREA_EMBED_SCORE_GAMMA;
  return contrasted * AREA_EMBED_SCORE_MAX_PER_PERSON;
}

async function updateGroupAreaEmbeddingScores() {
  const seq = ++areaEmbeddingTaskSeq;
  if (!selectedPeople.value.length) {
    groupAreaEmbeddingScores.value = [];
    groupAreaEmbeddingStatus.value = "idle";
    return;
  }
  if (!precomputedEmbeddingsCompatible) {
    groupAreaEmbeddingScores.value = [];
    groupAreaEmbeddingStatus.value = "error";
    groupAreaEmbeddingErrorMessage.value =
      "Precomputed embeddings metadata does not match configured model/version.";
    return;
  }

  groupAreaEmbeddingStatus.value = "loading";
  groupAreaEmbeddingErrorMessage.value = "";

  try {
    await startAreaEmbeddingPreload();

    const members = selectedPeople.value.filter(
      (p) => p.hobby_raw.trim().length > 0 && (studentEmbeddingById.get(p.id)?.length ?? 0) > 0,
    );
    if (!members.length) {
      groupAreaEmbeddingScores.value = [];
      groupAreaEmbeddingStatus.value = "ready";
      return;
    }

    const areaVectors = new Map<string, number[]>();
    await Promise.all(
      hobbyAreaKeys.map(async (areaKey) => {
        areaVectors.set(areaKey, await ensureAreaQueryEmbedding(areaKey));
      }),
    );

    const sumByArea = new Map<string, number>(hobbyAreaKeys.map((areaKey) => [areaKey, 0]));
    for (const member of members) {
      const studentVec = studentEmbeddingById.get(member.id) ?? [];
      const rawRows = hobbyAreaKeys.map((areaKey) => {
        const queryVec = areaVectors.get(areaKey) ?? [];
        const raw = queryVec.length ? Math.max(0, dot(studentVec, queryVec)) : 0;
        return { areaKey, raw };
      });

      const positives = rawRows.map((row) => row.raw).filter((v) => v > 0);
      const minRaw = positives.length ? Math.min(...positives) : 0;
      const maxRaw = positives.length ? Math.max(...positives) : 0;

      for (const row of rawRows) {
        const mapped = mapAreaEmbeddingScore(row.raw, minRaw, maxRaw);
        sumByArea.set(row.areaKey, (sumByArea.get(row.areaKey) ?? 0) + mapped);
      }
    }

    if (seq !== areaEmbeddingTaskSeq) return;

    groupAreaEmbeddingScores.value = hobbyAreaKeys.map((areaKey) => ({
      areaKey,
      areaLabel: formatHobbyLabel(areaKey),
      score: Number((sumByArea.get(areaKey) ?? 0).toFixed(2)),
      rawScore: Number((sumByArea.get(areaKey) ?? 0).toFixed(2)),
    }));
    groupAreaEmbeddingStatus.value = "ready";
  } catch (error) {
    if (seq !== areaEmbeddingTaskSeq) return;
    groupAreaEmbeddingScores.value = [];
    groupAreaEmbeddingStatus.value = "error";
    groupAreaEmbeddingErrorMessage.value =
      error instanceof Error ? error.message : "Failed to compute group area embedding scores.";
  }
}

onMounted(() => {
  startAreaEmbeddingPreload();
});

watch(
  () => selectedPeople.value.map((p) => p.id).join(","),
  () => {
    updateGroupAreaEmbeddingScores();
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
  <main class="comparePage" :class="{ compact: compact }">
    <h2 class="detailsTitle">{{ panelTitle }}</h2>

    <div class="slotsTopRow">
      <CompareSlotsBar
        :slots="slots"
        :max="slots.length"
        :focusIndex="focusIndex"
        :openDropdownOnPickedClick="false"
        :allowEmptySlotDelete="true"
        :canDeleteEmptySlot="props.canRemoveEmptySlot"
        @update-slot="setSlot"
        @toggle-focus="toggleFocus"
        @remove-empty-slot="removeEmptySlot"
      />
      <button
        class="slotSideAddBtn"
        type="button"
        :disabled="!props.canAddSlot"
        @click="addEmptySlot"
      >
        +
      </button>
    </div>

    <section class="thresholdSection">
      <div class="panel level-1 thresholdPanel">
        <h3>Assign Responsibilities</h3>
        <p v-for="warn in thresholdLeaderWarnings" :key="warn" class="thresholdWarning">
          Warning: {{ warn }}
        </p>
        <div class="thresholdTableWrap">
          <DimensionRoleTable
            v-model="thresholdAssignments"
            :dimensions="thresholdRoleRows"
            :people="selectedPeople"
            :personColors="thresholdPersonColors"
            :leaderCount="leaderCount"
            :supportCount="supportCount"
            @update:leaderCount="updateLeaderCount"
            @update:supportCount="updateSupportCount"
          />
        </div>
      </div>
      <div class="panel level-1 thresholdPanel">
        <h3>Threshold Progress Bars</h3>
        <div class="thresholdChartWrap">
          <ThresholdProgressBars
            :records="selectedPeople"
            :dimensions="thresholdDimensions"
            :personColors="thresholdPersonColors"
            :assignments="thresholdAssignments"
          />
        </div>
      </div>
    </section>

    <section class="dimensionSection">
      <div class="panel level-1 narrow">
        <AxisSelector
          :allAxes="allAxes"
          :activeAxes="activeAxes"
          @update:activeAxes="setActiveAxes"
        />
      </div>
    </section>

    <section class="grid">
      <div class="panel level-1 big">
        <h3>Ratings Heatmap</h3>
        <div class="heatmapToolbar">
          <div class="heatmapToggle" role="group" aria-label="toggle heatmap dimension mode">
            <button
              class="heatmapToggleBtn"
              :class="{ active: !heatmapUseCategoryX }"
              type="button"
              @click="heatmapUseCategoryX = false"
            >
              Details
            </button>
            <button
              class="heatmapToggleBtn"
              :class="{ active: heatmapUseCategoryX }"
              type="button"
              @click="heatmapUseCategoryX = true"
            >
              4D Set
            </button>
          </div>
        </div>
        <div class="heatmapChartWrap">
          <GroupDetailsHeatmap
            :dogs="modeDogs"
            :axes="modeAxes"
            :focusIndex="focusIndex"
            @toggleFocus="toggleFocus"
          />
        </div>

        <h3>Ratings Stacked Bar</h3>
        <div class="stackBarWrap">
          <StackBar
            :dogs="modeDogs"
            :axes="modeAxes"
            :focusIndex="focusIndex"
            :axisAverages="stackBarAxisAverages"
            @toggleFocus="toggleFocus"
          />
        </div>

        <h3>Ratings Radar Compare</h3>
        <div class="radarChartWrap">
          <RadarChart
            :dogs="modeDogs"
            :axes="modeAxes"
            :focusIndex="focusIndex"
            @toggleFocus="toggleFocus"
          />
        </div>

        <h3>Parallel Sets: Person -> Skills</h3>
        <div class="parallelSetsWrap">
          <ParallelSetsChart
            :records="parallelSetsRecords"
            :skillKeys="parallelSetsSkillKeys"
            :skillLabels="parallelSetsAxisLabels"
            :topN="heatmapUseCategoryX ? null : 3"
          />
        </div>
      </div>
    </section>

    <section class="embeddingSection">
      <div class="panel level-1 embeddingPanel">
        <h3>Group Hobby Sum</h3>
        <div class="embeddingAreaWrap">
          <EmbeddingAreaBarChart
            :data="groupAreaEmbeddingScores"
            :maxScore="groupAreaChartMaxScore"
          />
        </div>
        <p v-if="selectedPeople.length === 0" class="embeddingHint">
          Select people to view group hobby-area embedding scores.
        </p>
        <p
          v-else-if="groupAreaEmbeddingStatus === 'ready' && groupAreaEmbeddingScores.every((row) => row.score === 0)"
          class="embeddingHint"
        >
          No raw hobby answers available for embedding scoring in this group.
        </p>
        <p v-else-if="groupAreaEmbeddingStatus === 'loading'" class="embeddingHint">
          Loading embedding scores...
        </p>
        <p v-else-if="groupAreaEmbeddingStatus === 'error'" class="embeddingHint embeddingHintError">
          Failed to load embedding scores. {{ groupAreaEmbeddingErrorMessage }}
        </p>
      </div>
    </section>

    <Teleport to="body">
      <div
        v-if="compareDrawerOpen"
        class="detailsCompareBackdrop"
        @click="closeCompareDrawer"
      ></div>
      <aside class="detailsCompareDrawer" :class="{ open: compareDrawerOpen }">
        <button
          class="detailsCompareDrawerClose"
          type="button"
          aria-label="close compare"
          @click="closeCompareDrawer"
        >
          x
        </button>
        <CompareView />
      </aside>
    </Teleport>
  </main>
</template>

<style scoped>
.comparePage {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detailsTitle {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #111;
}

.slotsTopRow {
  display: flex;
  align-items: stretch;
  gap: 10px;
}

.slotsTopRow > :first-child {
  flex: 1 1 auto;
}

.slotSideAddBtn {
  width: 42px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #1f2937;
  font-size: 20px;
  font-weight: 700;
  cursor: pointer;
  line-height: 1;
}

.slotSideAddBtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  align-items: start;
}

.embeddingSection {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.dimensionSection {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.thresholdSection {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
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
  min-height: 900px;
  display: flex;
  flex-direction: column;
}

.heatmapChartWrap {
  height: 280px;
  min-height: 260px;
  margin-bottom: 12px;
}

.heatmapToolbar {
  margin: 0 0 8px;
}

.heatmapToggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.stackBarWrap {
  height: 280px;
  min-height: 240px;
  margin-bottom: 12px;
}

.radarChartWrap {
  height: 420px;
  min-height: 360px;
  margin-bottom: 12px;
}

.parallelSetsWrap {
  height: 560px;
  min-height: 420px;
  margin-bottom: 12px;
}

.embeddingAreaWrap {
  height: 260px;
  min-height: 220px;
}

.embeddingHint {
  margin: 10px 0 0;
  color: #6b7280;
  font-size: 12px;
}

.embeddingHintError {
  color: #b91c1c;
}

.panel.narrow {
  min-height: 0;
}

.thresholdPanel {
  min-height: 0;
}

.thresholdChartWrap {
  height: 290px;
  min-height: 240px;
}

.thresholdTableWrap {
  margin-bottom: 10px;
}

.thresholdWarning {
  margin: 0 0 8px;
  color: #b91c1c;
  font-size: 12px;
  font-weight: 700;
}

.embeddingPanel {
  min-height: 0;
}

.comparePage.compact .grid {
  grid-template-columns: 1fr;
}

.detailsCompareDrawer {
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  width: min(44vw, 700px);
  background: #f7f7f7;
  border-right: 1px solid #d1d5db;
  transform: translateX(-100%);
  transition: transform 0.24s ease;
  z-index: 260;
  overflow: auto;
}

.detailsCompareDrawer.open {
  transform: translateX(0);
}

.detailsCompareDrawerClose {
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

.detailsCompareBackdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.18);
  z-index: 250;
}

@media (max-width: 980px) {
  .slotsTopRow {
    flex-direction: column;
  }

  .slotSideAddBtn {
    width: 100%;
    min-height: 34px;
  }
}
</style>
