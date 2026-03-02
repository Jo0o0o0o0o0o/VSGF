import { computed, ref } from "vue";
import ivis21RecordsJson from "@/data/IVIS21_final.json";
import ivis22RecordsJson from "@/data/IVIS22_final.json";
import ivis23RecordsJson from "@/data/IVIS23_final.json";
import ivis24RecordsJson from "@/data/IVIS24_final.json";
import ivis23EmbeddingsJson from "@/data/ivis23_student_embeddings.generated.json";
import ivis24EmbeddingsJson from "@/data/ivis24_student_embeddings.generated.json";
import type { IvisRecord } from "@/types/ivis23";

export type DatasetYear = "21" | "22" | "23" | "24";

export type DatasetOption = {
  year: DatasetYear;
  label: string;
};

export type PrecomputedEmbeddingsFile = {
  model: string;
  textBuilderVersion: string;
  fingerprint?: string;
  generatedAt?: string;
  datasetPath?: string;
  embeddings: Array<{ id: number; vector: number[] }>;
};

const DATASET_YEAR_KEY = "ivis_active_year";
const YEAR_OPTIONS: DatasetOption[] = [
  { year: "24", label: "IVIS 2024" },
  { year: "23", label: "IVIS 2023" },
  { year: "22", label: "IVIS 2022" },
  { year: "21", label: "IVIS 2021" },
];

const RECORDS_BY_YEAR: Record<DatasetYear, IvisRecord[]> = {
  "21": ivis21RecordsJson as IvisRecord[],
  "22": ivis22RecordsJson as IvisRecord[],
  "23": ivis23RecordsJson as IvisRecord[],
  "24": ivis24RecordsJson as IvisRecord[],
};

const EMBEDDINGS_BY_YEAR: Partial<Record<DatasetYear, PrecomputedEmbeddingsFile>> = {
  "23": ivis23EmbeddingsJson as PrecomputedEmbeddingsFile,
  "24": ivis24EmbeddingsJson as PrecomputedEmbeddingsFile,
};

function readStoredDatasetYear(): DatasetYear {
  try {
    const raw = localStorage.getItem(DATASET_YEAR_KEY);
    return YEAR_OPTIONS.some((option) => option.year === raw) ? (raw as DatasetYear) : "24";
  } catch {
    return "24";
  }
}

const activeDatasetYear = ref<DatasetYear>(readStoredDatasetYear());

export const datasetYearOptions = YEAR_OPTIONS;
export const activeYear = computed(() => activeDatasetYear.value);
export const activeRecords = computed<IvisRecord[]>(() => RECORDS_BY_YEAR[activeDatasetYear.value] ?? []);
export const activeEmbeddings = computed<PrecomputedEmbeddingsFile | null>(
  () => EMBEDDINGS_BY_YEAR[activeDatasetYear.value] ?? null,
);

export function setActiveDatasetYear(year: DatasetYear) {
  activeDatasetYear.value = year;
  try {
    localStorage.setItem(DATASET_YEAR_KEY, year);
  } catch {
    // ignore storage failures
  }
}

export function getActiveRecords() {
  return RECORDS_BY_YEAR[activeDatasetYear.value] ?? [];
}

export function getActiveEmbeddings() {
  return EMBEDDINGS_BY_YEAR[activeDatasetYear.value] ?? null;
}

export function makeYearStorageKey(suffix: string) {
  return `ivis${activeDatasetYear.value}_${suffix}`;
}

export const GROUPING_UPDATED_EVENT = "ivis-grouping-updated";
export const GROUPING_CONFIRMED_EVENT = "ivis-grouping-confirmed";
export const GROUPING_HYDRATED_EVENT = "ivis-grouping-hydrated";

export function clearYearScopedLocalStoragePreserveYear() {
  try {
    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const isYearScoped = key.startsWith("ivis");
      const isCompareTransient = key === "compare_add_queue" || key === "compare_single_person_id";
      if (isYearScoped || isCompareTransient) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => localStorage.removeItem(key));
    localStorage.setItem(DATASET_YEAR_KEY, activeDatasetYear.value);
  } catch {
    // ignore storage failures
  }
}
