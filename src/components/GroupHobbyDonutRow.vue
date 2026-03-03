<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import EmbeddingAreaDonutChart from "@/components/EmbeddingAreaDonutChart.vue";
import type { EmbeddingAreaDatum } from "@/d3Viz/createEmbeddingAreaBarChart";
import type { CompareGroup } from "@/types/compareGroup";
import { formatHobbyLabel } from "@/utils/hobbyTagColorMap";
import hobbyAreaRulesRaw from "@/data/hobby_area_rules.json";
import ivis21AimingJson from "@/data/IVIS21_aming.json";
import ivis22AimingJson from "@/data/IVIS22_aming.json";
import ivis21AimingAreaJson from "@/data/IVIS21_aiming_area.json";
import ivis22AimingAreaJson from "@/data/IVIS22_aiming_area.json";
import { EMBEDDING_MODEL_ID, EMBEDDING_TEXT_BUILDER_VERSION } from "@/embeddings/config";
import { activeYear, getActiveEmbeddings, type DatasetYear } from "@/types/dataSource";

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
const precomputedEmbeddings = computed(
  () => getActiveEmbeddings() as PrecomputedEmbeddingsFile | null,
);
function normalizedMetaValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
const precomputedEmbeddingsCompatible = computed(
  () =>
    !!precomputedEmbeddings.value &&
    normalizedMetaValue(precomputedEmbeddings.value.model) === normalizedMetaValue(EMBEDDING_MODEL_ID) &&
    normalizedMetaValue(precomputedEmbeddings.value.textBuilderVersion) ===
      normalizedMetaValue(EMBEDDING_TEXT_BUILDER_VERSION),
);
const studentEmbeddingById = computed(
  () =>
    new Map<number, number[]>(
      precomputedEmbeddings.value?.embeddings.map((item) => [item.id, item.vector]) ?? [],
    ),
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
const supportsAimingMode = computed(() => activeAimingAreas.value.length > 0 && activeAimingRows.value.length > 0);
const donutMode = ref<"hobby" | "aiming">("hobby");

const areaEmbeddingStatus = ref<"idle" | "loading" | "ready" | "error">("idle");
const slotDonutData = ref<EmbeddingAreaDatum[][]>(Array.from({ length: props.slots.length }, () => []));
const areaQueryEmbeddingCache = new Map<string, number[]>();
const aimingAreaQueryEmbeddingCache = new Map<string, number[]>();
const aimingStudentEmbeddingCache = new Map<number, number[]>();
let areaEmbeddingPreloadStarted = false;
let aimingEmbeddingPreloadStarted = false;
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
const AIMING_EMBED_SCORE_MAX_PER_PERSON = 20;
const AIMING_EMBED_SCORE_GAMMA = 2.1;

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
  const result = await callEmbeddingWorker<{ query: string; vector: number[] }>({
    type: "embed-query",
    payload: { query: buildAimingAreaEmbeddingQuery(area) },
  });
  const normalized = normalizeVector(result.vector ?? []);
  aimingAreaQueryEmbeddingCache.set(cacheKey, normalized);
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
  return normalized;
}

