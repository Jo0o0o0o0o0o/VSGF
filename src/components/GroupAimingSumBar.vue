<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import EmbeddingAreaBarChart from "@/components/EmbeddingAreaBarChart.vue";
import ivis21AimingJson from "@/data/IVIS21_aming.json";
import ivis22AimingJson from "@/data/IVIS22_aming.json";
import ivis21AimingAreaJson from "@/data/IVIS21_aiming_area.json";
import ivis22AimingAreaJson from "@/data/IVIS22_aiming_area.json";
import { EMBEDDING_MODEL_ID } from "@/embeddings/config";
import type { EmbeddingAreaDatum } from "@/d3Viz/createEmbeddingAreaBarChart";
import type { IvisRecord } from "@/types/ivis23";
import { activeYear, makeYearStorageKey, type DatasetYear } from "@/types/dataSource";

const props = defineProps<{
  people: IvisRecord[];
}>();

type AimingEntry = {
  id: number;
  alias: string;
  aiming_raw: string;
};

type AimingAreaEntry = {
  area_key: string;
  area_label: string;
  description?: string;
};

const AIMING_EMBED_SCORE_MAX_PER_PERSON = 20;
const AIMING_EMBED_SCORE_GAMMA = 2.1;
const status = ref<"idle" | "loading" | "ready" | "error">("idle");
const errorMessage = ref("");
const scores = ref<EmbeddingAreaDatum[]>([]);

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
const supportsAimingSum = computed(() => activeAimingAreas.value.length > 0 && activeAimingRows.value.length > 0);
const chartMaxScore = computed(() =>
  Math.max(AIMING_EMBED_SCORE_MAX_PER_PERSON, props.people.length * AIMING_EMBED_SCORE_MAX_PER_PERSON),
);

const aimingAreaQueryEmbeddingCache = new Map<string, number[]>();
const aimingStudentEmbeddingCache = new Map<number, number[]>();
const AIMING_AREA_QUERY_CACHE_KEY = makeYearStorageKey(
  `group_aiming_area_query_embeddings_${EMBEDDING_MODEL_ID.replace(/[^a-z0-9]+/gi, "_")}`,
);
const AIMING_STUDENT_CACHE_KEY = makeYearStorageKey(
  `group_aiming_student_embeddings_${EMBEDDING_MODEL_ID.replace(/[^a-z0-9]+/gi, "_")}`,
);

let embeddingWorker: Worker | null = null;
let workerRequestId = 0;
const workerPending = new Map<
  number,
  {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }
>();

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

function persistCaches() {
  try {
    localStorage.setItem(AIMING_AREA_QUERY_CACHE_KEY, JSON.stringify(Object.fromEntries(aimingAreaQueryEmbeddingCache.entries())));
    localStorage.setItem(AIMING_STUDENT_CACHE_KEY, JSON.stringify(Object.fromEntries(aimingStudentEmbeddingCache.entries())));
  } catch {
    // ignore storage failures
  }
}

