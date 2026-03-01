<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import CompareSlotsBar from "@/components/CompareSlotsBar.vue";
import EmbeddingAreaBarChart from "@/components/EmbeddingAreaBarChart.vue";
import RadarChart from "@/components/RadarChart.vue";
import AxisSelector from "@/components/AxisSelector.vue";
import type { EmbeddingAreaDatum } from "@/d3Viz/createEmbeddingAreaBarChart";
import {
  RADAR_AXES,
  type RadarDog,
  type RadarKey,
} from "@/d3Viz/createRadarChart";
import hobbyAreaRulesRaw from "@/data/hobby_area_rules.json";
import { EMBEDDING_MODEL_ID, EMBEDDING_TEXT_BUILDER_VERSION } from "@/embeddings/config";
import type { IvisRecord } from "@/types/ivis23";
import { getActiveEmbeddings, getActiveRecords, makeYearStorageKey } from "@/types/dataSource";
import { formatHobbyLabel } from "@/utils/hobbyTagColorMap";
import { COMPARE_PERSON_EVENT, readComparePersonId, writeComparePersonId } from "@/utils/compareSelection";

const MAX = 1;
const allAxes = RADAR_AXES;
const activeAxes = ref(allAxes);
const allPeople = getActiveRecords() as IvisRecord[];

const focusIndex = ref<number | null>(null);
const slots = ref<(IvisRecord | null)[]>(Array.from({ length: MAX }, () => null));
const peopleById = new Map(allPeople.map((p) => [p.id, p] as const));
const areaEmbeddingStatus = ref<"idle" | "loading" | "ready" | "error">("idle");
const areaEmbeddingErrorMessage = ref("");
const selectedPersonAreaEmbeddingScores = ref<EmbeddingAreaDatum[]>([]);
const AREA_EMBED_SCORE_MAX = 20;
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
  `compare_area_query_embeddings_${EMBEDDING_MODEL_ID.replace(/[^a-z0-9]+/gi, "_")}_${EMBEDDING_TEXT_BUILDER_VERSION}`,
);
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
  focusIndex.value = focusIndex.value === i ? null : i;
}

function setSlot(i: number, person: IvisRecord | null) {
  slots.value[i] = person;
  if (i === 0) {
    writeComparePersonId(person?.id ?? null);
  }
}

function setActiveAxes(v: { key: RadarKey; label: string }[]) {
  activeAxes.value = v;
}

const selectedPeople = computed(() => slots.value.filter(Boolean) as IvisRecord[]);
const selectedPerson = computed<IvisRecord | null>(() => slots.value[0] ?? null);

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

const averageRadarPerson = computed<RadarDog | null>(() => {
  if (!allPeople.length) return null;
  const count = allPeople.length;
  const sum = allPeople.reduce(
    (acc, p) => {
      acc.information_visualization += p.ratings.information_visualization;
      acc.statistical += p.ratings.statistical;
      acc.mathematics += p.ratings.mathematics;
      acc.drawing_and_artistic += p.ratings.drawing_and_artistic;
      acc.computer_usage += p.ratings.computer_usage;
      acc.programming += p.ratings.programming;
      acc.computer_graphics_programming += p.ratings.computer_graphics_programming;
      acc.human_computer_interaction_programming += p.ratings.human_computer_interaction_programming;
      acc.user_experience_evaluation += p.ratings.user_experience_evaluation;
      acc.communication += p.ratings.communication;
      acc.collaboration += p.ratings.collaboration;
      acc.code_repository += p.ratings.code_repository;
      return acc;
    },
    {
      information_visualization: 0,
      statistical: 0,
      mathematics: 0,
      drawing_and_artistic: 0,
      computer_usage: 0,
      programming: 0,
      computer_graphics_programming: 0,
      human_computer_interaction_programming: 0,
      user_experience_evaluation: 0,
      communication: 0,
      collaboration: 0,
      code_repository: 0,
    },
  );

  return {
    name: "Average",
    information_visualization: Number((sum.information_visualization / count).toFixed(2)),
    statistical: Number((sum.statistical / count).toFixed(2)),
    mathematics: Number((sum.mathematics / count).toFixed(2)),
    drawing_and_artistic: Number((sum.drawing_and_artistic / count).toFixed(2)),
    computer_usage: Number((sum.computer_usage / count).toFixed(2)),
    programming: Number((sum.programming / count).toFixed(2)),
    computer_graphics_programming: Number((sum.computer_graphics_programming / count).toFixed(2)),
    human_computer_interaction_programming: Number((sum.human_computer_interaction_programming / count).toFixed(2)),
    user_experience_evaluation: Number((sum.user_experience_evaluation / count).toFixed(2)),
    communication: Number((sum.communication / count).toFixed(2)),
    collaboration: Number((sum.collaboration / count).toFixed(2)),
    code_repository: Number((sum.code_repository / count).toFixed(2)),
  };
});