async function startAreaEmbeddingPreload() {
  if (areaEmbeddingPreloadStarted) return;
  areaEmbeddingPreloadStarted = true;
  if (!precomputedEmbeddingsCompatible.value) {
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

async function startAimingEmbeddingPreload() {
  if (aimingEmbeddingPreloadStarted) return;
  aimingEmbeddingPreloadStarted = true;
  if (!supportsAimingMode.value) {
    areaEmbeddingStatus.value = "error";
    return;
  }
  areaEmbeddingStatus.value = "loading";
  try {
    ensureEmbeddingWorker();
    await callEmbeddingWorker<{ ok: true }>({ type: "warmup", payload: {} });
    await Promise.all(activeAimingAreas.value.map((area) => ensureAimingAreaQueryEmbedding(area)));
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

function mapAimingEmbeddingScore(raw: number, minRaw: number, maxRaw: number) {
  if (raw <= 0) return 0;
  if (maxRaw <= minRaw + 1e-9) return AIMING_EMBED_SCORE_MAX_PER_PERSON;
  const normalized = Math.max(0, Math.min(1, (raw - minRaw) / (maxRaw - minRaw)));
  const contrasted = normalized ** AIMING_EMBED_SCORE_GAMMA;
  return contrasted * AIMING_EMBED_SCORE_MAX_PER_PERSON;
}

async function updateSlotDonutData() {
  const seq = ++areaEmbeddingTaskSeq;
  if (donutMode.value === "hobby" && !precomputedEmbeddingsCompatible.value) {
    slotDonutData.value = Array.from({ length: props.slots.length }, () => []);
    areaEmbeddingStatus.value = "error";
    return;
  }
  if (donutMode.value === "aiming" && !supportsAimingMode.value) {
    slotDonutData.value = Array.from({ length: props.slots.length }, () => []);
    areaEmbeddingStatus.value = "error";
    return;
  }

  areaEmbeddingStatus.value = "loading";
  try {
    const areaVectors = new Map<string, number[]>();
    if (donutMode.value === "hobby") {
      await startAreaEmbeddingPreload();
      await Promise.all(
        hobbyAreaKeys.map(async (areaKey) => {
          areaVectors.set(areaKey, await ensureAreaQueryEmbedding(areaKey));
        }),
      );
    } else {
      await startAimingEmbeddingPreload();
      await Promise.all(
        activeAimingAreas.value.map(async (area) => {
          areaVectors.set(area.area_key, await ensureAimingAreaQueryEmbedding(area));
        }),
      );
    }

    const next = await Promise.all(
      props.slots.map(async (slot) => {
        if (!slot) return [];
        const members = slot.members.filter((member) => {
          if (donutMode.value === "hobby") {
            return member.hobby_raw.trim().length > 0 && (studentEmbeddingById.value.get(member.id)?.length ?? 0) > 0;
          }
          const aimingRaw = activeAimingById.value.get(member.id)?.aiming_raw ?? "";
          return aimingRaw.trim().length > 0;
        });
        if (!members.length) return [];
        const areaKeys = donutMode.value === "hobby" ? hobbyAreaKeys : activeAimingAreas.value.map((a) => a.area_key);
        const sumByArea = new Map<string, number>(areaKeys.map((areaKey) => [areaKey, 0]));
        for (const member of members) {
          const studentVec =
            donutMode.value === "hobby"
              ? studentEmbeddingById.value.get(member.id) ?? []
              : await ensureAimingStudentEmbedding(member.id, activeAimingById.value.get(member.id)?.aiming_raw ?? "");
          const rawRows = areaKeys.map((areaKey) => {
            const queryVec = areaVectors.get(areaKey) ?? [];
            const raw = queryVec.length ? Math.max(0, dot(studentVec, queryVec)) : 0;
            return { areaKey, raw };
          });
          const positives = rawRows.map((row) => row.raw).filter((v) => v > 0);
          const minRaw = positives.length ? Math.min(...positives) : 0;
          const maxRaw = positives.length ? Math.max(...positives) : 0;
          for (const row of rawRows) {
            const mapped =
              donutMode.value === "hobby"
                ? mapAreaEmbeddingScore(row.raw, minRaw, maxRaw)
                : mapAimingEmbeddingScore(row.raw, minRaw, maxRaw);
            sumByArea.set(row.areaKey, (sumByArea.get(row.areaKey) ?? 0) + mapped);
          }
        }

        return areaKeys
          .map((areaKey) => ({
            areaKey,
            areaLabel:
              donutMode.value === "hobby"
                ? formatHobbyLabel(areaKey)
                : activeAimingAreas.value.find((a) => a.area_key === areaKey)?.area_label ?? areaKey,
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

watch(
  () => activeYear.value,
  () => {
    areaEmbeddingPreloadStarted = false;
    aimingEmbeddingPreloadStarted = false;
    areaQueryEmbeddingCache.clear();
    aimingAreaQueryEmbeddingCache.clear();
    aimingStudentEmbeddingCache.clear();
    if (!supportsAimingMode.value && donutMode.value === "aiming") {
      donutMode.value = "hobby";
    }
    updateSlotDonutData();
  },
);

watch(donutMode, () => {
  updateSlotDonutData();
});

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
    <div class="rowHeader">
      <h3 class="rowTitle">Group Hobby Area Donuts</h3>
      <div v-if="supportsAimingMode" class="modeToggle" role="group" aria-label="toggle donut mode">
        <button
          class="modeToggleBtn"
          :class="{ active: donutMode === 'hobby' }"
          type="button"
          @click="donutMode = 'hobby'"
        >
          Hobby
        </button>
        <button
          class="modeToggleBtn"
          :class="{ active: donutMode === 'aiming' }"
          type="button"
          @click="donutMode = 'aiming'"
        >
          Aiming
        </button>
      </div>
    </div>
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
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.rowHeader {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.modeToggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.modeToggleBtn {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
  border-radius: 999px;
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.modeToggleBtn.active {
  background: #dbeafe;
  border-color: #93c5fd;
  color: #1d4ed8;
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
