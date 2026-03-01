import type { RadarKey } from "@/d3Viz/createRadarChart";

export type SkillCategoryKey = "build" | "think_vis" | "design" | "team_collaboration";

export type SkillCategory = {
  key: SkillCategoryKey;
  label: string;
  dimensions: RadarKey[];
};

export const SKILL_CATEGORIES: SkillCategory[] = [
  {
    key: "build",
    label: "Build",
    dimensions: [
      "programming",
      "code_repository",
      "computer_graphics_programming",
      "human_computer_interaction_programming",
    ],
  },
  {
    key: "think_vis",
    label: "Think + Vis",
    dimensions: ["statistical", "mathematics", "information_visualization"],
  },
  {
    key: "design",
    label: "Design",
    dimensions: ["user_experience_evaluation", "drawing_and_artistic"],
  },
  {
    key: "team_collaboration",
    label: "Team Collaboration",
    dimensions: ["communication", "collaboration"],
  },
];
