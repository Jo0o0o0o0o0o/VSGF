export const IVIS_RATING_KEYS = [
  "information_visualization",
  "statistical",
  "mathematics",
  "drawing_and_artistic",
  "computer_usage",
  "programming",
  "computer_graphics_programming",
  "human_computer_interaction_programming",
  "user_experience_evaluation",
  "communication",
  "collaboration",
  "code_repository",
] as const;

export type IvisRatingKey = (typeof IVIS_RATING_KEYS)[number];

export type IvisRatings = Record<IvisRatingKey, number>;

export type IvisRecord = {
  id: number;
  alias: string;
  time_year: string;
  hobby_raw: string;
  hobby: string[];
  hobby_area: string[];
  ratings: IvisRatings;
};