const radarPeopleWithAverage = computed<RadarDog[]>(() => {
  const base = selectedRadarPeople.value;
  const avg = averageRadarPerson.value;
  if (!avg || base.length === 0) return base;
  return [...base, avg];
});

function syncFromStoredSelection() {
  const selectedId = readComparePersonId();
  if (selectedId === null) {
    slots.value[0] = null;
    focusIndex.value = null;
    return;
  }
  slots.value[0] = peopleById.get(selectedId) ?? null;
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
    areaEmbeddingStatus.value = "error";
    areaEmbeddingErrorMessage.value =
      "Precomputed embeddings metadata does not match configured model/version.";
    return;
  }

  areaEmbeddingStatus.value = "loading";
  areaEmbeddingErrorMessage.value = "";

  try {
    ensureEmbeddingWorker();
    await callEmbeddingWorker<{ ok: true }>({ type: "warmup", payload: {} });
    await Promise.all(hobbyAreaKeys.map((areaKey) => ensureAreaQueryEmbedding(areaKey)));
    areaEmbeddingStatus.value = "ready";
  } catch (error) {
    areaEmbeddingStatus.value = "error";
    areaEmbeddingErrorMessage.value =
      error instanceof Error ? error.message : "Failed to preload area embeddings.";
  }
}

function mapAreaEmbeddingScore(raw: number, minRaw: number, maxRaw: number) {
  if (raw <= 0) return 0;
  if (maxRaw <= minRaw + 1e-9) return AREA_EMBED_SCORE_MAX;
  const normalized = Math.max(0, Math.min(1, (raw - minRaw) / (maxRaw - minRaw)));
  const contrasted = normalized ** AREA_EMBED_SCORE_GAMMA;
  return contrasted * AREA_EMBED_SCORE_MAX;
}

async function updateSelectedPersonAreaEmbeddingScores() {
  const person = selectedPerson.value;
  const seq = ++areaEmbeddingTaskSeq;
  if (!person) {
    selectedPersonAreaEmbeddingScores.value = [];
    return;
  }
  if (!person.hobby_raw.trim()) {
    selectedPersonAreaEmbeddingScores.value = [];
    return;
  }
  if (!precomputedEmbeddingsCompatible) {
    areaEmbeddingStatus.value = "error";
    areaEmbeddingErrorMessage.value =
      "Precomputed embeddings metadata does not match configured model/version.";
    selectedPersonAreaEmbeddingScores.value = [];
    return;
  }

  areaEmbeddingStatus.value = "loading";
  areaEmbeddingErrorMessage.value = "";

  try {
    await startAreaEmbeddingPreload();
    const studentVec = studentEmbeddingById.get(person.id);
    if (!studentVec?.length) {
      throw new Error("Selected person has no precomputed embedding vector.");
    }

    const rawRows = await Promise.all(
      hobbyAreaKeys.map(async (areaKey) => {
        const queryVec = await ensureAreaQueryEmbedding(areaKey);
        const raw = queryVec.length ? Math.max(0, dot(studentVec, queryVec)) : 0;
        return {
          areaKey,
          areaLabel: formatHobbyLabel(areaKey),
          rawScore: raw,
        };
      }),
    );

    if (seq !== areaEmbeddingTaskSeq) return;

    const positives = rawRows.map((row) => row.rawScore).filter((v) => v > 0);
    const minRaw = positives.length ? Math.min(...positives) : 0;
    const maxRaw = positives.length ? Math.max(...positives) : 0;

    selectedPersonAreaEmbeddingScores.value = rawRows.map((row) => ({
      ...row,
      score: Number(mapAreaEmbeddingScore(row.rawScore, minRaw, maxRaw).toFixed(2)),
    }));
    areaEmbeddingStatus.value = "ready";
  } catch (error) {
    if (seq !== areaEmbeddingTaskSeq) return;
    selectedPersonAreaEmbeddingScores.value = [];
    areaEmbeddingStatus.value = "error";
    areaEmbeddingErrorMessage.value =
      error instanceof Error ? error.message : "Failed to compute area embedding scores.";
  }
}

