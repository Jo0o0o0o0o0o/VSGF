const HOBBY_TAG_COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  arts_media: { bg: "#ffe4ec", text: "#7a2848", border: "#f5b7c9" },
  games: { bg: "#dbeafe", text: "#1e3a8a", border: "#93c5fd" },
  tech_making: { bg: "#dcfce7", text: "#14532d", border: "#86efac" },
  food: { bg: "#fef3c7", text: "#78350f", border: "#fcd34d" },
  sports_outdoors: { bg: "#ffe4b5", text: "#7c2d12", border: "#fdba74" },
  reading_writing: { bg: "#f3e8ff", text: "#581c87", border: "#d8b4fe" },
  languages_culture: { bg: "#cffafe", text: "#155e75", border: "#67e8f9" },
  travel: { bg: "#fde68a", text: "#78350f", border: "#fbbf24" },
  other: { bg: "#e5e7eb", text: "#374151", border: "#cbd5e1" },
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
  if (normalized === "arts_media") return "Arts & Media";
  if (normalized === "tech_making") return "Tech & Making";
  if (normalized === "sports_outdoors") return "Sports & Outdoors";
  if (normalized === "reading_writing") return "Reading & Writing";
  if (normalized === "languages_culture") return "Languages & Culture";
  return normalized
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