function restoreCaches() {
  try {
    const rawQueries = localStorage.getItem(AIMING_AREA_QUERY_CACHE_KEY);
    if (rawQueries) {
      const parsed = JSON.parse(rawQueries) as Record<string, number[]>;
      Object.entries(parsed).forEach(([key, vector]) => {
        if (!Array.isArray(vector)) return;
        aimingAreaQueryEmbeddingCache.set(key, vector.map((v) => Number(v)));
      });
    }
    const rawStudents = localStorage.getItem(AIMING_STUDENT_CACHE_KEY);
    if (rawStudents) {
      const parsed = JSON.parse(rawStudents) as Record<string, number[]>;
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

function buildAimingAreaEmbeddingQuery(area: AimingAreaEntry) {
  const label = area.area_label?.trim() || area.area_key;
  const desc = area.description?.trim() ?? "";
  return desc ? `${label}: ${desc}` : label;
}

async function ensureAimingAreaQueryEmbedding(area: AimingAreaEntry) {
  const cacheKey = area.area_key;
  if (aimingAreaQueryEmbeddingCache.has(cacheKey)) {
    return aimingAreaQueryEmbeddingCache.get(cacheKey) ?? [];
  }
  const query = buildAimingAreaEmbeddingQuery(area);
  const result = await callEmbeddingWorker<{ query: string; vector: number[] }>({
    type: "embed-query",
    payload: { query },
  });
  const normalized = normalizeVector(result.vector ?? []);
  aimingAreaQueryEmbeddingCache.set(cacheKey, normalized);
  persistCaches();
  return normalized;
}

async function ensureAimingStudentEmbedding(personId: number, aimingRaw: string) {
  if (aimingStudentEmbeddingCache.has(personId)) {
    return aimingStudentEmbeddingCache.get(personId) ?? [];
  }
  const result = await callEmbeddingWorker<{ query: string; vector: number[] }>({
    type: "embed-query",
    payload: { query: aimingRaw },
  });
  const normalized = normalizeVector(result.vector ?? []);
  aimingStudentEmbeddingCache.set(personId, normalized);
  persistCaches();
  return normalized;
}

function mapAimingEmbeddingScore(raw: number, minRaw: number, maxRaw: number) {
  if (raw <= 0) return 0;
  if (maxRaw <= minRaw + 1e-9) return AIMING_EMBED_SCORE_MAX_PER_PERSON;
  const normalized = Math.max(0, Math.min(1, (raw - minRaw) / (maxRaw - minRaw)));
  const contrasted = normalized ** AIMING_EMBED_SCORE_GAMMA;
  return contrasted * AIMING_EMBED_SCORE_MAX_PER_PERSON;
}

async function updateScores() {
  if (!props.people.length) {
    scores.value = [];
    status.value = "idle";
    return;
  }
  if (!supportsAimingSum.value) {
    scores.value = [];
    status.value = "ready";
    return;
  }

  status.value = "loading";
  errorMessage.value = "";
  try {
    ensureEmbeddingWorker();
    await callEmbeddingWorker<{ ok: true }>({ type: "warmup", payload: {} });

    const members = props.people.filter((person) => {
      const aimingRaw = activeAimingById.value.get(person.id)?.aiming_raw ?? "";
      return aimingRaw.trim().length > 0;
    });
    if (!members.length) {
      scores.value = [];
      status.value = "ready";
      return;
    }

    const areaVectors = new Map<string, number[]>();
    await Promise.all(
      activeAimingAreas.value.map(async (area) => {
        areaVectors.set(area.area_key, await ensureAimingAreaQueryEmbedding(area));
      }),
    );

    const sumByArea = new Map<string, number>(activeAimingAreas.value.map((area) => [area.area_key, 0]));
    for (const member of members) {
      const aimingRaw = activeAimingById.value.get(member.id)?.aiming_raw ?? "";
      const studentVec = await ensureAimingStudentEmbedding(member.id, aimingRaw);
      if (!studentVec.length) continue;

      const rawRows = activeAimingAreas.value.map((area) => {
        const queryVec = areaVectors.get(area.area_key) ?? [];
        const raw = queryVec.length ? Math.max(0, dot(studentVec, queryVec)) : 0;
        return { areaKey: area.area_key, raw };
      });

      const positives = rawRows.map((row) => row.raw).filter((v) => v > 0);
      const minRaw = positives.length ? Math.min(...positives) : 0;
      const maxRaw = positives.length ? Math.max(...positives) : 0;
      for (const row of rawRows) {
        const mapped = mapAimingEmbeddingScore(row.raw, minRaw, maxRaw);
        sumByArea.set(row.areaKey, (sumByArea.get(row.areaKey) ?? 0) + mapped);
      }
    }

    scores.value = activeAimingAreas.value.map((area) => ({
      areaKey: area.area_key,
      areaLabel: area.area_label,
      score: Number((sumByArea.get(area.area_key) ?? 0).toFixed(2)),
      rawScore: Number((sumByArea.get(area.area_key) ?? 0).toFixed(2)),
    }));
    status.value = "ready";
  } catch (error) {
    scores.value = [];
    status.value = "error";
    errorMessage.value = error instanceof Error ? error.message : "Failed to compute group aiming scores.";
  }
}

onMounted(() => {
  restoreCaches();
});

watch(
  () => props.people.map((p) => p.id).join(","),
  () => {
    updateScores();
  },
  { immediate: true },
);

watch(activeYear, () => {
  aimingAreaQueryEmbeddingCache.clear();
  aimingStudentEmbeddingCache.clear();
  updateScores();
});

onBeforeUnmount(() => {
  workerPending.forEach((pending) => pending.reject(new Error("Embedding worker terminated.")));
  workerPending.clear();
  embeddingWorker?.terminate();
  embeddingWorker = null;
});
</script>

<template>
  <div class="panel level-1 embeddingPanel">
    <h3>Group Aiming Sum</h3>
    <div class="embeddingAreaWrap">
      <EmbeddingAreaBarChart
        :data="scores"
        :maxScore="chartMaxScore"
        barColor="#93c5fd"
      />
    </div>
    <p v-if="people.length === 0" class="embeddingHint">
      Select people to view group aiming-area scores.
    </p>
    <p v-else-if="!supportsAimingSum" class="embeddingHint">
      No aiming data for this year.
    </p>
    <p
      v-else-if="status === 'ready' && scores.every((row) => row.score === 0)"
      class="embeddingHint"
    >
      No raw aiming answers available for scoring in this group.
    </p>
    <p v-else-if="status === 'loading'" class="embeddingHint">
      Loading aiming scores...
    </p>
    <p v-else-if="status === 'error'" class="embeddingHint embeddingHintError">
      Failed to load aiming scores. {{ errorMessage }}
    </p>
  </div>
</template>

<style scoped>
.embeddingPanel {
  min-height: 0;
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
</style>

