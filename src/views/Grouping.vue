<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import GroupDetails from "@/views/GroupDetails.vue";
import CompareView from "@/views/ComparePerson.vue";
import hobbyAreaRulesRaw from "@/data/hobby_area_rules.json";
import ivis21AimingJson from "@/data/IVIS21_aming.json";
import ivis22AimingJson from "@/data/IVIS22_aming.json";
import ivis21AimingAreaJson from "@/data/IVIS21_aiming_area.json";
import ivis22AimingAreaJson from "@/data/IVIS22_aiming_area.json";
import { EMBEDDING_MODEL_ID, EMBEDDING_TEXT_BUILDER_VERSION } from "@/embeddings/config";
import type { IvisRecord } from "@/types/ivis23";
import {
  activeYear,
  type DatasetYear,
  getActiveEmbeddings,
  getActiveRecords,
  GROUPING_CONFIRMED_EVENT,
  GROUPING_HYDRATED_EVENT,
  GROUPING_UPDATED_EVENT,
  makeYearStorageKey,
} from "@/types/dataSource";
import { formatHobbyLabel, getHobbyTagStyle } from "@/utils/hobbyTagColorMap";
import { writeComparePersonId } from "@/utils/compareSelection";

type Student = IvisRecord;
type PreferredGroupSize = 4 | 5;

type Group = {
  id: number;
  members: Array<Student | null>;
};

