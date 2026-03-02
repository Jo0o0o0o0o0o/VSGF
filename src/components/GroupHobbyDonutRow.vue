<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import EmbeddingAreaDonutChart from "@/components/EmbeddingAreaDonutChart.vue";
import type { EmbeddingAreaDatum } from "@/d3Viz/createEmbeddingAreaBarChart";
import type { CompareGroup } from "@/types/compareGroup";
import { formatHobbyLabel } from "@/utils/hobbyTagColorMap";
import hobbyAreaRulesRaw from "@/data/hobby_area_rules.json";
import { EMBEDDING_MODEL_ID, EMBEDDING_TEXT_BUILDER_VERSION } from "@/embeddings/config";
import { getActiveEmbeddings } from "@/types/dataSource";

const props = defineProps<{
  slots: Array<CompareGroup | null>;
}>();

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

const areaEmbeddingStatus = ref<"idle" | "loading" | "ready" | "error">("idle");
const slotDonutData = ref<EmbeddingAreaDatum[][]>(Array.from({ length: props.slots.length }, () => []));
const areaQueryEmbeddingCache = new Map<string, number[]>();
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
const AREA_EMBED_SCORE_MAX_PER_PERSON = 20;
const AREA_EMBED_SCORE_GAMMA = 1.6;

const DONUT_COLORS = [
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#f97316",
  "#a78bfa",
  "#14b8a6",
  "#ef4444",
  "#3b82f6",
  "#84cc16",
  "#ec4899",
];

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
  return normalized;
}

async function startAreaEmbeddingPreload() {
  if (areaEmbeddingPreloadStarted) return;
  areaEmbeddingPreloadStarted = true;
  if (!precomputedEmbeddingsCompatible) {
    areaEmbeddingStatus.value = "error";
    return;
  }
  areaEmbeddingStatus.value = "loading";
  try {
    ensureEmbeddingWorker();
    await callEmbeddingWorker<{ ok: true }>({ type: "warmup", payload: {} });
    await Promise.all(hobbyAreaKeys.map((areaKey) => ensureAreaQueryEmbedding(areaKey)));
    areaEmbeddingStatus.value = "ready";
  } catch {
    areaEmbeddingStatus.value = "error";
  }
}

function mapAreaEmbeddingScore(raw: number, minRaw: number, maxRaw: number) {
  if (raw <= 0) return 0;
  if (maxRaw <= minRaw + 1e-9) return AREA_EMBED_SCORE_MAX_PER_PERSON;
  const normalized = Math.max(0, Math.min(1, (raw - minRaw) / (maxRaw - minRaw)));
  const contrasted = normalized ** AREA_EMBED_SCORE_GAMMA;
  return contrasted * AREA_EMBED_SCORE_MAX_PER_PERSON;
}

async function updateSlotDonutData() {
  const seq = ++areaEmbeddingTaskSeq;
  if (!precomputedEmbeddingsCompatible) {
    slotDonutData.value = Array.from({ length: props.slots.length }, () => []);
    areaEmbeddingStatus.value = "error";
    return;
  }

  areaEmbeddingStatus.value = "loading";
  try {
    await startAreaEmbeddingPreload();
    const areaVectors = new Map<string, number[]>();
    await Promise.all(
      hobbyAreaKeys.map(async (areaKey) => {
        areaVectors.set(areaKey, await ensureAreaQueryEmbedding(areaKey));
      }),
    );

    const next = await Promise.all(
      props.slots.map(async (slot) => {
        if (!slot) return [];
        const members = slot.members.filter(
          (member) => member.hobby_raw.trim().length > 0 && (studentEmbeddingById.get(member.id)?.length ?? 0) > 0,
        );
        if (!members.length) return [];

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

        return hobbyAreaKeys
          .map((areaKey) => ({
            areaKey,
            areaLabel: formatHobbyLabel(areaKey),
            score: Number((sumByArea.get(areaKey) ?? 0).toFixed(2)),
            rawScore: Number((sumByArea.get(areaKey) ?? 0).toFixed(2)),
          }))
          .filter((row) => row.score > 0)
          .sort((a, b) => b.score - a.score);
      }),
    );

    if (seq !== areaEmbeddingTaskSeq) return;
    slotDonutData.value = next;
    areaEmbeddingStatus.value = "ready";
  } catch {
    if (seq !== areaEmbeddingTaskSeq) return;
    slotDonutData.value = Array.from({ length: props.slots.length }, () => []);
    areaEmbeddingStatus.value = "error";
  }
}

