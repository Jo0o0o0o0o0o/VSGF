export type ScatterDatum = {
  id: string;          // breed id or name slug
  x: number;           // e.g., height_max
  y: number;           // e.g., weight_max
  label?: string;      // breed name
  breedGroup?: string | null;
  size?: number; // ← 语义值：max life expectancy
};
