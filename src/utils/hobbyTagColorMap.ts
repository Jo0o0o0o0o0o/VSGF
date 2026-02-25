const HOBBY_TAG_COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  illustration: { bg: "#ffe4ec", text: "#7a2848", border: "#f5b7c9" },
  draw: { bg: "#ffe4ec", text: "#7a2848", border: "#f5b7c9" },
  drawing: { bg: "#ffe4ec", text: "#7a2848", border: "#f5b7c9" },
  painting: { bg: "#ffe4ec", text: "#7a2848", border: "#f5b7c9" },
  paint: { bg: "#ffe4ec", text: "#7a2848", border: "#f5b7c9" },
  design: { bg: "#ffe4ec", text: "#7a2848", border: "#f5b7c9" },
  art: { bg: "#ffe4ec", text: "#7a2848", border: "#f5b7c9" },
  photo: { bg: "#ede9fe", text: "#4c1d95", border: "#c4b5fd" },
  photography: { bg: "#ede9fe", text: "#4c1d95", border: "#c4b5fd" },
  film: { bg: "#ede9fe", text: "#4c1d95", border: "#c4b5fd" },
  movie: { bg: "#ede9fe", text: "#4c1d95", border: "#c4b5fd" },
  series: { bg: "#ede9fe", text: "#4c1d95", border: "#c4b5fd" },
  anime: { bg: "#ede9fe", text: "#4c1d95", border: "#c4b5fd" },
  game: { bg: "#dbeafe", text: "#1e3a8a", border: "#93c5fd" },
  gaming: { bg: "#dbeafe", text: "#1e3a8a", border: "#93c5fd" },
  videogame: { bg: "#dbeafe", text: "#1e3a8a", border: "#93c5fd" },
  boardgame: { bg: "#dbeafe", text: "#1e3a8a", border: "#93c5fd" },
  counterstrike: { bg: "#dbeafe", text: "#1e3a8a", border: "#93c5fd" },
  coding: { bg: "#dcfce7", text: "#14532d", border: "#86efac" },
  code: { bg: "#dcfce7", text: "#14532d", border: "#86efac" },
  programming: { bg: "#dcfce7", text: "#14532d", border: "#86efac" },
  program: { bg: "#dcfce7", text: "#14532d", border: "#86efac" },
  dataanalysis: { bg: "#dcfce7", text: "#14532d", border: "#86efac" },
  wasm: { bg: "#dcfce7", text: "#14532d", border: "#86efac" },
  rust: { bg: "#dcfce7", text: "#14532d", border: "#86efac" },
  electronics: { bg: "#dcfce7", text: "#14532d", border: "#86efac" },
  "3d": { bg: "#dcfce7", text: "#14532d", border: "#86efac" },
  "3dmodeling": { bg: "#dcfce7", text: "#14532d", border: "#86efac" },
  cooking: { bg: "#fef3c7", text: "#78350f", border: "#fcd34d" },
  baking: { bg: "#fef3c7", text: "#78350f", border: "#fcd34d" },
  food: { bg: "#fef3c7", text: "#78350f", border: "#fcd34d" },
  beer: { bg: "#fef3c7", text: "#78350f", border: "#fcd34d" },
  sport: { bg: "#ffe4b5", text: "#7c2d12", border: "#fdba74" },
  football: { bg: "#ffe4b5", text: "#7c2d12", border: "#fdba74" },
  basketball: { bg: "#ffe4b5", text: "#7c2d12", border: "#fdba74" },
  tennis: { bg: "#ffe4b5", text: "#7c2d12", border: "#fdba74" },
  handball: { bg: "#ffe4b5", text: "#7c2d12", border: "#fdba74" },
  kendo: { bg: "#ffe4b5", text: "#7c2d12", border: "#fdba74" },
  climbing: { bg: "#ffe4b5", text: "#7c2d12", border: "#fdba74" },
  bouldering: { bg: "#ffe4b5", text: "#7c2d12", border: "#fdba74" },
  hiking: { bg: "#ffe4b5", text: "#7c2d12", border: "#fdba74" },
  cycling: { bg: "#ffe4b5", text: "#7c2d12", border: "#fdba74" },
  jogging: { bg: "#ffe4b5", text: "#7c2d12", border: "#fdba74" },
  workout: { bg: "#ffe4b5", text: "#7c2d12", border: "#fdba74" },
  skiing: { bg: "#ffe4b5", text: "#7c2d12", border: "#fdba74" },
  sailing: { bg: "#ffe4b5", text: "#7c2d12", border: "#fdba74" },
  reading: { bg: "#f3e8ff", text: "#581c87", border: "#d8b4fe" },
  fiction: { bg: "#f3e8ff", text: "#581c87", border: "#d8b4fe" },
  poetry: { bg: "#f3e8ff", text: "#581c87", border: "#d8b4fe" },
  music: { bg: "#fde68a", text: "#78350f", border: "#fbbf24" },
  guitar: { bg: "#fde68a", text: "#78350f", border: "#fbbf24" },
  piano: { bg: "#fde68a", text: "#78350f", border: "#fbbf24" },
  ukulele: { bg: "#fde68a", text: "#78350f", border: "#fbbf24" },
  band: { bg: "#fde68a", text: "#78350f", border: "#fbbf24" },
  choir: { bg: "#fde68a", text: "#78350f", border: "#fbbf24" },
  singing: { bg: "#fde68a", text: "#78350f", border: "#fbbf24" },
  travel: { bg: "#cffafe", text: "#155e75", border: "#67e8f9" },
  culture: { bg: "#cffafe", text: "#155e75", border: "#67e8f9" },
  language: { bg: "#cffafe", text: "#155e75", border: "#67e8f9" },
  languages: { bg: "#cffafe", text: "#155e75", border: "#67e8f9" },
  swedish: { bg: "#cffafe", text: "#155e75", border: "#67e8f9" },
  japanese: { bg: "#cffafe", text: "#155e75", border: "#67e8f9" },
  chess: { bg: "#e5e7eb", text: "#374151", border: "#cbd5e1" },
  bartending: { bg: "#e5e7eb", text: "#374151", border: "#cbd5e1" },
  rendering: { bg: "#e5e7eb", text: "#374151", border: "#cbd5e1" },
};

const FALLBACK = { bg: "#e5e7eb", text: "#374151", border: "#cbd5e1" };

export function getHobbyTagStyle(hobby: string) {
  const key = hobby.trim().toLowerCase();
  const color = HOBBY_TAG_COLOR_MAP[key] ?? FALLBACK;
  return {
    backgroundColor: color.bg,
    color: color.text,
    borderColor: color.border,
  };
}

export function formatHobbyLabel(hobby: string) {
  const normalized = hobby.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "3dmodeling") return "3D Modeling";
  if (normalized === "dataanalysis") return "Data Analysis";
  if (normalized === "counterstrike") return "Counter-Strike";
  return normalized
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
