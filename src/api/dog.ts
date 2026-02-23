export type DogBreed = {
  id: number;
  name: string;
  
  group?: string;          // breed_group
  origin?: string;         // origin
  countryCode?: string;    // country_code
  countryCodes?: string;   // country_codes (可能是逗号分隔)
  description?: string;    // description
  history?: string;        // history
  bredFor?: string | null; // bred_for
  perfectFor?: string | null;

  temperament?: string;    // temperament
  lifeSpanText?: string;   // life_span

  heightCmRange?: string;  // height.metric "23-29"
  weightKgRange?: string;  // weight.metric "3.2-4.5"

  imageUrl?: string;       // image.url
  imageId?: string;        // image.id
  referenceImageId?: string; // reference_image_id
};


const BASE = "https://api.thedogapi.com/v1";
const KEY = import.meta.env.VITE_DOG_API_KEY as string;

// 明确返回 HeadersInit
function makeHeaders(): HeadersInit {
  return {
    "x-api-key": KEY
  };
}

// 1 次请求拿全量品种
export async function fetchBreeds(): Promise<DogBreed[]> {
  const res = await fetch(`${BASE}/breeds`, {
    headers: makeHeaders()
  });

  if (!res.ok) {
    throw new Error(`fetchBreeds failed: ${res.status}`);
  }

  return res.json();
}

// 用 reference_image_id 拼 CDN
export function getBreedImageUrl(referenceImageId?: string): string | null {
  if (!referenceImageId) return null;

  return `https://cdn2.thedogapi.com/images/${referenceImageId}.jpg`;
}