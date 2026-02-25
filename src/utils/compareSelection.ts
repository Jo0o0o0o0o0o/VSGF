const COMPARE_PERSON_ID_KEY = "compare_single_person_id";
const COMPARE_PERSON_EVENT = "compare-single-updated";

export function readComparePersonId(): number | null {
  try {
    const raw = localStorage.getItem(COMPARE_PERSON_ID_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeComparePersonId(id: number | null) {
  try {
    if (typeof id === "number" && Number.isFinite(id)) {
      localStorage.setItem(COMPARE_PERSON_ID_KEY, String(id));
    } else {
      localStorage.removeItem(COMPARE_PERSON_ID_KEY);
    }
    window.dispatchEvent(new Event(COMPARE_PERSON_EVENT));
  } catch {
    // ignore storage failures
  }
}

export { COMPARE_PERSON_EVENT, COMPARE_PERSON_ID_KEY };