onMounted(() => {
  syncFromStoredSelection();
  window.addEventListener("storage", syncFromStoredSelection);
  window.addEventListener(COMPARE_PERSON_EVENT, syncFromStoredSelection);
  startAreaEmbeddingPreload();
});

watch(selectedPerson, () => {
  updateSelectedPersonAreaEmbeddingScores();
}, { immediate: true });

onBeforeUnmount(() => {
  window.removeEventListener("storage", syncFromStoredSelection);
  window.removeEventListener(COMPARE_PERSON_EVENT, syncFromStoredSelection);
  workerPending.forEach((pending) => pending.reject(new Error("Embedding worker terminated.")));
  workerPending.clear();
  embeddingWorker?.terminate();
  embeddingWorker = null;
});
</script>

<template>
  <main class="comparePage">
    <section class="topRow">
      <CompareSlotsBar
        class="slotsPanel"
        :slots="slots"
        :max="MAX"
        :focusIndex="focusIndex"
        @update-slot="setSlot"
        @toggle-focus="toggleFocus"
      />
      <section class="panel embeddingPanel">
        <h3>Hobby Area Embedding</h3>
        <div class="embeddingChartWrap">
          <EmbeddingAreaBarChart :data="selectedPersonAreaEmbeddingScores" />
        </div>
        <p v-if="!selectedPerson" class="embeddingHint">
          Select a person to view area-level embedding scores.
        </p>
        <p v-else-if="!selectedPerson.hobby_raw.trim()" class="embeddingHint">
          No raw hobby answer, so embedding area scores are unavailable.
        </p>
        <p v-else-if="areaEmbeddingStatus === 'loading'" class="embeddingHint">
          Loading embedding model...
        </p>
        <p v-else-if="areaEmbeddingStatus === 'error'" class="embeddingHint embeddingHintError">
          Failed to load embedding scores. {{ areaEmbeddingErrorMessage }}
        </p>
      </section>
    </section>

    <section class="grid">
      <div class="panel big">
        <h3>Ratings Radar Compare</h3>
        <div class="radarChartWrap">
          <RadarChart
            :dogs="radarPeopleWithAverage"
            :axes="activeAxes"
            :focusIndex="focusIndex"
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
    </section>

    <section class="panel rawHobbyPanel">
      <h3>Raw Hobby Answer</h3>
      <p v-if="selectedPerson" class="rawHobbyText">
        {{ selectedPerson.hobby_raw || "No raw hobby answer." }}
      </p>
      <p v-else class="rawHobbyEmpty">
        Select a person to view their original hobby response.
      </p>
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

.topRow {
  display: grid;
  grid-template-columns: minmax(250px, 0.9fr) 2fr;
  gap: 12px;
  align-items: stretch;
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
  min-height: 540px;
  display: flex;
  flex-direction: column;
}

.radarChartWrap {
  height: 430px;
  min-height: 390px;
}

.panel.narrow {
  min-height: 0;
}

.embeddingPanel {
  display: flex;
  flex-direction: column;
  min-height: 260px;
}

.embeddingChartWrap {
  height: 220px;
  min-height: 180px;
}

.embeddingHint {
  margin: 10px 0 0;
  color: #6b7280;
  font-size: 12px;
}

.embeddingHintError {
  color: #b91c1c;
}

.rawHobbyPanel {
  background: #f8f8f8;
}

.rawHobbyText {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.5;
  color: #1f2937;
}

.rawHobbyEmpty {
  margin: 0;
  color: #6b7280;
}

@media (max-width: 980px) {
  .topRow {
    grid-template-columns: 1fr;
  }

  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
