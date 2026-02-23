export type DogApiBreed = {
  id: string | number;
  name: string;

  origin?: string | null;

  // 注意：数据里既有 country_code 也有 country_codes :contentReference[oaicite:2]{index=2}
  country_code?: string | null;
  country_codes?: string | null;

  breed_group?: string | null;
  temperament?: string | null;

  reference_image_id?: string | null;
};