const sharedLegend = computed(() => {
  const totals = new Map<string, number>();
  slotDonutData.value.forEach((rows) => {
    rows.forEach((row) => totals.set(row.areaKey, (totals.get(row.areaKey) ?? 0) + row.score));
  });
  return Array.from(totals.entries())
    .map(([areaKey, score]) => ({
      areaKey,
      areaLabel: formatHobbyLabel(areaKey),
      score,
    }))
    .sort((a, b) => b.score - a.score);
});

const colorByKey = computed<Record<string, string>>(() =>
  Object.fromEntries(
    sharedLegend.value.map((row, idx) => [row.areaKey, DONUT_COLORS[idx % DONUT_COLORS.length] ?? "#0ea5e9"]),
  ),
);

watch(
  () => props.slots.map((slot) => (slot ? `${slot.id}:${slot.members.map((member) => member.id).join(",")}` : "x")).join("|"),
  () => {
    updateSlotDonutData();
  },
  { immediate: true },
);

onMounted(() => {
  startAreaEmbeddingPreload();
});

onBeforeUnmount(() => {
  workerPending.forEach((pending) => pending.reject(new Error("Embedding worker terminated.")));
  workerPending.clear();
  embeddingWorker?.terminate();
  embeddingWorker = null;
});
</script>

<template>
  <section class="hobbyDonutRow level-1">
    <h3 class="rowTitle">Group Hobby Area Donuts</h3>
    <div class="hobbyDonutGrid">
      <div
        v-for="(slot, idx) in props.slots"
        :key="`group-hobby-donut-${idx}`"
        class="hobbyDonutCard level-1"
      >
        <div class="hobbyDonutTitle">
          {{ slot ? `Group ${slot.id}` : `Group Slot ${idx + 1}` }}
        </div>
        <div class="hobbyDonutChartWrap">
          <EmbeddingAreaDonutChart
            v-if="slot"
            :data="slotDonutData[idx] ?? []"
            :showLegend="false"
            :colorByKey="colorByKey"
          />
          <div v-else class="hobbyDonutEmpty">No group selected</div>
        </div>
      </div>
    </div>
    <aside class="sharedTopTip level-1">
      <div class="sharedTopTipTitle">Color = Dimension</div>
      <div v-if="sharedLegend.length" class="sharedTopTipList">
        <div v-for="row in sharedLegend" :key="`legend-${row.areaKey}`" class="sharedTopTipItem">
          <span class="sharedTopTipDot" :style="{ background: colorByKey[row.areaKey] }"></span>
          <span class="sharedTopTipText">{{ row.areaLabel }}</span>
        </div>
      </div>
      <div v-else class="sharedTopTipEmpty">No embedding dimensions.</div>
    </aside>
  </section>
</template>

<style scoped>
.hobbyDonutRow {
  display: grid;
  grid-template-columns: 1fr 190px;
  gap: 12px;
  align-items: start;
  padding: 12px;
}

.rowTitle {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.hobbyDonutGrid {
  display: grid;
  grid-template-columns: repeat(5, minmax(140px, 1fr));
  gap: 10px;
}

.hobbyDonutCard {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 220px;
}

.hobbyDonutTitle {
  font-size: 12px;
  font-weight: 700;
  color: #1f2937;
}

.hobbyDonutChartWrap {
  height: 200px;
  min-height: 200px;
}

.hobbyDonutEmpty {
  height: 100%;
  display: grid;
  place-items: center;
  color: #6b7280;
  font-size: 12px;
  text-align: center;
}

.sharedTopTip {
  position: sticky;
  top: 12px;
  padding: 10px;
}

.sharedTopTipTitle {
  font-size: 12px;
  font-weight: 700;
  color: #334155;
  margin-bottom: 6px;
}

.sharedTopTipList {
  display: grid;
  gap: 6px;
}

.sharedTopTipItem {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.sharedTopTipDot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.sharedTopTipText {
  font-size: 12px;
  color: #1f2937;
}

.sharedTopTipEmpty {
  font-size: 12px;
  color: #6b7280;
}

@media (max-width: 1280px) {
  .hobbyDonutRow {
    grid-template-columns: 1fr;
  }

  .sharedTopTip {
    position: static;
  }
}

@media (max-width: 1200px) {
  .hobbyDonutGrid {
    grid-template-columns: repeat(3, minmax(140px, 1fr));
  }
}

@media (max-width: 900px) {
  .hobbyDonutGrid {
    grid-template-columns: repeat(2, minmax(140px, 1fr));
  }
}

@media (max-width: 640px) {
  .hobbyDonutGrid {
    grid-template-columns: 1fr;
  }
}
</style>
