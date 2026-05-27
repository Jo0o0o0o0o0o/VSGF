import { doc, getDoc, setDoc } from "firebase/firestore";
import type { DatasetYear } from "@/types/dataSource";
import { db } from "@/firebase/client";

const GROUPING_SUFFIXES = [
  "grouping_v1",
  "grouping_confirmed_v1",
  "grouping_collapsed_v1",
  "group_leader_labels_v1",
  "group_role_assignments_v1",
] as const;

const USER_YEAR_STATE_SUFFIXES = [...GROUPING_SUFFIXES, "compare_group_slots_v1"] as const;
type UserYearStateSuffix = (typeof USER_YEAR_STATE_SUFFIXES)[number];

type GroupingYearDoc = {
  year: DatasetYear;
  updatedAt?: number;
  payload: Partial<Record<UserYearStateSuffix, string>>;
};

function yearKey(year: DatasetYear, suffix: string) {
  return `ivis${year}_${suffix}`;
}

function groupingYearRef(uid: string, year: DatasetYear) {
  return doc(db, "users", uid, "groupingByYear", year);
}

export function clearYearGroupingKeysFromLocal(year: DatasetYear) {
  for (const suffix of USER_YEAR_STATE_SUFFIXES) {
    localStorage.removeItem(yearKey(year, suffix));
  }
}

export async function saveGroupingYearToCloud(uid: string, year: DatasetYear) {
  const payload: Partial<Record<UserYearStateSuffix, string>> = {};
  for (const suffix of USER_YEAR_STATE_SUFFIXES) {
    const value = localStorage.getItem(yearKey(year, suffix));
    if (typeof value === "string") payload[suffix] = value;
  }

  await setDoc(groupingYearRef(uid, year), {
    year,
    payload,
    updatedAt: Date.now(),
  } satisfies GroupingYearDoc);
}

export async function restoreGroupingYearFromCloud(uid: string, year: DatasetYear) {
  const snap = await getDoc(groupingYearRef(uid, year));
  if (!snap.exists()) {
    clearYearGroupingKeysFromLocal(year);
    return true;
  }
  const data = snap.data() as Partial<GroupingYearDoc>;
  const payload = data.payload;
  if (!payload || typeof payload !== "object") {
    clearYearGroupingKeysFromLocal(year);
    return true;
  }

  clearYearGroupingKeysFromLocal(year);
  for (const suffix of USER_YEAR_STATE_SUFFIXES) {
    const value = payload[suffix];
    if (typeof value === "string") {
      localStorage.setItem(yearKey(year, suffix), value);
    }
  }
  return true;
}
