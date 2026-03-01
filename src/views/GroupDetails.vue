<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import CompareSlotsBar from "@/components/CompareSlotsBar.vue";
import RadarChart from "@/components/RadarChart.vue";
import GroupDetailsHeatmap from "@/components/GroupDetailsHeatmap.vue";
import StackBar from "@/components/stackbar.vue";
import EmbeddingAreaBarChart from "@/components/EmbeddingAreaBarChart.vue";
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
import { getActiveEmbeddings, makeYearStorageKey } from "@/types/dataSource";
import { formatHobbyLabel } from "@/utils/hobbyTagColorMap";

const props = withDefaults(
  defineProps<{
    groupMembers?: IvisRecord[];
    panelTitle?: string;
    compact?: boolean;
  }>(),
  {
    groupMembers: () => [],
    panelTitle: "Group Details",
    compact: false,
  },
);

const MAX = 5;
const allAxes = RADAR_AXES;
const reducedDefaultKeys = new Set<RadarKey>([
  "computer_graphics_programming",
  "human_computer_interaction_programming",
  "user_experience_evaluation",
  "code_repository",
]);
const activeAxes = ref(allAxes.filter((a) => !reducedDefaultKeys.has(a.key)));

const focusIndex = ref<number | null>(null);
const slots = ref<(IvisRecord | null)[]>(Array.from({ length: MAX }, () => null));
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
}

function setActiveAxes(v: { key: RadarKey; label: string }[]) {
  activeAxes.value = v;
}

const isBoundGroupMode = computed(() => props.groupMembers.length > 0);

const selectedPeople = computed(() =>
  isBoundGroupMode.value ? props.groupMembers : (slots.value.filter(Boolean) as IvisRecord[]),
);

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

const groupAreaChartMaxScore = computed(() =>
  Math.max(AREA_EMBED_SCORE_MAX_PER_PERSON, selectedPeople.value.length * AREA_EMBED_SCORE_MAX_PER_PERSON),
);

watch(
  () => selectedPeople.value.length,
  (len) => {
    if (focusIndex.value !== null && (focusIndex.value < 0 || focusIndex.value >= len)) {
      focusIndex.value = null;
    }
  },
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

    <CompareSlotsBar
      v-if="!isBoundGroupMode"
      :slots="slots"
      :max="MAX"
      :focusIndex="focusIndex"
      @update-slot="setSlot"
      @toggle-focus="toggleFocus"
    />

    <section class="grid">
      <div class="panel level-1 big">
        <h3>Ratings Heatmap</h3>
        <div class="heatmapChartWrap">
          <GroupDetailsHeatmap
            :dogs="selectedRadarPeople"
            :axes="activeAxes"
            :focusIndex="focusIndex"
            @toggleFocus="toggleFocus"
          />
        </div>

        <h3>Ratings Stacked Bar</h3>
        <div class="stackBarWrap">
          <StackBar
            :dogs="selectedRadarPeople"
            :axes="activeAxes"
            :focusIndex="focusIndex"
            @toggleFocus="toggleFocus"
          />
        </div>

        <h3>Ratings Radar Compare</h3>
        <div class="radarChartWrap">
          <RadarChart
            :dogs="selectedRadarPeople"
            :axes="activeAxes"
            :focusIndex="focusIndex"
            @toggleFocus="toggleFocus"
          />
        </div>
      </div>
    </section>

    <section class="embeddingSection">
      <div class="panel level-1 narrow">
        <AxisSelector
          :allAxes="allAxes"
          :activeAxes="activeAxes"
          @update:activeAxes="setActiveAxes"
        />
      </div>

      <div class="panel level-1 embeddingPanel">
        <h3>Hobby Area Embedding (Group Sum)</h3>
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

.embeddingPanel {
  min-height: 0;
}

.comparePage.compact .grid {
  grid-template-columns: 1fr;
}
</style>

