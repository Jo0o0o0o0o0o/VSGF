import type { DogApiBreed } from "@/types/dogApiBreed";

function normalizeName(input: string): string {
  return String(input ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(input: string): Set<string> {
  if (!input) return new Set();
  return new Set(input.split(" ").filter(Boolean));
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / Math.max(a.size, b.size);
}

export function findDogApiBreedByName(
  sourceName: string,
  breeds: DogApiBreed[],
): DogApiBreed | null {
  const target = normalizeName(sourceName);
  if (!target) return null;

  // 1) exact
  const exact = breeds.find((b) => normalizeName(b.name) === target);
  if (exact) return exact;

  // 2) contains
  const contain = breeds.find((b) => {
    const n = normalizeName(b.name);
    return n.includes(target) || target.includes(n);
  });
  if (contain) return contain;

  // 3) token overlap
  const targetTokens = tokenSet(target);
  let best: DogApiBreed | null = null;
  let bestScore = 0;

  for (const b of breeds) {
    const n = normalizeName(b.name);
    const score = overlapScore(targetTokens, tokenSet(n));
    if (score > bestScore) {
      bestScore = score;
      best = b;
    }
  }

  // 阈值别太低，不然会乱配
  if (bestScore >= 0.6) return best;
  return null;
}
