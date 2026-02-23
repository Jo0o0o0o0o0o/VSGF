

import type { DogBreed } from "@/types/dogBreed";
import type { TraitKey } from "@/d3Viz/createTraitLineChart";

export type TraitAverages = Record<TraitKey, number>;

export const DEFAULT_TRAIT_KEYS: TraitKey[] = [
  "energy",
  "trainability",
  "barking",
  "playfulness",
  "protectiveness",
  "good_with_children",
  "good_with_other_dogs",
  "good_with_strangers",
];

function isValidTraitValue(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 5;
}

export function computeAverageTraits(
  dogs: DogBreed[],
  keys: TraitKey[] = DEFAULT_TRAIT_KEYS
): TraitAverages {
  const sums: Partial<Record<TraitKey, number>> = {};
  const counts: Partial<Record<TraitKey, number>> = {};

  for (const k of keys) {
    sums[k] = 0;
    counts[k] = 0;
  }

  for (const d of dogs) {
    for (const k of keys) {
      const v = (d as any)[k];
      if (isValidTraitValue(v)) {
        sums[k]! += v;
        counts[k]! += 1;
      }
    }
  }

  const out = {} as TraitAverages;
  for (const k of keys) {
    const c = counts[k] ?? 0;
    out[k] = c > 0 ? Number(((sums[k] ?? 0) / c).toFixed(2)) : NaN;
  }
  return out;
}
