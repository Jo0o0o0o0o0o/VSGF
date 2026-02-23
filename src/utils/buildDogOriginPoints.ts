import type { DogBreed } from "@/types/dogBreed";
import type { DogApiBreed } from "@/types/dogApiBreed";
import { COUNTRY_CENTROIDS } from "@/data/countryCentroids";
import { findDogApiBreedByName } from "@/utils/fuzzyBreedMatch";
import type { WorldPoint } from "@/d3Viz/createWorldPlot";

function extractCountryCode(b: DogApiBreed): string | null {
  const raw = (b.country_code ?? b.country_codes ?? "").toUpperCase();
  const m = raw.match(/[A-Z]{2}/);
  return m ? m[0] : null;
}

export function buildDogOriginPoints(
  ninjasDogs: DogBreed[],
  apiBreeds: DogApiBreed[],
): WorldPoint[] {
  const out: WorldPoint[] = [];

  for (const d of ninjasDogs) {
    const hit = findDogApiBreedByName(d.name, apiBreeds);
    if (!hit) continue;

    const cc = extractCountryCode(hit);
    if (!cc) continue;

    const centroid = COUNTRY_CENTROIDS[cc];
    if (!centroid) continue;

    const [lon, lat] = centroid;

    out.push({
      id: d.name,
      lon,
      lat,
      label: d.name,
      subtitle: `${cc}${hit.origin ? ` | ${String(hit.origin)}` : ""}`,
      countryCode: cc,
      dogName: d.name,
    });
  }

  return out;
}
