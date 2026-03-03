<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { IvisRecord } from "@/types/ivis23";
import { EMBEDDING_MODEL_ID, EMBEDDING_TEXT_BUILDER_VERSION } from "@/embeddings/config";
import hobbyAreaRulesRaw from "@/data/hobby_area_rules.json";
import ivis21AimingJson from "@/data/IVIS21_aming.json";
import ivis22AimingJson from "@/data/IVIS22_aming.json";
import ivis21AimingAreaJson from "@/data/IVIS21_aiming_area.json";
import ivis22AimingAreaJson from "@/data/IVIS22_aiming_area.json";
import { activeYear, getActiveEmbeddings, type DatasetYear } from "@/types/dataSource";
import { formatHobbyLabel } from "@/utils/hobbyTagColorMap";
import {
  createHomeHobbyParallelSetsPlot,
  type HomeHobbyParallelLink,
} from "@/d3Viz/createHomeHobbyParallelSetsPlot";

const props = defineProps<{
  records: IvisRecord[];
  showAiming?: boolean;
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

const wrapRef = ref<HTMLDivElement | null>(null);
const chartAreaRef = ref<HTMLDivElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const links = ref<HomeHobbyParallelLink[]>([]);
const status = ref<"idle" | "loading" | "ready" | "error">("idle");
const errorMessage = ref("");

const hovered = ref<HomeHobbyParallelLink | null>(null);
const tip = ref({ x: 0, y: 0, show: false });

const hobbyAreaRules = hobbyAreaRulesRaw as HobbyAreaRule[];
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
const areaIndexByKey = new Map(hobbyAreaDisplayKeys.map((key, index) => [key, index] as const));

const precomputedEmbeddings = computed(
  () => getActiveEmbeddings() as PrecomputedEmbeddingsFile | null,
);
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
      precomputedEmbeddings.value?.embeddings.map((item) => [item.id, normalizeVector(item.vector)]) ?? [],
    ),
);
const EMBEDDING_SCORE_MAX = 20;
const EMBEDDING_SCORE_GAMMA = 2.1;
const AIMING_EMBED_SCORE_MAX = 20;
const AIMING_EMBED_SCORE_GAMMA = 2.1;
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
const aimingAreaIndexByKey = computed(
  () => new Map(activeAimingAreas.value.map((area, index) => [area.area_key, index] as const)),
);

const areaQueryEmbeddingCache = new Map<string, number[]>();
const aimingAreaQueryEmbeddingCache = new Map<string, number[]>();
const aimingStudentEmbeddingCache = new Map<number, number[]>();
let embeddingWorker: Worker | null = null;
let workerRequestId = 0;
const workerPending = new Map<
  number,
  {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }
>();
let chart: ReturnType<typeof createHomeHobbyParallelSetsPlot> | null = null;
let ro: ResizeObserver | null = null;

function normalizedMetaValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKeyword(text: string) {
  return text.toLowerCase().trim().replace(/[^a-z0-9_ ]+/g, " ");
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

function setTipFromEvent(ev: PointerEvent) {
  const wrap = wrapRef.value;
  if (!wrap) return;
  const r = wrap.getBoundingClientRect();
  tip.value.x = ev.clientX - r.left + 12;
  tip.value.y = ev.clientY - r.top + 12;
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

function remapEmbeddingScore(raw: number, minRaw: number, maxRaw: number) {
  if (raw <= 0) return 0;
  if (maxRaw <= minRaw + 1e-9) return EMBEDDING_SCORE_MAX;
  const normalized = Math.max(0, Math.min(1, (raw - minRaw) / (maxRaw - minRaw)));
  const contrasted = normalized ** EMBEDDING_SCORE_GAMMA;
  return contrasted * EMBEDDING_SCORE_MAX;
}

function remapAimingEmbeddingScore(raw: number, minRaw: number, maxRaw: number) {
  if (raw <= 0) return 0;
  if (maxRaw <= minRaw + 1e-9) return AIMING_EMBED_SCORE_MAX;
  const normalized = Math.max(0, Math.min(1, (raw - minRaw) / (maxRaw - minRaw)));
  const contrasted = normalized ** AIMING_EMBED_SCORE_GAMMA;
  return contrasted * AIMING_EMBED_SCORE_MAX;
}

async function getTop1EmbeddingHobbyAreas(member: IvisRecord) {
  if (!precomputedEmbeddingsCompatible.value) {
    return member.hobby_area.slice(0, 1).map((areaKey) => ({ areaKey: normalizeKeyword(areaKey), rawScore: 1 }));
  }

  const studentVec = studentEmbeddingById.value.get(member.id);
  if (!studentVec?.length) {
    return member.hobby_area.slice(0, 1).map((areaKey) => ({ areaKey: normalizeKeyword(areaKey), rawScore: 1 }));
  }

  const scored = await Promise.all(
    hobbyAreaDisplayKeys.map(async (areaKey) => {
      const queryVec = await ensureAreaQueryEmbedding(areaKey);
      const rawScore = queryVec.length ? Math.max(0, dot(studentVec, queryVec)) : 0;
      return { areaKey, rawScore };
    }),
  );

  return scored
    .sort((a, b) => b.rawScore - a.rawScore)
    .slice(0, 1);
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
  return normalized;
}

async function getTop1EmbeddingAimingArea(member: IvisRecord) {
  const aimingRaw = activeAimingById.value.get(member.id)?.aiming_raw ?? "";
  if (!activeAimingAreas.value.length || !aimingRaw.trim()) {
    return [{ aimingKey: "no_aiming", aimingLabel: "No aiming", rawScore: 1 }];
  }
  const studentVec = await ensureAimingStudentEmbedding(member.id, aimingRaw);
  if (!studentVec.length) {
    return [{ aimingKey: "no_aiming", aimingLabel: "No aiming", rawScore: 1 }];
  }
  const scored = await Promise.all(
    activeAimingAreas.value.map(async (area) => {
      const queryVec = await ensureAimingAreaQueryEmbedding(area);
      const rawScore = queryVec.length ? Math.max(0, dot(studentVec, queryVec)) : 0;
      return { aimingKey: area.area_key, aimingLabel: area.area_label, rawScore };
    }),
  );
  const top = scored.sort((a, b) => b.rawScore - a.rawScore)[0];
  if (!top || top.rawScore <= 0) {
    return [{ aimingKey: "no_aiming", aimingLabel: "No aiming", rawScore: 1 }];
  }
  return [top];
}

async function recomputeLinks() {
  const records = props.records ?? [];
  if (!records.length) {
    links.value = [];
    status.value = "ready";
    return;
  }

  status.value = "loading";
  errorMessage.value = "";

  try {
    if (precomputedEmbeddingsCompatible.value || (props.showAiming && activeAimingAreas.value.length > 0)) {
      await callEmbeddingWorker<{ ok: true }>({ type: "warmup", payload: {} });
    }

    const rawRows = await Promise.all(
      records.map(async (member, personIndex) => {
        const pickedAreas = await getTop1EmbeddingHobbyAreas(member);
        const pickedAiming = props.showAiming
          ? await getTop1EmbeddingAimingArea(member)
          : [{ aimingKey: "__no_aiming_dim__", aimingLabel: "Student", rawScore: 1 }];
        return pickedAreas
          .filter((row) => row.areaKey && row.areaKey !== "other")
          .flatMap((row) =>
            pickedAiming.map((aiming) => ({
            personId: member.id,
            personName: member.alias,
            personIndex,
            aimingKey: aiming.aimingKey,
            aimingLabel: aiming.aimingLabel,
            aimingIndex: aimingAreaIndexByKey.value.get(aiming.aimingKey) ?? 999,
            areaKey: row.areaKey,
            areaLabel: formatHobbyLabel(row.areaKey),
            areaIndex: areaIndexByKey.get(row.areaKey) ?? 0,
            rawValue: Math.max(0, Number(row.rawScore) || 0),
            rawAimingValue: Math.max(0, Number(aiming.rawScore) || 0),
          })),
          );
      }),
    );

    const flattened = rawRows.flat();
    const positiveRawValues = flattened.map((row) => row.rawValue).filter((score) => score > 0);
    const positiveAimingRawValues = flattened.map((row) => row.rawAimingValue).filter((score) => score > 0);
    const minRaw = positiveRawValues.length ? Math.min(...positiveRawValues) : 0;
    const maxRaw = positiveRawValues.length ? Math.max(...positiveRawValues) : 0;
    const minAimingRaw = positiveAimingRawValues.length ? Math.min(...positiveAimingRawValues) : 0;
    const maxAimingRaw = positiveAimingRawValues.length ? Math.max(...positiveAimingRawValues) : 0;

    links.value = flattened.map<HomeHobbyParallelLink>((row) => ({
      aimingKey: row.aimingKey,
      aimingLabel: row.aimingLabel,
      aimingIndex: row.aimingIndex,
      personId: row.personId,
      personName: row.personName,
      personIndex: row.personIndex,
      areaKey: row.areaKey,
      areaLabel: row.areaLabel,
      areaIndex: row.areaIndex,
      value: props.showAiming
        ? (remapEmbeddingScore(row.rawValue, minRaw, maxRaw) +
            remapAimingEmbeddingScore(row.rawAimingValue, minAimingRaw, maxAimingRaw)) /
          2
        : remapEmbeddingScore(row.rawValue, minRaw, maxRaw),
    }));
    status.value = "ready";
  } catch (error) {
    status.value = "error";
    errorMessage.value = error instanceof Error ? error.message : "Failed to compute embedding links.";
    links.value = [];
  }
}

function resizeAndDraw() {
  if (!svgRef.value || !chart) return;
  const rect = svgRef.value.getBoundingClientRect();
  const width = Math.max(10, rect.width);
  const height = Math.max(10, rect.height);
  chart.update(links.value, { width, height, showAiming: props.showAiming !== false });
}

onMounted(() => {
  chart = createHomeHobbyParallelSetsPlot(svgRef.value!, {
    onHover: (link, ev) => {
      hovered.value = link;
      tip.value.show = true;
      setTipFromEvent(ev);
    },
    onMove: (_link, ev) => setTipFromEvent(ev),
    onLeave: () => {
      tip.value.show = false;
      hovered.value = null;
    },
  });

  ro = new ResizeObserver(() => requestAnimationFrame(resizeAndDraw));
  if (chartAreaRef.value) ro.observe(chartAreaRef.value);
  window.addEventListener("resize", resizeAndDraw);
});

watch(
  () => props.records,
  async () => {
    await recomputeLinks();
    await nextTick();
    requestAnimationFrame(resizeAndDraw);
  },
  { deep: true, immediate: true },
);

watch(
  () => props.showAiming,
  async () => {
    await recomputeLinks();
    await nextTick();
    requestAnimationFrame(resizeAndDraw);
  },
);

watch(
  () => activeYear.value,
  async () => {
    aimingAreaQueryEmbeddingCache.clear();
    aimingStudentEmbeddingCache.clear();
    await recomputeLinks();
    await nextTick();
    requestAnimationFrame(resizeAndDraw);
  },
);

onBeforeUnmount(() => {
  workerPending.forEach((pending) => pending.reject(new Error("Embedding worker terminated.")));
  workerPending.clear();
  embeddingWorker?.terminate();
  embeddingWorker = null;

  window.removeEventListener("resize", resizeAndDraw);
  ro?.disconnect();
  ro = null;
  chart?.destroy();
});
</script>

<template>
  <div class="wrap" ref="wrapRef">
    <div class="chartArea" ref="chartAreaRef">
      <svg ref="svgRef"></svg>
      <div v-if="status === 'loading'" class="stateText">Computing aiming + hobby embedding links...</div>
      <div v-else-if="status === 'error'" class="stateText stateError">{{ errorMessage }}</div>
      <div v-else-if="!links.length" class="stateText">No available links.</div>

      <div v-if="tip.show && hovered" class="tooltip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">
        <div class="tTitle">
          {{ props.showAiming ? `${hovered.aimingLabel} -> ${hovered.personName} -> ${hovered.areaLabel}` : `${hovered.personName} -> ${hovered.areaLabel}` }}
        </div>
        <div class="tRow">Embedding score: {{ hovered.value.toFixed(3) }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  height: 100%;
  width: 100%;
  display: flex;
  min-height: 0;
}

.chartArea {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: 0;
}

svg {
  width: 100%;
  height: 100%;
  display: block;
}

.stateText {
  position: absolute;
  left: 12px;
  top: 10px;
  font-size: 12px;
  color: #475569;
}

.stateError {
  color: #b91c1c;
}

.tooltip {
  position: absolute;
  pointer-events: none;
  background: rgba(15, 15, 15, 0.92);
  color: #fff;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.25;
  max-width: 320px;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.25);
}

.tTitle {
  font-weight: 700;
  margin-bottom: 6px;
}

.tRow {
  opacity: 0.92;
}
</style>
