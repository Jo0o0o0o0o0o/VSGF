// src/utils/traitFilter.ts
import type { DogBreed } from "@/types/dogBreed";

export const TRAIT_KEYS = [
  "good_with_children",
  "good_with_other_dogs",
  "good_with_strangers",
  "playfulness",
  "protectiveness",
  "trainability",
  "energy",
  "barking",
  "shedding",
  "grooming",
  "drooling",
  "coat_length",
] as const;

export type TraitKey = (typeof TRAIT_KEYS)[number];

export const traitLabels: Record<TraitKey, string> = {
  good_with_children: "good_with_children",
  good_with_other_dogs: "good_with_other_dogs",
  good_with_strangers: "good_with_strangers",
  playfulness: "playfulness:",
  protectiveness: "protectiveness",
  trainability: "trainability",
  energy: "energy",
  barking: "barking",
  shedding: "shedding",
  grooming: "grooming",
  drooling: "drooling",
  coat_length: "coat_length",
};

export function createDefaultTraitEnabled(): Record<TraitKey, boolean> {
  return Object.fromEntries(TRAIT_KEYS.map((k) => [k, false])) as Record<TraitKey, boolean>;
}

/**
 * 筛选：保留与 selectedDog 在启用维度上“完全相同”的狗
 * - enabled=false 或 selectedDog=null：不筛选，返回原数组
 * - activeKeys.length=0：不筛选，返回原数组（避免筛空）
 */
export function filterDogsBySelectedTraits(
  dogs: DogBreed[],
  selectedDog: DogBreed | null,
  enabled: boolean,
  traitEnabled: Record<TraitKey, boolean>,
): DogBreed[] {
  if (!enabled || !selectedDog) return dogs;

  const activeKeys = TRAIT_KEYS.filter((k) => traitEnabled[k]);
  if (activeKeys.length === 0) return dogs;

  return dogs.filter((d) => activeKeys.every((k) => d[k] === selectedDog[k]));
}