type StoredGrouping = {
  version: 2;
  preferredGroupSize: PreferredGroupSize;
  unassignedSlotBuffer?: number;
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

type StoredConfirmedGrouping = {
  confirmedGroupIds: number[];
};

type StoredCollapsedGrouping = {
  collapsedGroupIds: number[];
};

type StoredGroupLeaderLabels = {
  version: 1;
  groups: Record<string, Record<string, string[]>>;
};
type DimensionRoleAssignmentRow = {
  leaders: Array<number | null>;
  supports: Array<number | null>;
};
type DimensionRoleAssignments = Record<string, DimensionRoleAssignmentRow>;
type StoredGroupRoleAssignments = {
  version: 1;
  groups: Record<string, DimensionRoleAssignments>;
};

type HobbyAreaRule = {
  hobby_area: string;
  keywords: string[];
};

type PrecomputedEmbeddingsFile = {
  model: string;
  textBuilderVersion: string;
  fingerprint?: string;
  generatedAt?: string;
  datasetPath?: string;
  embeddings: Array<{ id: number; vector: number[] }>;
};

type AimingEntry = {
  id: number;
  alias: string;
  aiming_raw: string;
};

type AimingAreaEntry = {
  area_key: string;
  area_label: string;
  description?: string;
  matched_count?: number;
  member_ids?: number[];
};

const GROUPING_STORAGE_KEY = makeYearStorageKey("grouping_v1");
const GROUPING_CONFIRM_STORAGE_KEY = makeYearStorageKey("grouping_confirmed_v1");
const GROUPING_COLLAPSED_STORAGE_KEY = makeYearStorageKey("grouping_collapsed_v1");
const GROUP_LEADER_LABELS_STORAGE_KEY = makeYearStorageKey("group_leader_labels_v1");
const GROUP_ROLE_ASSIGNMENTS_STORAGE_KEY = makeYearStorageKey("group_role_assignments_v1");

const students = getActiveRecords() as Student[];

function buildGroupSlotSizes(totalStudents: number, preferredSize: PreferredGroupSize): number[] {
  if (totalStudents <= 0) return [preferredSize];
  if (totalStudents <= 5) return [totalStudents];

  const minGroupCount = Math.ceil(totalStudents / 5);
  const maxGroupCount = Math.floor(totalStudents / 4);

  if (minGroupCount <= maxGroupCount) {
    const groupCount = preferredSize === 5 ? minGroupCount : maxGroupCount;
    const sizes = Array(groupCount).fill(4);
    const extraStudents = totalStudents - groupCount * 4;

    for (let i = 0; i < extraStudents; i += 1) {
      sizes[i] = 5;
    }

    return sizes;
  }

  const groupCount = Math.ceil(totalStudents / preferredSize);
  const sizes = Array(groupCount).fill(preferredSize);
  const lastGroupSize = totalStudents - preferredSize * (groupCount - 1);
  if (groupCount > 0) {
    sizes[groupCount - 1] = lastGroupSize;
  }

  return sizes;
}

function normalizePreferredGroupSize(value: unknown): PreferredGroupSize {
  return value === 4 ? 4 : 5;
}

function buildEmptyGroups(preferredSize: PreferredGroupSize): Group[] {
  return buildGroupSlotSizes(students.length, preferredSize).map((size, index) => ({
    id: index + 1,
    members: Array(size).fill(null),
  }));
}

const preferredGroupSize = ref<PreferredGroupSize>(5);
const groups = ref<Group[]>(
  buildEmptyGroups(preferredGroupSize.value)
);

const activeTip = ref<{ groupId: number; slotIndex: number } | null>(null);
const moveMenu = ref<{ studentId: number; alias: string; x: number; y: number } | null>(null);
const detailsGroupId = ref<number | null>(null);
const detailsOpen = ref(false);
const compareDrawerOpen = ref(false);
const draggingStudentId = ref<number | null>(null);
const dragOverSlot = ref<
  { groupId: number; slotIndex: number; mode: "add" | "replace" } | null
>(null);
const groupCollapsedState = ref<Record<number, boolean>>({});
const confirmedGroupState = ref<Record<number, boolean>>({});
const groupLeaderLabelsByGroup = ref<Record<number, Record<number, string[]>>>({});
const groupRoleAssignmentsByGroup = ref<Record<number, DimensionRoleAssignments>>({});
const unassignedSlotBuffer = ref(0);
const GROUP_MIN_SLOTS = 4;
const GROUP_MAX_SLOTS = 5;
const GROUP_SCORE_WARN_THRESHOLD = 7;
const GROUP_THRESHOLD_DIMENSIONS: Array<{
  key: "build" | "think_vis" | "design" | "team_collaboration";
  label: string;
  ratingKeys: string[];
}> = [
  {
    key: "build",
    label: "Build",
    ratingKeys: [
      "programming",
      "code_repository",
      "computer_graphics_programming",
      "human_computer_interaction_programming",
      "computer_usage",
    ],
  },
  {
    key: "think_vis",
    label: "Think + Vis",
    ratingKeys: ["statistical", "mathematics", "information_visualization"],
  },
  {
    key: "design",
    label: "Design",
    ratingKeys: ["user_experience_evaluation", "drawing_and_artistic"],
  },
  {
    key: "team_collaboration",
    label: "Team Collaboration",
    ratingKeys: ["communication", "collaboration"],
  },
];

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
const hobbyKeywordQuery = ref("");
const hobbyAreaRules = hobbyAreaRulesRaw as HobbyAreaRule[];
const precomputedEmbeddings = computed(
  () => getActiveEmbeddings() as PrecomputedEmbeddingsFile | null
);
const keywordScoringMode = ref<"rule" | "embedding" | "hybrid">("hybrid");
const embeddingStatus = ref<"idle" | "loading" | "ready" | "error">("idle");
const embeddingScores = ref<Record<number, number>>({});
const embeddingErrorMessage = ref("");
const EMBEDDING_SCORE_MAX = 20;
const EMBEDDING_SCORE_GAMMA = 2.1;
const studentEmbeddingById = computed(
  () =>
    new Map<number, number[]>(
      precomputedEmbeddings.value?.embeddings.map((item) => [item.id, item.vector]) ?? []
    )
);
const queryEmbeddingCache = new Map<string, number[]>();
const aimingStudentEmbeddingCache = new Map<number, number[]>();
const embeddingScoresAlreadyScaled = ref(false);
let embeddingTaskSeq = 0;
let embeddingWorker: Worker | null = null;
let workerRequestId = 0;
let embeddingPreloadStarted = false;
const workerPending = new Map<
  number,
  {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }
>();
const QUERY_EMBED_CACHE_KEY = makeYearStorageKey(
  `query_embeddings_${EMBEDDING_MODEL_ID.replace(/[^a-z0-9]+/gi, "_")}_${EMBEDDING_TEXT_BUILDER_VERSION}`,
);
const AIMING_STUDENT_EMBED_CACHE_KEY = makeYearStorageKey(
  `aiming_student_embeddings_${EMBEDDING_MODEL_ID.replace(/[^a-z0-9]+/gi, "_")}_${EMBEDDING_TEXT_BUILDER_VERSION}`,
);
const AIMING_BY_YEAR: Partial<Record<DatasetYear, AimingEntry[]>> = {
  "21": ivis21AimingJson as AimingEntry[],
  "22": ivis22AimingJson as AimingEntry[],
};
const AIMING_AREAS_BY_YEAR: Partial<Record<DatasetYear, AimingAreaEntry[]>> = {
  "21": ivis21AimingAreaJson as AimingAreaEntry[],
  "22": ivis22AimingAreaJson as AimingAreaEntry[],
};
const activeAimingRows = computed<AimingEntry[]>(() => AIMING_BY_YEAR[activeYear.value] ?? []);
const activeAimingById = computed(() => new Map<number, AimingEntry>(activeAimingRows.value.map((row) => [row.id, row])));
const activeAimingAreas = computed<AimingAreaEntry[]>(() => AIMING_AREAS_BY_YEAR[activeYear.value] ?? []);
const supportsAimingEmbeddingScoring = computed(
  () => activeAimingRows.value.length > 0 && activeAimingAreas.value.length > 0,
);
function normalizedMetaValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
const precomputedEmbeddingsCompatible = computed(
  () =>
    !!precomputedEmbeddings.value &&
    normalizedMetaValue(precomputedEmbeddings.value.model) === normalizedMetaValue(EMBEDDING_MODEL_ID) &&
    normalizedMetaValue(precomputedEmbeddings.value.textBuilderVersion) ===
      normalizedMetaValue(EMBEDDING_TEXT_BUILDER_VERSION)
);
const requiresEmbeddings = computed(
  () => keywordScoringMode.value === "embedding" || keywordScoringMode.value === "hybrid"
);
const keywordSearchPlaceholder = computed(() =>
  supportsAimingEmbeddingScoring.value
    ? "Score by aiming keyword/area (e.g. ux, communication)"
    : "Score by hobby keyword (e.g. games)",
);

function normalizeKeyword(text: string) {
  return text.toLowerCase().trim().replace(/[^a-z0-9_ ]+/g, " ");
}

function tokenize(text: string) {
  return normalizeKeyword(text)
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function countWholeWordOccurrences(text: string, token: string) {
  if (!token) return 0;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escaped}\\b`, "g");
  return (text.match(regex) ?? []).length;
}

function formatSkillLabel(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getTopSkillLabels(student: Student, count = 2) {
  return Object.entries(student.ratings)
    .map(([key, value]) => ({ key, value: Number(value) }))
    .filter((item) => Number.isFinite(item.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, count)
    .map((item) => formatSkillLabel(item.key));
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

function persistEmbeddingCaches() {
  try {
    const queryObject = Object.fromEntries(queryEmbeddingCache.entries());
    localStorage.setItem(QUERY_EMBED_CACHE_KEY, JSON.stringify(queryObject));
    const aimingObject = Object.fromEntries(aimingStudentEmbeddingCache.entries());
    localStorage.setItem(AIMING_STUDENT_EMBED_CACHE_KEY, JSON.stringify(aimingObject));
  } catch {
    // ignore storage failures
  }
}

function restoreEmbeddingCaches() {
  try {
    const rawQueries = localStorage.getItem(QUERY_EMBED_CACHE_KEY);
    if (rawQueries) {
      const parsed = JSON.parse(rawQueries) as Record<string, number[]>;
      Object.entries(parsed).forEach(([query, vector]) => {
        if (!Array.isArray(vector)) return;
        queryEmbeddingCache.set(query, vector.map((v) => Number(v)));
      });
    }
    const rawAiming = localStorage.getItem(AIMING_STUDENT_EMBED_CACHE_KEY);
    if (rawAiming) {
      const parsed = JSON.parse(rawAiming) as Record<string, number[]>;
      Object.entries(parsed).forEach(([id, vector]) => {
        if (!Array.isArray(vector)) return;
        const numericId = Number(id);
        if (!Number.isFinite(numericId)) return;
        aimingStudentEmbeddingCache.set(numericId, normalizeVector(vector.map((v) => Number(v))));
      });
    }
  } catch {
    // ignore cache parse failures
  }
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

async function ensureStudentEmbeddings() {
  if (!precomputedEmbeddingsCompatible.value) {
    throw new Error(
      `Precomputed embeddings metadata does not match configured model/version for IVIS 20${activeYear.value}.`
    );
  }
  const withHobbyRaw = students.filter((student) => hasSearchableHobbyRaw(student));
  const coveredCount = withHobbyRaw.filter((student) =>
    studentEmbeddingById.value.has(student.id)
  ).length;
  if (coveredCount === 0 && withHobbyRaw.length > 0) {
    throw new Error("No usable precomputed student embeddings for current dataset.");
  }
}

async function ensureQueryEmbedding(query: string) {
  const normalizedQuery = normalizeKeyword(query);
  if (queryEmbeddingCache.has(normalizedQuery)) return queryEmbeddingCache.get(normalizedQuery) ?? [];

  const result = await callEmbeddingWorker<{ query: string; vector: number[] }>({
    type: "embed-query",
    payload: { query: normalizedQuery },
  });
  const normalized = normalizeVector(result.vector ?? []);
  queryEmbeddingCache.set(normalizedQuery, normalized);
  persistEmbeddingCaches();
  return normalized;
}

function hasSearchableAimingRaw(student: Student) {
  return normalizeKeyword(activeAimingById.value.get(student.id)?.aiming_raw ?? "").length > 0;
}

function buildAimingAreaEmbeddingQuery(area: AimingAreaEntry) {
  const label = area.area_label?.trim() || area.area_key;
  const desc = area.description?.trim() ?? "";
  if (!desc) return label;
  return `${label}: ${desc}`;
}

function inferAimingAreaKeys(queryTokens: string[]) {
  if (!queryTokens.length) return [];
  const matched = new Set<string>();
  for (const area of activeAimingAreas.value) {
    const areaTokens = tokenize(`${area.area_key} ${area.area_label} ${area.description ?? ""}`);
    for (const token of queryTokens) {
      if (areaTokens.includes(token)) {
        matched.add(area.area_key);
        break;
      }
    }
  }
  return Array.from(matched);
}

async function ensureAimingStudentEmbedding(studentId: number, aimingRaw: string) {
  if (aimingStudentEmbeddingCache.has(studentId)) {
    return aimingStudentEmbeddingCache.get(studentId) ?? [];
  }
  const result = await callEmbeddingWorker<{ query: string; vector: number[] }>({
    type: "embed-query",
    payload: { query: aimingRaw },
  });
  const normalized = normalizeVector(result.vector ?? []);
  aimingStudentEmbeddingCache.set(studentId, normalized);
  persistEmbeddingCaches();
  return normalized;
}

async function updateEmbeddingScores() {
  const keyword = hobbyKeywordQuery.value.trim();
  if (!requiresEmbeddings.value || !keyword) {
    embeddingScores.value = {};
    embeddingScoresAlreadyScaled.value = false;
    if (embeddingStatus.value !== "error") embeddingStatus.value = "idle";
    return;
  }

  const seq = ++embeddingTaskSeq;
  embeddingStatus.value = "loading";
  embeddingErrorMessage.value = "";

  try {
    if (supportsAimingEmbeddingScoring.value) {
      ensureEmbeddingWorker();
      await callEmbeddingWorker<{ ok: true }>({ type: "warmup", payload: {} });

      const queryTokens = tokenize(keyword);
      const targetAreaKeys = inferAimingAreaKeys(queryTokens);
      const candidateAreas =
        targetAreaKeys.length > 0
          ? activeAimingAreas.value.filter((area) => targetAreaKeys.includes(area.area_key))
          : activeAimingAreas.value;

      const areaVectors = new Map<string, number[]>();
      await Promise.all(
        candidateAreas.map(async (area) => {
          areaVectors.set(area.area_key, await ensureQueryEmbedding(buildAimingAreaEmbeddingQuery(area)));
        }),
      );
      if (seq !== embeddingTaskSeq) return;

      const rawScores: Record<number, number> = {};
      await Promise.all(
        students.map(async (student) => {
          const aimingRaw = activeAimingById.value.get(student.id)?.aiming_raw ?? "";
          if (!normalizeKeyword(aimingRaw)) return;
          const studentVec = await ensureAimingStudentEmbedding(student.id, aimingRaw);
          if (!studentVec.length) return;
          let best = 0;
          for (const [, queryVec] of areaVectors) {
            if (!queryVec.length) continue;
            const score = Math.max(0, dot(studentVec, queryVec));
            if (score > best) best = score;
          }
          rawScores[student.id] = best;
        }),
      );
      if (seq !== embeddingTaskSeq) return;

      const rawValues = Object.values(rawScores).filter((value) => value > 0);
      const minRaw = rawValues.length ? Math.min(...rawValues) : 0;
      const maxRaw = rawValues.length ? Math.max(...rawValues) : 0;
      const scaled: Record<number, number> = {};
      Object.entries(rawScores).forEach(([id, raw]) => {
        scaled[Number(id)] = remapEmbeddingScore(raw, minRaw, maxRaw);
      });

      embeddingScores.value = scaled;
      embeddingScoresAlreadyScaled.value = true;
      embeddingStatus.value = "ready";
      return;
    }

    await ensureStudentEmbeddings();
    const queryVector = await ensureQueryEmbedding(keyword);
    if (seq !== embeddingTaskSeq) return;

    const scored: Record<number, number> = {};
    for (const student of students) {
      if (!hasSearchableHobbyRaw(student)) continue;
      const studentVec = studentEmbeddingById.value.get(student.id);
      if (!studentVec?.length || !queryVector.length) continue;
      const cosine = dot(studentVec, queryVector);
      scored[student.id] = Math.max(0, cosine);
    }
    embeddingScores.value = scored;
    embeddingScoresAlreadyScaled.value = false;
    embeddingStatus.value = "ready";
  } catch (error) {
    if (seq !== embeddingTaskSeq) return;
    embeddingScores.value = {};
    embeddingScoresAlreadyScaled.value = false;
    embeddingStatus.value = "error";
    const message = error instanceof Error ? error.message : "Failed to load embedding model.";
    if (message.includes("<!DOCTYPE")) {
      embeddingErrorMessage.value =
        "Model file request returned HTML. This usually means model download is blocked or redirected.";
    } else {
      embeddingErrorMessage.value = message;
    }
  }
}

async function startEmbeddingPreload() {
  if (embeddingPreloadStarted) return;
  embeddingPreloadStarted = true;

  try {
    if (embeddingStatus.value === "idle") {
      embeddingStatus.value = "loading";
    }
    ensureEmbeddingWorker();
    await callEmbeddingWorker<{ ok: true }>({ type: "warmup", payload: {} });
    if (!supportsAimingEmbeddingScoring.value) {
      await ensureStudentEmbeddings();
    }
    if (embeddingStatus.value !== "error") {
      embeddingStatus.value = "ready";
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to preload embeddings.";
    embeddingStatus.value = "error";
    embeddingErrorMessage.value = message;
  }
}

const areaKeywordSetByArea = new Map<string, Set<string>>(
  hobbyAreaRules.map((rule) => [
    normalizeKeyword(rule.hobby_area),
    new Set(rule.keywords.map((keyword) => normalizeKeyword(keyword))),
  ])
);

const areaByKeyword = new Map<string, Set<string>>();
for (const rule of hobbyAreaRules) {
  const area = normalizeKeyword(rule.hobby_area);
  for (const keyword of rule.keywords) {
    const normalizedKeyword = normalizeKeyword(keyword);
    if (!normalizedKeyword) continue;
    if (!areaByKeyword.has(normalizedKeyword)) areaByKeyword.set(normalizedKeyword, new Set<string>());
    areaByKeyword.get(normalizedKeyword)?.add(area);
  }
}

const tokenAreaAffinity = (() => {
  const tokenCountsByAreaByToken = new Map<string, Map<string, number>>();

  for (const student of students) {
    const areas = student.hobby_area.map((area) => normalizeKeyword(area)).filter(Boolean);
    if (!areas.length) continue;

    const tokens = new Set<string>([
      ...tokenize(student.hobby_raw),
      ...student.hobby.flatMap((value) => tokenize(value)),
    ]);

    for (const token of tokens) {
      if (!tokenCountsByAreaByToken.has(token)) {
        tokenCountsByAreaByToken.set(token, new Map<string, number>());
      }
      const countsByArea = tokenCountsByAreaByToken.get(token);
      if (!countsByArea) continue;

      for (const area of areas) {
        countsByArea.set(area, (countsByArea.get(area) ?? 0) + 1);
      }
    }
  }

  const inferredAreasByToken = new Map<string, Set<string>>();
  tokenCountsByAreaByToken.forEach((countsByArea, token) => {
    const entries = Array.from(countsByArea.entries()).sort((a, b) => b[1] - a[1]);
    const topCount = entries[0]?.[1] ?? 0;
    if (topCount < 2) return;

    const areas = entries
      .filter(([, count]) => count >= Math.max(2, Math.floor(topCount * 0.6)))
      .map(([area]) => area);

    if (areas.length) inferredAreasByToken.set(token, new Set(areas));
  });

  return inferredAreasByToken;
})();

const hobbyAreaDisplayKeys = Array.from(
  new Set(
    hobbyAreaRules
      .map((rule) => normalizeKeyword(rule.hobby_area))
      .filter((area) => area && area !== "other"),
  ),
);
const keywordsByArea = new Map<string, string[]>(
  hobbyAreaRules.map((rule) => [normalizeKeyword(rule.hobby_area), rule.keywords ?? []]),
);
const memberTopHobbyAreasById = ref<Record<number, string[]>>({});
const memberTopAimingAreaById = ref<Record<number, string>>({});
const groupTopAimingAreaById = ref<Record<number, string>>({});

function buildAreaEmbeddingQuery(areaKey: string) {
  const areaLabel = formatHobbyLabel(areaKey);
  const keywords = (keywordsByArea.get(areaKey) ?? []).slice(0, 14);
  if (!keywords.length) return areaLabel;
  return `${areaLabel} hobbies: ${keywords.join(", ")}`;
}

async function getTopEmbeddingHobbyAreas(member: Student) {
  const normalizedAreas = member.hobby_area
    .map((area) => normalizeKeyword(area))
    .filter(Boolean);
  const hasOther = normalizedAreas.includes("other");
  const useAllAreasTop2 = normalizedAreas.length < 2 || hasOther;

  if (!precomputedEmbeddingsCompatible.value) {
    if (useAllAreasTop2) return member.hobby_area.slice(0, 2);
    if (member.hobby_area.length >= 3) return member.hobby_area.slice(0, 3);
    return member.hobby_area;
  }

  const studentVec = studentEmbeddingById.value.get(member.id);
  if (!studentVec?.length) {
    if (useAllAreasTop2) return member.hobby_area.slice(0, 2);
    if (member.hobby_area.length >= 3) return member.hobby_area.slice(0, 3);
    return member.hobby_area;
  }

  const candidateAreaKeys = useAllAreasTop2
    ? hobbyAreaDisplayKeys
    : normalizedAreas.filter((area) => area !== "other");

  if (!candidateAreaKeys.length) return member.hobby_area.slice(0, 2);

  const scored = await Promise.all(
    candidateAreaKeys.map(async (areaKey) => {
      const queryVec = await ensureQueryEmbedding(buildAreaEmbeddingQuery(areaKey));
      const score = queryVec.length ? Math.max(0, dot(studentVec, queryVec)) : 0;
      return { areaKey, score };
    }),
  );

  const topLimit = useAllAreasTop2 ? 2 : member.hobby_area.length >= 3 ? 3 : member.hobby_area.length;
  const top = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topLimit)
    .map((row) => row.areaKey);

  if (top.length) return top;
  if (useAllAreasTop2) return member.hobby_area.slice(0, 2);
  if (member.hobby_area.length >= 3) return member.hobby_area.slice(0, 3);
  return member.hobby_area;
}

async function refreshMemberTopHobbyAreas() {
  const members = groups.value
    .flatMap((group) => group.members)
    .filter((member): member is Student => Boolean(member));
  if (!members.length) {
    memberTopHobbyAreasById.value = {};
    return;
  }

  const uniqueById = new Map<number, Student>();
  members.forEach((member) => uniqueById.set(member.id, member));
  const uniqueMembers = Array.from(uniqueById.values());

  const next: Record<number, string[]> = {};
  await Promise.all(
    uniqueMembers.map(async (member) => {
      try {
        next[member.id] = await getTopEmbeddingHobbyAreas(member);
      } catch {
        const normalizedAreas = member.hobby_area
          .map((area) => normalizeKeyword(area))
          .filter(Boolean);
        const hasOther = normalizedAreas.includes("other");
        if (normalizedAreas.length < 2 || hasOther) {
          next[member.id] = member.hobby_area.slice(0, 2);
        } else if (member.hobby_area.length >= 3) {
          next[member.id] = member.hobby_area.slice(0, 3);
        } else {
          next[member.id] = member.hobby_area;
        }
      }
    }),
  );
  memberTopHobbyAreasById.value = next;
}

async function getTopEmbeddingAimingArea(member: Student) {
  if (!supportsAimingEmbeddingScoring.value) return null;
  const aimingRaw = activeAimingById.value.get(member.id)?.aiming_raw ?? "";
  if (!normalizeKeyword(aimingRaw)) return null;

  const studentVec = await ensureAimingStudentEmbedding(member.id, aimingRaw);
  if (!studentVec.length || !activeAimingAreas.value.length) return null;

  const scored = await Promise.all(
    activeAimingAreas.value.map(async (area) => {
      const queryVec = await ensureQueryEmbedding(buildAimingAreaEmbeddingQuery(area));
      const score = queryVec.length ? Math.max(0, dot(studentVec, queryVec)) : 0;
      return {
        label: area.area_label?.trim() || formatSkillLabel(area.area_key),
        score,
      };
    }),
  );

  const top = scored.sort((a, b) => b.score - a.score)[0];
  return top && top.score > 0 ? top.label : null;
}

async function refreshMemberTopAimingAreas() {
  const members = groups.value
    .flatMap((group) => group.members)
    .filter((member): member is Student => Boolean(member));
  if (!members.length || !supportsAimingEmbeddingScoring.value) {
    memberTopAimingAreaById.value = {};
    return;
  }

  const uniqueById = new Map<number, Student>();
  members.forEach((member) => uniqueById.set(member.id, member));
  const uniqueMembers = Array.from(uniqueById.values());

  const next: Record<number, string> = {};
  await Promise.all(
    uniqueMembers.map(async (member) => {
      try {
        const topAreaLabel = await getTopEmbeddingAimingArea(member);
        if (topAreaLabel) next[member.id] = topAreaLabel;
      } catch {
        // ignore aiming embedding failures for individual students
      }
    }),
  );
  memberTopAimingAreaById.value = next;
}

async function getTopEmbeddingAimingAreaForGroup(group: Group) {
  if (!supportsAimingEmbeddingScoring.value) return null;
  const members = group.members.filter((member): member is Student => Boolean(member));
  if (!members.length || !activeAimingAreas.value.length) return null;

  const areaVectors = new Map<string, number[]>();
  await Promise.all(
    activeAimingAreas.value.map(async (area) => {
      areaVectors.set(area.area_key, await ensureQueryEmbedding(buildAimingAreaEmbeddingQuery(area)));
    }),
  );

  const sumByArea = new Map<string, number>(activeAimingAreas.value.map((area) => [area.area_key, 0]));
  for (const member of members) {
    const aimingRaw = activeAimingById.value.get(member.id)?.aiming_raw ?? "";
    if (!normalizeKeyword(aimingRaw)) continue;
    const studentVec = await ensureAimingStudentEmbedding(member.id, aimingRaw);
    if (!studentVec.length) continue;

    for (const area of activeAimingAreas.value) {
      const queryVec = areaVectors.get(area.area_key) ?? [];
      const raw = queryVec.length ? Math.max(0, dot(studentVec, queryVec)) : 0;
      sumByArea.set(area.area_key, (sumByArea.get(area.area_key) ?? 0) + raw);
    }
  }

  let bestAreaKey = "";
  let bestScore = 0;
  sumByArea.forEach((score, areaKey) => {
    if (score > bestScore) {
      bestScore = score;
      bestAreaKey = areaKey;
    }
  });

  if (!bestAreaKey || bestScore <= 0) return null;
  const bestArea = activeAimingAreas.value.find((area) => area.area_key === bestAreaKey);
  return bestArea?.area_label?.trim() || formatSkillLabel(bestAreaKey);
}

async function refreshGroupTopAimingAreas() {
  if (!supportsAimingEmbeddingScoring.value || !groups.value.length) {
    groupTopAimingAreaById.value = {};
    return;
  }

  const next: Record<number, string> = {};
  await Promise.all(
    groups.value.map(async (group) => {
      try {
        const topAreaLabel = await getTopEmbeddingAimingAreaForGroup(group);
        if (topAreaLabel) next[group.id] = topAreaLabel;
      } catch {
        // ignore group aiming embedding failures
      }
    }),
  );
  groupTopAimingAreaById.value = next;
}

function displayedHobbyAreas(member: Student) {
  const normalizedAreas = member.hobby_area
    .map((area) => normalizeKeyword(area))
    .filter(Boolean);
  const hasOther = normalizedAreas.includes("other");
  const useAllAreasTop2 = normalizedAreas.length < 2 || hasOther;
  if (useAllAreasTop2) {
    return memberTopHobbyAreasById.value[member.id] ?? member.hobby_area.slice(0, 2);
  }
  if (member.hobby_area.length >= 3) {
    return memberTopHobbyAreasById.value[member.id] ?? member.hobby_area.slice(0, 3);
  }
  return member.hobby_area;
}

function displayedAimingArea(member: Student) {
  return memberTopAimingAreaById.value[member.id] ?? null;
}

function inferQueryAreas(tokens: string[]) {
  const targetAreas = new Set<string>();
  for (const token of tokens) {
    if (areaKeywordSetByArea.has(token)) {
      targetAreas.add(token);
    }
    areaByKeyword.get(token)?.forEach((area) => targetAreas.add(area));
    tokenAreaAffinity.get(token)?.forEach((area) => targetAreas.add(area));
  }
  return targetAreas;
}

function buildStudentTokenSet(student: Student) {
  return new Set<string>([
    ...tokenize(student.hobby_raw),
  ]);
}

function hasSearchableHobbyRaw(student: Student) {
  return normalizeKeyword(student.hobby_raw).length > 0;
}

function computeKeywordScore(student: Student, keywordRaw: string) {
  if (!hasSearchableHobbyRaw(student)) return 0;
  const queryTokens = tokenize(keywordRaw);
  if (!queryTokens.length) return 0;

  const studentTokens = buildStudentTokenSet(student);
  const studentRaw = normalizeKeyword(student.hobby_raw);
  const targetAreas = inferQueryAreas(queryTokens);

  let score = 0;

  for (const token of queryTokens) {
    if (studentTokens.has(token)) score += 40;
    else if (studentRaw.includes(token)) score += 20;
  }

  let directTokenOccurrences = 0;
  for (const token of queryTokens) {
    directTokenOccurrences += countWholeWordOccurrences(studentRaw, token);
  }

  let relatedKeywordCoverage = 0;
  for (const area of targetAreas) {
    const keywords = areaKeywordSetByArea.get(area);
    if (!keywords || !keywords.size) continue;

    const matchedKeywords = new Set<string>();
    for (const keyword of keywords) {
      if (!keyword) continue;
      const inRaw = countWholeWordOccurrences(studentRaw, keyword) > 0;
      if (inRaw) matchedKeywords.add(keyword);
    }
    relatedKeywordCoverage += matchedKeywords.size;
  }

  // Add ranking granularity for “interest intensity”.
  score += directTokenOccurrences * 18;
  score += relatedKeywordCoverage * 6;

  if (relatedKeywordCoverage > 0) {
    const strongIntentTerms = ["love", "mainly", "mostly", "favorite", "obsessed", "daily", "often", "lot"];
    const weakIntentTerms = ["sometimes", "occasionally", "rarely", "little", "bit"];
    for (const term of strongIntentTerms) {
      if (countWholeWordOccurrences(studentRaw, term) > 0) score += 4;
    }
    for (const term of weakIntentTerms) {
      if (countWholeWordOccurrences(studentRaw, term) > 0) score -= 3;
    }
  }

  return score;
}

function remapEmbeddingScore(raw: number, minRaw: number, maxRaw: number) {
  if (raw <= 0) return 0;
  if (maxRaw <= minRaw + 1e-9) return EMBEDDING_SCORE_MAX;
  const normalized = Math.max(0, Math.min(1, (raw - minRaw) / (maxRaw - minRaw)));
  const contrasted = normalized ** EMBEDDING_SCORE_GAMMA;
  return contrasted * EMBEDDING_SCORE_MAX;
}

const keywordScoredAvailableStudents = computed(() => {
  const keyword = hobbyKeywordQuery.value.trim();
  if (!keyword) {
    return availableStudents.value.map((student) => ({ student, score: 0 }));
  }

  const rawEmbeddingValues = availableStudents.value
    .filter((student) => (supportsAimingEmbeddingScoring.value ? hasSearchableAimingRaw(student) : hasSearchableHobbyRaw(student)))
    .map((student) => embeddingScores.value[student.id] ?? 0)
    .filter((score) => score > 0);
  const minEmbeddingRaw = rawEmbeddingValues.length ? Math.min(...rawEmbeddingValues) : 0;
  const maxEmbeddingRaw = rawEmbeddingValues.length ? Math.max(...rawEmbeddingValues) : 0;

  return availableStudents.value
    .map((student) => ({
      student,
      score: (() => {
        const ruleScore = computeKeywordScore(student, keyword);
        const embeddingScore = embeddingScoresAlreadyScaled.value
          ? embeddingScores.value[student.id] ?? 0
          : remapEmbeddingScore(
              embeddingScores.value[student.id] ?? 0,
              minEmbeddingRaw,
              maxEmbeddingRaw
            );

        if (keywordScoringMode.value === "rule") return ruleScore;
        if (keywordScoringMode.value === "embedding") {
          if (embeddingStatus.value === "ready") return embeddingScore;
          return ruleScore;
        }

        if (embeddingStatus.value === "ready") return ruleScore + embeddingScore;
        return ruleScore;
      })(),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.student.alias.localeCompare(b.student.alias));
});

watch([hobbyKeywordQuery, keywordScoringMode], () => {
  updateEmbeddingScores();
});

watch(
  () => groups.value.map((group) => group.members.map((member) => member?.id ?? "x").join(",")).join("|"),
  () => {
    refreshMemberTopHobbyAreas();
    refreshMemberTopAimingAreas();
    refreshGroupTopAimingAreas();
  },
  { immediate: true },
);

watch(
  () => embeddingStatus.value,
  (status) => {
    if (status === "ready") {
      refreshMemberTopHobbyAreas();
      refreshMemberTopAimingAreas();
      refreshGroupTopAimingAreas();
    }
  },
);

watch(
  () => activeYear.value,
  () => {
    refreshMemberTopAimingAreas();
    refreshGroupTopAimingAreas();
  },
);

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
  moveMenu.value = null;
}

function addMember(groupId: number, slotIndex: number, student: Student) {
  const group = groups.value.find((item) => item.id === groupId);
  if (!group) return;
  group.members[slotIndex] = student;
  slotSearchQuery.value[slotKey(groupId, slotIndex)] = "";
  activeTip.value = null;
  moveMenu.value = null;
}

function removeMember(groupId: number, slotIndex: number) {
  const group = groups.value.find((item) => item.id === groupId);
  if (!group) return;
  group.members[slotIndex] = null;
}

function findStudentLocation(studentId: number) {
  for (const group of groups.value) {
    const slotIndex = group.members.findIndex((member) => member?.id === studentId);
    if (slotIndex >= 0) return { groupId: group.id, slotIndex };
  }
  return null;
}

function openMoveMenu(student: Student, ev: MouseEvent) {
  ev.preventDefault();
  const menuWidth = 240;
  const menuHeight = 280;
  const pad = 12;
  const x = Math.min(ev.clientX + 8, window.innerWidth - menuWidth - pad);
  const y = Math.min(ev.clientY + 8, window.innerHeight - menuHeight - pad);
  moveMenu.value = {
    studentId: student.id,
    alias: student.alias,
    x: Math.max(pad, x),
    y: Math.max(pad, y),
  };
  activeTip.value = null;
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
  return groups.value.map((group) => {
    const used = group.members.filter((member) => Boolean(member)).length;
    const emptySlotIndex = group.members.findIndex((member) => member === null);
    const isFull = emptySlotIndex < 0;
    const isCurrent = typeof studentId === "number" && group.members.some((member) => member?.id === studentId);
    const disabled = isFull || isCurrent;
    const statusText = isCurrent ? "Current" : isFull ? "Full" : `${used}/${group.members.length}`;
    return {
      id: group.id,
      emptySlotIndex,
      disabled,
      statusText,
    };
  });
});

function moveStudentToGroup(targetGroupId: number) {
  const menu = moveMenu.value;
  if (!menu) return;
  const student = students.find((item) => item.id === menu.studentId);
  if (!student) {
    closeMoveMenu();
    return;
  }

  const targetGroup = groups.value.find((group) => group.id === targetGroupId);
  if (!targetGroup) {
    closeMoveMenu();
    return;
  }

  const currentLocation = findStudentLocation(student.id);
  if (currentLocation?.groupId === targetGroupId) {
    closeMoveMenu();
    return;
  }

  const emptySlotIndex = targetGroup.members.findIndex((member) => member === null);
  if (emptySlotIndex < 0) return;

  if (currentLocation) {
    const sourceGroup = groups.value.find((group) => group.id === currentLocation.groupId);
    if (sourceGroup) sourceGroup.members[currentLocation.slotIndex] = null;
  }

  targetGroup.members[emptySlotIndex] = student;
  closeMoveMenu();
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

function onUnassignedStudentClick(studentId: number) {
  if (typeof draggingStudentId.value === "number") return;
  openCompareDrawer(studentId);
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
const selectedGroupSlots = computed<(IvisRecord | null)[]>(() => selectedGroup.value?.members.slice() ?? []);
const selectedGroupSlotCount = computed(() => selectedGroupSlots.value.length);
const selectedGroupEmptySlotCount = computed(
  () => selectedGroupSlots.value.filter((member) => member === null).length,
);
const canSelectedGroupAddSlot = computed(
  () => selectedGroupSlotCount.value < GROUP_MAX_SLOTS && unassignedSlotBuffer.value > 0,
);
const canSelectedGroupRemoveEmptySlot = computed(
  () => selectedGroupSlotCount.value > GROUP_MIN_SLOTS && selectedGroupEmptySlotCount.value > 0,
);
const selectedGroupAddSlotWarning = computed(() => {
  if (!selectedGroup.value) return "";
  if (selectedGroupSlotCount.value >= GROUP_MAX_SLOTS) return "Cannot add more than 5 slots.";
  if (unassignedSlotBuffer.value <= 0) return "No unassigned slot available to add.";
  return "";
});
const selectedGroupRemoveSlotWarning = computed(() => {
  if (!selectedGroup.value) return "";
  if (selectedGroupSlotCount.value <= GROUP_MIN_SLOTS) return "Cannot reduce below 4 slots.";
  if (selectedGroupEmptySlotCount.value <= 0) return "Only empty slots can be removed.";
  return "";
});

const groupHobbiesMap = computed(() => {
  const byGroupId = new Map<number, string[]>();
  groups.value.forEach((group) => {
    const hobbyCount = new Map<string, number>();
    group.members.forEach((member) => {
      if (!member) return;
      displayedHobbyAreas(member).forEach((hobby) => {
        const key = hobby.trim().toLowerCase();
        if (!key) return;
        hobbyCount.set(key, (hobbyCount.get(key) ?? 0) + 1);
      });
    });
    const shared = Array.from(hobbyCount.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([hobby]) => hobby);
    byGroupId.set(group.id, shared);
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

function onGroupDetailsUpdateSlots(payload: { groupId: number; memberIds: Array<number | null> }) {
  const group = groups.value.find((item) => item.id === payload.groupId);
  if (!group || !Array.isArray(payload.memberIds)) return;

  const nextLen = payload.memberIds.length;
  const prevLen = group.members.length;
  if (nextLen < GROUP_MIN_SLOTS || nextLen > GROUP_MAX_SLOTS) return;

  const byId = new Map(students.map((s) => [s.id, s] as const));
  const otherUsedIds = new Set<number>();
  for (const other of groups.value) {
    if (other.id === group.id) continue;
    for (const member of other.members) {
      if (member) otherUsedIds.add(member.id);
    }
  }

  const nextMembers: Array<Student | null> = [];
  for (const memberId of payload.memberIds) {
    if (memberId === null) {
      nextMembers.push(null);
      continue;
    }
    if (typeof memberId !== "number" || otherUsedIds.has(memberId)) return;
    const student = byId.get(memberId);
    if (!student) return;
    nextMembers.push(student);
  }

  if (nextLen > prevLen) {
    const delta = nextLen - prevLen;
    if (unassignedSlotBuffer.value < delta) return;
    unassignedSlotBuffer.value -= delta;
  } else if (nextLen < prevLen) {
    const delta = prevLen - nextLen;
    const removedTail = group.members.slice(nextLen);
    if (removedTail.some((member) => member !== null)) return;
    unassignedSlotBuffer.value += delta;
  }

  group.members = nextMembers;
}

function isGroupCollapsed(groupId: number) {
  return Boolean(groupCollapsedState.value[groupId]);
}

function toggleGroupCollapsed(groupId: number) {
  groupCollapsedState.value[groupId] = !isGroupCollapsed(groupId);
  activeTip.value = null;
  persistCollapsedGrouping();
}

function isGroupConfirmed(groupId: number) {
  return Boolean(confirmedGroupState.value[groupId]);
}

function readStoredGrouping(): { preferredGroupSize: PreferredGroupSize; groups: StoredGrouping["groups"] } | null {
  try {
    const raw = localStorage.getItem(GROUPING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const maybeV2 = parsed as Partial<StoredGrouping>;
    const maybeV1 = parsed as Partial<LegacyStoredGrouping>;

    const isV2 = maybeV2.version === 2 && Array.isArray(maybeV2.groups);
    const isV1 = maybeV1.version === 1 && Array.isArray(maybeV1.groups);
    if (!isV2 && !isV1) return null;

    const rawGroups = (isV2 ? maybeV2.groups : maybeV1.groups) ?? [];
    return {
      preferredGroupSize: normalizePreferredGroupSize(maybeV2.preferredGroupSize),
      groups: rawGroups
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

function readStoredUnassignedSlotBuffer() {
  try {
    const raw = localStorage.getItem(GROUPING_STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return 0;
    const maybe = parsed as Partial<StoredGrouping>;
    const value = Number(maybe.unassignedSlotBuffer ?? 0);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

function applyStoredGrouping(stored: { groups: StoredGrouping["groups"] }) {
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

function collectAssignedStudentsInOrder() {
  return groups.value.flatMap((group) => group.members).filter((member): member is Student => Boolean(member));
}

function rebuildGroups(nextPreferredSize: PreferredGroupSize, preserveAssignedMembers = true) {
  const assigned = preserveAssignedMembers ? collectAssignedStudentsInOrder() : [];
  groups.value = buildEmptyGroups(nextPreferredSize);

  if (!assigned.length) return;

  let cursor = 0;
  for (const group of groups.value) {
    for (let i = 0; i < group.members.length; i += 1) {
      if (cursor >= assigned.length) return;
      const member = assigned[cursor];
      if (!member) return;
      group.members[i] = member;
      cursor += 1;
    }
  }
}

function changePreferredGroupSize(delta: number) {
  const next = normalizePreferredGroupSize(preferredGroupSize.value + delta);
  if (next === preferredGroupSize.value) return;
  preferredGroupSize.value = next;
  rebuildGroups(next, true);
  activeTip.value = null;
  dragOverSlot.value = null;
}

function buildConfirmedGroupingPayload(groupId: number, isConfirmed: boolean) {
  const targetGroup = groups.value.find((group) => group.id === groupId);
  return {
    confirmedAt: new Date().toISOString(),
    groupId,
    isConfirmed,
    preferredGroupSize: preferredGroupSize.value,
    confirmedGroupIds: groups.value
      .map((group) => group.id)
      .filter((id) => Boolean(confirmedGroupState.value[id])),
    group: {
      id: targetGroup?.id ?? groupId,
      memberIds: targetGroup?.members.map((member) => member?.id ?? null) ?? [],
    },
    groups: groups.value.map((group) => ({
      id: group.id,
      memberIds: group.members.map((member) => member?.id ?? null),
    })),
  };
}

function toggleGroupConfirm(groupId: number) {
  const next = !isGroupConfirmed(groupId);
  confirmedGroupState.value[groupId] = next;
  const payload = buildConfirmedGroupingPayload(groupId, next);
  try {
    localStorage.setItem(GROUPING_CONFIRM_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage failures
  }
  window.dispatchEvent(new CustomEvent(GROUPING_CONFIRMED_EVENT, { detail: payload }));
}

function readStoredConfirmedGrouping(): StoredConfirmedGrouping | null {
  try {
    const raw = localStorage.getItem(GROUPING_CONFIRM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const maybe = parsed as Partial<StoredConfirmedGrouping>;
    if (!Array.isArray(maybe.confirmedGroupIds)) return null;
    return {
      confirmedGroupIds: maybe.confirmedGroupIds.filter((id) => typeof id === "number"),
    };
  } catch {
    return null;
  }
}

function readStoredCollapsedGrouping(): StoredCollapsedGrouping | null {
  try {
    const raw = localStorage.getItem(GROUPING_COLLAPSED_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const maybe = parsed as Partial<StoredCollapsedGrouping>;
    if (!Array.isArray(maybe.collapsedGroupIds)) return null;
    return {
      collapsedGroupIds: maybe.collapsedGroupIds.filter((id) => typeof id === "number"),
    };
  } catch {
    return null;
  }
}

function loadGroupLeaderLabels() {
  try {
    const raw = localStorage.getItem(GROUP_LEADER_LABELS_STORAGE_KEY);
    if (!raw) {
      groupLeaderLabelsByGroup.value = {};
      return;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      groupLeaderLabelsByGroup.value = {};
      return;
    }
    const maybe = parsed as Partial<StoredGroupLeaderLabels>;
    if (maybe.version !== 1 || !maybe.groups || typeof maybe.groups !== "object") {
      groupLeaderLabelsByGroup.value = {};
      return;
    }

    const out: Record<number, Record<number, string[]>> = {};
    for (const [groupIdRaw, memberMap] of Object.entries(maybe.groups)) {
      const groupId = Number(groupIdRaw);
      if (!Number.isFinite(groupId) || !memberMap || typeof memberMap !== "object") continue;
      const memberOut: Record<number, string[]> = {};
      for (const [memberIdRaw, labels] of Object.entries(memberMap)) {
        const memberId = Number(memberIdRaw);
        if (!Number.isFinite(memberId) || !Array.isArray(labels)) continue;
        memberOut[memberId] = labels
          .map((label) => String(label).trim())
          .filter((label) => label.length > 0);
      }
      out[groupId] = memberOut;
    }
    groupLeaderLabelsByGroup.value = out;
  } catch {
    groupLeaderLabelsByGroup.value = {};
  }
}

function getMemberLeaderLabels(groupId: number, memberId: number) {
  return groupLeaderLabelsByGroup.value[groupId]?.[memberId] ?? [];
}

function loadGroupRoleAssignments() {
  try {
    const raw = localStorage.getItem(GROUP_ROLE_ASSIGNMENTS_STORAGE_KEY);
    if (!raw) {
      groupRoleAssignmentsByGroup.value = {};
      return;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      groupRoleAssignmentsByGroup.value = {};
      return;
    }
    const maybe = parsed as Partial<StoredGroupRoleAssignments>;
    if (maybe.version !== 1 || !maybe.groups || typeof maybe.groups !== "object") {
      groupRoleAssignmentsByGroup.value = {};
      return;
    }
    const out: Record<number, DimensionRoleAssignments> = {};
    for (const [groupIdRaw, assignment] of Object.entries(maybe.groups)) {
      const groupId = Number(groupIdRaw);
      if (!Number.isFinite(groupId) || !assignment || typeof assignment !== "object") continue;
      out[groupId] = assignment as DimensionRoleAssignments;
    }
    groupRoleAssignmentsByGroup.value = out;
  } catch {
    groupRoleAssignmentsByGroup.value = {};
  }
}

function averageGroupMemberDimensionScore(member: Student, keys: string[]) {
  if (!keys.length) return 0;
  const ratings = member.ratings as Record<string, number>;
  const total = keys.reduce((sum, key) => sum + Number(ratings[key] ?? 0), 0);
  return total / keys.length;
}

const groupDimensionScoreWarnings = computed(() => {
  const out = new Map<number, string[]>();
  for (const group of groups.value) {
    const assignment = groupRoleAssignmentsByGroup.value[group.id] ?? {};
    const memberById = new Map<number, Student>();
    group.members.forEach((member) => {
      if (member) memberById.set(member.id, member);
    });

    if (memberById.size === 0) {
      out.set(group.id, []);
      continue;
    }

    const warnings: string[] = [];
    for (const dimension of GROUP_THRESHOLD_DIMENSIONS) {
      const row = assignment[dimension.key];
      const leaderScores = (row?.leaders ?? [])
        .filter((id): id is number => typeof id === "number")
        .map((id) => {
          const member = memberById.get(id);
          return member ? averageGroupMemberDimensionScore(member, dimension.ratingKeys) : 0;
        });
      const supportScores = (row?.supports ?? [])
        .filter((id): id is number => typeof id === "number")
        .map((id) => {
          const member = memberById.get(id);
          return member ? averageGroupMemberDimensionScore(member, dimension.ratingKeys) : 0;
        });

      const leaderBest = leaderScores.length ? Math.max(...leaderScores) : 0;
      const supportBest = supportScores.length ? Math.max(...supportScores) : 0;
      const bothInsufficient =
        leaderBest < GROUP_SCORE_WARN_THRESHOLD && supportBest < GROUP_SCORE_WARN_THRESHOLD;
      if (bothInsufficient) {
        warnings.push(
          `${dimension.label}: both leader and support are below ${GROUP_SCORE_WARN_THRESHOLD}`,
        );
      }
    }
    out.set(group.id, warnings);
  }
  return out;
});

function getGroupScoreWarnings(groupId: number) {
  return groupDimensionScoreWarnings.value.get(groupId) ?? [];
}

function onStorageChanged(event: StorageEvent) {
  if (event.key === GROUP_LEADER_LABELS_STORAGE_KEY) {
    loadGroupLeaderLabels();
    return;
  }
  if (event.key === GROUP_ROLE_ASSIGNMENTS_STORAGE_KEY) {
    loadGroupRoleAssignments();
  }
}

function persistCollapsedGrouping() {
  try {
    const collapsedGroupIds = groups.value
      .map((group) => group.id)
      .filter((id) => Boolean(groupCollapsedState.value[id]));
    localStorage.setItem(
      GROUPING_COLLAPSED_STORAGE_KEY,
      JSON.stringify({ collapsedGroupIds } satisfies StoredCollapsedGrouping)
    );
  } catch {
    // ignore storage failures
  }
}

function persistGrouping() {
  try {
    const payload: StoredGrouping = {
      version: 2,
      preferredGroupSize: preferredGroupSize.value,
      unassignedSlotBuffer: unassignedSlotBuffer.value,
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

function hydrateGroupingStateFromLocalStorage() {
  const stored = readStoredGrouping();
  if (stored) {
    preferredGroupSize.value = stored.preferredGroupSize;
    rebuildGroups(preferredGroupSize.value, false);
    applyStoredGrouping(stored);
  } else {
    rebuildGroups(preferredGroupSize.value, false);
  }

  unassignedSlotBuffer.value = readStoredUnassignedSlotBuffer();

  const confirmedStored = readStoredConfirmedGrouping();
  const restoredConfirmed: Record<number, boolean> = {};
  for (const group of groups.value) {
    restoredConfirmed[group.id] = confirmedStored
      ? confirmedStored.confirmedGroupIds.includes(group.id)
      : false;
  }
  confirmedGroupState.value = restoredConfirmed;

  const collapsedStored = readStoredCollapsedGrouping();
  const restoredCollapsed: Record<number, boolean> = {};
  for (const group of groups.value) {
    restoredCollapsed[group.id] = collapsedStored
      ? collapsedStored.collapsedGroupIds.includes(group.id)
      : false;
  }
  groupCollapsedState.value = restoredCollapsed;

  loadGroupLeaderLabels();
  loadGroupRoleAssignments();
}

onMounted(() => {
  restoreEmbeddingCaches();
  startEmbeddingPreload();
  hydrateGroupingStateFromLocalStorage();
  persistCollapsedGrouping();
  persistGrouping();
  document.addEventListener("mousedown", onGlobalPointerDown);
  document.addEventListener("keydown", onGlobalEsc);
  window.addEventListener("storage", onStorageChanged);
  window.addEventListener(GROUPING_HYDRATED_EVENT, hydrateGroupingStateFromLocalStorage);
  window.addEventListener(GROUPING_UPDATED_EVENT, loadGroupLeaderLabels);
  window.addEventListener(GROUPING_UPDATED_EVENT, loadGroupRoleAssignments);
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onGlobalPointerDown);
  document.removeEventListener("keydown", onGlobalEsc);
  window.removeEventListener("storage", onStorageChanged);
  window.removeEventListener(GROUPING_HYDRATED_EVENT, hydrateGroupingStateFromLocalStorage);
  window.removeEventListener(GROUPING_UPDATED_EVENT, loadGroupLeaderLabels);
  window.removeEventListener(GROUPING_UPDATED_EVENT, loadGroupRoleAssignments);
});

watch(
  groups,
  () => {
    const cleaned: Record<number, boolean> = {};
    for (const group of groups.value) {
      cleaned[group.id] = Boolean(groupCollapsedState.value[group.id]);
    }
    groupCollapsedState.value = cleaned;
    persistCollapsedGrouping();
    persistGrouping();
  },
  { deep: true }
);

watch(unassignedSlotBuffer, () => {
  persistGrouping();
});
</script>

<template>
  
    <section class="groupSizeSection level-3">
      <span class="groupSizeLabel">Group size per team</span>
      <div class="groupSizeStepper" role="group" aria-label="change group size">
        <button
          class="groupSizeBtn"
          type="button"
          :disabled="preferredGroupSize <= 4"
          @click="changePreferredGroupSize(-1)"
        >
          -
        </button>
        <span class="groupSizeValue">{{ preferredGroupSize }}</span>
        <button
          class="groupSizeBtn"
          type="button"
          :disabled="preferredGroupSize >= 5"
          @click="changePreferredGroupSize(1)"
        >
          +
        </button>
      </div>
      <span class="groupSizeHint">Auto balances based on your 4/5 choice.</span>
    </section>

    <section class="unassignedSection level-3">
      <div class="unassignedHeader">Select People</div>
      <div class="keywordSearchWrap">
        <input
          v-model="hobbyKeywordQuery"
          class="keywordSearchInput"
          type="text"
          :placeholder="keywordSearchPlaceholder"
        />
        <div class="modeSwitch" role="group" aria-label="keyword scoring mode">
          <button
            class="modeSwitchBtn"
            :class="{ active: keywordScoringMode === 'rule' }"
            type="button"
            @click="keywordScoringMode = 'rule'"
          >
            Rule only
          </button>
          <button
            class="modeSwitchBtn"
            :class="{ active: keywordScoringMode === 'embedding' }"
            type="button"
            @click="keywordScoringMode = 'embedding'"
          >
            Embedding only
          </button>
          <button
            class="modeSwitchBtn"
            :class="{ active: keywordScoringMode === 'hybrid' }"
            type="button"
            @click="keywordScoringMode = 'hybrid'"
          >
            Hybrid
          </button>
        </div>
        <p v-if="requiresEmbeddings && embeddingStatus === 'loading'" class="embeddingHint">
          Loading embedding model...
        </p>
        <p v-else-if="requiresEmbeddings && embeddingStatus === 'error'" class="embeddingHint embeddingHintError">
          Embeddings unavailable, using rule score only. {{ embeddingErrorMessage }}
        </p>
      </div>
      <div class="unassignedGrid">
        <div
          v-for="entry in keywordScoredAvailableStudents"
          :key="`unassigned-${entry.student.id}`"
          class="personBlock"
          :class="{ dragging: draggingStudentId === entry.student.id }"
          draggable="true"
          @dragstart="onStudentDragStart(entry.student.id, $event)"
          @dragend="onStudentDragEnd"
          @click="onUnassignedStudentClick(entry.student.id)"
        >
          <span
            class="personAlias"
            @contextmenu.prevent.stop="openMoveMenu(entry.student, $event)"
          >{{ entry.student.alias }}</span>
          <span v-if="hobbyKeywordQuery.trim()" class="personScore">score {{ Math.round(entry.score) }}</span>
          <div v-if="getTopSkillLabels(entry.student, 1).length > 0" class="personTopSkills" aria-hidden="true">
            <span
              v-for="skill in getTopSkillLabels(entry.student, 1)"
              :key="`skill-${entry.student.id}-${skill}`"
              class="personTopSkill"
            >
              {{ skill }}
            </span>
          </div>
          <div v-if="displayedHobbyAreas(entry.student).length > 0" class="personHobbyDots" aria-hidden="true">
            <span
              v-for="hobby in displayedHobbyAreas(entry.student)"
              :key="`dot-${entry.student.id}-${hobby}`"
              class="personHobbyDot"
              :style="{ backgroundColor: String(getHobbyTagStyle(hobby).backgroundColor ?? '#e5e7eb') }"
            ></span>
          </div>
        </div>
        <div v-if="keywordScoredAvailableStudents.length === 0" class="unassignedEmpty">
          {{ availableStudents.length === 0 ? "All people are grouped." : "No people match this keyword." }}
        </div>
      </div>
    </section>

    <main class="groupingPage">
    <section
      v-for="group in groups"
      :key="group.id"
      class="groupRow level-3"
      :class="{
        dropGroupActive: activeDragGroupId === group.id,
        groupConfirmed: isGroupConfirmed(group.id),
      }"
    >
      <div class="groupHeader">
        <div class="groupTitleWrap">
          <span class="groupId">{{ group.id }}</span>
          <button
            class="collapseBtn"
            type="button"
            @click="toggleGroupCollapsed(group.id)"
          >
            <span>{{ isGroupCollapsed(group.id) ? "Expand" : "Collapse" }}</span>
            <span
              class="collapseCaret"
              :class="{ collapsed: isGroupCollapsed(group.id) }"
            >
              ▼
            </span>
          </button>
          <button
            class="groupConfirmBtn"
            :class="{ confirmed: isGroupConfirmed(group.id) }"
            type="button"
            @click="toggleGroupConfirm(group.id)"
          >
            {{ isGroupConfirmed(group.id) ? "Cancel" : "Confirm" }}
          </button>
        </div>
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

      <div
        v-show="!isGroupCollapsed(group.id)"
        class="slotRow"
        :style="{ '--slot-count': group.members.length }"
      >
        <div
          v-for="(member, slotIndex) in group.members"
          :key="slotIndex"
          class="slotCardWrap level-3"
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
            :class="{ filled: Boolean(member) }"
            type="button"
            @click="member ? openCompareDrawer(member.id) : toggleTip(group.id, slotIndex)"
          >
            <div v-if="member" class="memberContent">
              <div v-if="getMemberLeaderLabels(group.id, member.id).length" class="memberLeadTagWrap">
                <span
                  v-for="label in getMemberLeaderLabels(group.id, member.id)"
                  :key="`member-lead-${group.id}-${member.id}-${label}`"
                  class="memberLeadTag"
                >
                  {{ label }}
                </span>
              </div>
              <span
                class="memberAlias"
                @contextmenu.prevent.stop="openMoveMenu(member, $event)"
              >{{ member.alias }}</span>
              <div v-if="displayedAimingArea(member)" class="memberAimingRow">
                <span class="memberAimingChip">{{ displayedAimingArea(member) }}</span>
              </div>
              <div class="memberHobbyRow">
                <span
                  v-for="hobby in displayedHobbyAreas(member)"
                  :key="`member-${member.id}-${hobby}`"
                  class="memberHobbyChip"
                  :style="getHobbyTagStyle(hobby)"
                >
                  {{ formatHobbyLabel(hobby) }}
                </span>
                <span v-if="displayedHobbyAreas(member).length === 0" class="memberHobbyChip memberHobbyEmpty">
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
            <span class="slotPickerCaret">
              {{
                activeTip?.groupId === group.id && activeTip.slotIndex === slotIndex
                  ? "^"
                  : "v"
              }}
            </span>
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
          class="nextBtn level-2"
          type="button"
          aria-label="open group details"
          @click="openGroupDetails(group.id)"
        >
          <span class="nextArrowText" aria-hidden="true">&gt;</span>
        </button>
      </div>

      <div
        v-if="!isGroupCollapsed(group.id) && getGroupScoreWarnings(group.id).length"
        class="footerBar"
      >
        <span class="footerWarnTitle">Warning:</span>
        <span class="footerWarnText">{{ getGroupScoreWarnings(group.id).join(" · ") }}</span>
      </div>
    </section>

    <div v-if="detailsOpen" class="drawerBackdrop" @click="closeGroupDetails"></div>
    <aside class="detailsDrawer" :class="{ open: detailsOpen }">
      <button class="drawerClose" type="button" aria-label="close details" @click="closeGroupDetails">
        x</button>

      <GroupDetails
        v-if="selectedGroup"
        :key="selectedGroup.id"
        :panelTitle="`Group ${selectedGroup.id} Details`"
        :groupMembers="selectedGroupMembers"
        :groupSlots="selectedGroupSlots"
        :groupId="selectedGroup.id"
        :canAddSlot="canSelectedGroupAddSlot"
        :canRemoveEmptySlot="canSelectedGroupRemoveEmptySlot"
        :addSlotWarning="selectedGroupAddSlotWarning"
        :removeSlotWarning="selectedGroupRemoveSlotWarning"
        @update-group-slots="onGroupDetailsUpdateSlots"
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
          @click="moveStudentToGroup(target.id)"
        >
          <span>Move to Group {{ target.id }}</span>
          <span class="globalMoveMeta">{{ target.statusText }}</span>
        </button>
      </div>
    </div>
  </main>
  
</template>

<style scoped>
.groupingLayout {
  min-height: 100vh;
  background: #f3f4f6;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.groupSizeSection {
  background: #d2d2d4;
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.groupSizeSection + .unassignedSection {
  margin-top: 14px;
}

.groupSizeLabel {
  font-size: 14px;
  font-weight: 700;
  color: #111;
}

.groupSizeStepper {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.groupSizeBtn {
  border: 1px solid #b4b7be;
  background: #f1f1f2;
  color: #111;
  border-radius: 8px;
  width: 30px;
  height: 30px;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.groupSizeBtn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.groupSizeValue {
  min-width: 18px;
  text-align: center;
  font-size: 18px;
  line-height: 1;
  font-weight: 700;
  color: #111827;
}

.groupSizeHint {
  font-size: 12px;
  color: #4b5563;
}

.groupingPage {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.unassignedSection + .groupingPage {
  margin-top: 14px;
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

.keywordSearchWrap {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.keywordSearchInput {
  width: 100%;
  box-sizing: border-box;
  min-height: 34px;
  border: 1px solid #bfc4cd;
  border-radius: 8px;
  padding: 0 10px;
  font-size: 13px;
  background: #ffffff;
}

.modeSwitch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.modeSwitchBtn {
  border: 1px solid #c8cdd5;
  background: #ffffff;
  color: #374151;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.modeSwitchBtn.active {
  border-color: #1f8a53;
  background: #dff3e7;
  color: #166534;
}

.embeddingHint {
  margin: 0;
  font-size: 11px;
  color: #4b5563;
}

.embeddingHintError {
  color: #b91c1c;
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
  position: relative;
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

.personAlias {
  display: block;
}

.personScore {
  margin-top: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #e5e7eb;
  color: #374151;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
}

.personHobbyDots {
  position: absolute;
  right: 6px;
  bottom: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.personHobbyDot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
}

.personTopSkills {
  position: absolute;
  left: 6px;
  bottom: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  max-width: calc(100% - 34px);
}

.personTopSkill {
  min-height: 12px;
  border-radius: 999px;
  padding: 1px 4px;
  font-size: 8px;
  line-height: 1;
  font-weight: 700;
  color: #334155;
  background: #eef3f8;
  white-space: nowrap;
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
  gap: 10px;
  transition: box-shadow 0.16s ease;
  background: #ffffff;
  border: 1px solid #d7dbe2;
  border-radius: 12px;
  padding: 12px 14px;
}

.groupRow.groupConfirmed {
  background: #dff3e7;
  border-color: #8bc8a4;
}

.groupRow.dropGroupActive {
  box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.25);
  border-radius: 8px;
}

.groupHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 26px;
}

.groupTitleWrap {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.groupId {
  font-size: 30px;
  line-height: 1;
  color: #222;
  font-weight: 500;
}

.collapseBtn {
  border: 1px solid #c5c7ce;
  background: #f8f8f9;
  border-radius: 999px;
  min-height: 28px;
  padding: 3px 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #111;
  cursor: pointer;
}

.groupConfirmBtn {
  border: 1px solid #167243;
  background: #1f8a53;
  color: #fff;
  border-radius: 999px;
  min-height: 28px;
  padding: 3px 10px;
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.groupConfirmBtn.confirmed {
  border-color: #9a2f2f;
  background: #bf3f3f;
}

.collapseCaret {
  display: inline-block;
  transition: transform 0.18s ease;
}

.collapseCaret.collapsed {
  transform: rotate(-90deg);
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
  border: 1px solid rgba(148, 163, 184, 0.45);
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
  background: #f4f4f4;
  border-radius: 14px;
  padding: 14px;
  display: grid;
  gap: 12px;
  min-height: 160px;
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
  background: #e9e9e9;
  position: relative;
  overflow: hidden;
  display: grid;
  place-items: center;
  border-radius: 16px;
}

.slotCard.filled {
  background: #ffffff;
}

.memberContent {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 12px;
  gap: 10px;
}

.memberLeadTagWrap {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: calc(100% - 20px);
  z-index: 2;
}

.memberLeadTag {
  display: inline-flex;
  align-items: center;
  border: none;
  border-radius: 999px;
  background: #93c5fd;
  color: #ffffff;
  font-size: 10px;
  line-height: 1;
  font-weight: 700;
  padding: 4px 8px;
  white-space: nowrap;
}

.memberAlias {
  font-size: clamp(16px, 1.7vw, 24px);
  line-height: 1.2;
  color: #475569;
  font-weight: 700;
  margin: 0;
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: calc(100% - 24px);
  text-align: center;
  word-break: break-word;
  z-index: 1;
}

.memberAimingRow {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, calc(-50% + 28px));
  width: calc(100% - 24px);
  display: flex;
  justify-content: center;
  z-index: 1;
  pointer-events: none;
}

.memberAimingChip {
  min-height: 20px;
  border-radius: 999px;
  border: 1px solid #94a3b8;
  padding: 2px 8px;
  font-size: 10px;
  line-height: 1;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  background: #ffffff;
  color: #64748b;
}

.memberHobbyRow {
  display: flex;
  width: 100%;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 6px;
  align-content: flex-start;
  max-height: 56px;
  overflow: auto;
}

.memberHobbyChip {
  min-height: 20px;
  border-radius: 999px;
  border: none;
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
  font-size: clamp(42px, 6vw, 58px);
  line-height: 1;
  color: #6b7280;
  font-weight: 500;
  opacity: 0.75;
}

.removeBtn {
  position: absolute;
  top: 22px;
  right: 22px;
  border: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(55, 65, 81, 0.9);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.slotPicker {
  border: 1px solid rgba(0, 0, 0, 0.18);
  background: #ffffff;
  border-radius: 10px;
  min-height: 38px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  cursor: pointer;
}

.slotPickerText {
  font-size: 14px;
  font-weight: 600;
  opacity: 0.9;
  color: #111827;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slotPickerCaret {
  font-size: 14px;
  color: #6b7280;
  opacity: 0.7;
  line-height: 1;
}

.topTip {
  position: absolute;
  left: 12px;
  right: 12px;
  top: 0;
  width: auto;
  max-height: 260px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.14);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  z-index: 30;
  overflow: hidden;
  padding: 0;
}

.tipSearchWrap {
  padding: 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.tipSearchInput {
  width: 100%;
  box-sizing: border-box;
  height: 34px;
  padding: 0 10px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  border-radius: 10px;
  background: #fff;
  font-size: 13px;
  outline: none;
}

.tipList {
  max-height: 220px;
  overflow-y: auto;
  display: grid;
  gap: 6px;
  padding: 6px;
}

.tipItem {
  width: 100%;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #fafafa;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.tipItem:hover {
  background: #f0f0f0;
}

.tipEmpty {
  padding: 12px;
  font-size: 12px;
  color: #4b5563;
  opacity: 0.7;
}

.nextBtn {
  border: 1px solid #bfdbfe;
  background: #dbeafe;
  border-radius: 12px;
  width: 44px;
  min-width: 44px;
  min-height: 132px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, transform 0.12s ease;
}

.nextBtn:hover {
  background: #bfdbfe;
  border-color: #93c5fd;
}

.nextBtn:active {
  transform: translateX(1px);
}

.nextArrowText {
  color: #2563eb;
  font-size: 28px;
  line-height: 1;
  font-weight: 700;
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
  min-height: 34px;
  border-radius: 8px;
  background: #fff7ed;
  border: 1px solid #fdba74;
  color: #9a3412;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 12px;
}

.footerWarnTitle {
  font-weight: 700;
  white-space: nowrap;
}

.footerWarnText {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

@media (max-width: 920px) {
  .slotRow {
    grid-template-columns: repeat(3, minmax(100px, 1fr));
  }

  .nextBtn {
    min-height: 90px;
    width: 40px;
    min-width: 40px;
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
