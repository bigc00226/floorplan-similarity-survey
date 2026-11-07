/** Participant-facing texts (taken from 画面遷移イメージ_v2.pptx). */

export const STUDY_TITLE = "Floor Plan Similarity Study";

export const TRIAL_OPTIONS = [
  { value: "B", label: "Floor plan B." },
  { value: "C", label: "Floor plan C." },
  { value: "equal", label: "Both are equally similar." },
  { value: "cannot_judge", label: "I cannot judge from these images." },
] as const;

export const COMPREHENSION_OPTIONS = [
  { value: "prefer", label: "Which apartment I would prefer to live in." },
  { value: "similar", label: "Which floor plan is more similar to A." },
  { value: "fashion", label: "Which apartment would be more in fashion than A." },
  { value: "expensive", label: "Which apartment would be more expensive than A." },
] as const;

/**
 * NOTE: the original slide lists "Position of entrance and corridors" twice — merged into one here.
 * (要確認: もう一方に別の選択肢を想定されていた場合は差し替えます)
 */
export const ASPECTS = [
  { value: "overall_shape", label: "Overall floor plan shape" },
  { value: "room_count", label: "Number of rooms" },
  { value: "room_sizes", label: "Room sizes" },
  { value: "room_arrangement", label: "Arrangement of rooms" },
  { value: "room_connections", label: "Connections between rooms" },
  { value: "entrance_corridors", label: "Position of entrance and corridors" },
  { value: "room_use", label: "Speculation of the room's intended use" },
  { value: "other", label: "Other" },
] as const;

export const DIFFICULTY = [
  { value: "1", label: "1 — Very easy" },
  { value: "2", label: "2 — Somewhat easy" },
  { value: "3", label: "3 — Neither easy nor difficult" },
  { value: "4", label: "4 — Somewhat difficult" },
  { value: "5", label: "5 — Very difficult" },
] as const;

export const DEMOGRAPHICS = [
  {
    id: "demo_age",
    q: "What is your age group?",
    options: ["18 – 24", "25 – 34", "35 – 44", "45 – 54", "55 – 64", "65 or older", "Prefer not to say"],
  },
  {
    id: "demo_gender",
    q: "What is your gender?",
    options: ["Woman", "Man", "Non-binary / Another gender", "Prefer not to say"],
  },
  {
    id: "demo_education",
    q: "What is the highest level of education you have completed?",
    options: [
      "Secondary school or below",
      "Vocational / Technical qualification",
      "Some college / University (no degree)",
      "Bachelor's degree",
      "Master's degree",
      "Doctoral degree",
      "Other / Prefer not to say",
    ],
  },
  {
    id: "demo_arch_background",
    q: "Have you received education or worked in architecture, interior design, or building design?",
    options: ["No, neither", "Yes, education only", "Yes, professional experience only", "Yes, both education and professional experience", "Prefer not to say"],
  },
  {
    id: "demo_moves",
    q: "How many times have you moved to a different home in your lifetime?",
    options: ["0", "1", "2–3", "4–5", "6–9", "10 or more", "Not sure / Prefer not to say"],
  },
  {
    id: "demo_floorplan_familiarity",
    q: "How familiar are you with reading residential floor plans?",
    options: ["1 — Not at all familiar", "2 — Slightly familiar", "3 — Moderately familiar", "4 — Very familiar", "5 — Extremely familiar"],
  },
] as const;

export const SCREEN_LABELS: Record<string, string> = {
  consent: "同意・説明",
  howto: "間取り図の見方",
  comprehension: "理解度確認",
  practice: "練習",
  ready: "本試行の開始案内",
  main: "本試行",
  post_aspects: "事後質問1（考慮した観点）",
  post_most: "事後質問2（最重要の観点）",
  post_difficulty: "事後質問3（難易度）",
  post_comments: "事後質問4（自由記述）",
  demographics: "属性質問",
  done: "完了",
};
