#!/usr/bin/env node
/**
 * clean_ivis23_final_with_hobby_area_outputs.mjs
 *
 * Outputs:
 * 1) IVIS23_final.json  (main cleaned dataset)
 * 2) hobby_area_counts.json (frequency per hobby_area)
 * 3) hobby_area_rules.json  (the mapping rules used)
 *
 * Usage:
 *   node clean_ivis23_final_with_hobby_area_outputs.mjs <input.csv> [outDir]
 *
 * Notes:
 * - Punctuation removed from hobby_raw when extracting keywords (hobby).
 * - Stopwords removed (incl. "most").
 * - ratings includes collaboration & code_repository inside ratings ONLY.
 */

import fs from "fs";
import path from "path";

const input = process.argv[2];
const outDir = process.argv[3] ? path.resolve(process.argv[3]) : process.cwd();

if (!input) {
  console.error("Usage: node clean_ivis23_final_with_hobby_area_outputs.mjs <input.csv> [outDir]");
  process.exit(1);
}
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Column names (match your CSV)
const COL_TIMESTAMP = "Timestamp";
const COL_ALIAS = "What is your alias? An Alias is a secret name you give yourself. For example: Nintendo65. Please, send your alias through the assignment text field on Canvas to complete and get a grade for this assignment.";
const COL_HOBBY_RAW = "Please, tell me about yourself. What interest you? Do you have any hobbies?";
const COL_COLLAB = "How would you rate your collaboration skills?";
const COL_REPO = "How would you rate your code repository skills?";

const RATING_COLS = {
  "information_visualization": "How would you rate your Information Visualization skills?",
  "statistical": "How would you rate your statistical skills?",
  "mathematics": "How would you rate your mathematics skills?",
  "drawing_and_artistic": "How would you rate your drawing and artistic skills?",
  "computer_usage": "How would you rate your computer usage skills?",
  "programming": "How would you rate your programming skills?",
  "computer_graphics_programming": "How would you rate your computer graphics programming skills?",
  "human_computer_interaction_programming": "How would you rate your human-computer interaction programming skills?",
  "user_experience_evaluation": "How would you rate your user experience evaluation skills?",
  "communication": "How would you rate your communication skills?"
};

const STOP_WORDS = new Set(["a", "about", "above", "after", "all", "also", "am", "among", "an", "and", "apart", "are", "as", "at", "be", "been", "before", "being", "below", "between", "both", "but", "by", "continue", "did", "do", "does", "doing", "during", "else", "enjoy", "especially", "favorite", "finish", "for", "from", "getting", "going", "had", "has", "have", "having", "he", "her", "here", "hers", "herself", "him", "himself", "his", "hobbies", "hobby", "how", "i", "if", "in", "interest", "interested", "into", "is", "it", "its", "itself", "just", "kind", "learning", "like", "love", "main", "making", "me", "mine", "most", "mostly", "my", "myself", "new", "of", "often", "on", "onto", "or", "other", "otherwise", "our", "ours", "ourselves", "over", "play", "playing", "please", "ready", "really", "she", "so", "sometimes", "start", "studying", "stuff", "tell", "that", "the", "their", "theirs", "them", "themselves", "then", "there", "these", "they", "thing", "things", "this", "those", "through", "to", "too", "trying", "under", "us", "usual", "usually", "very", "was", "watching", "we", "well", "were", "what", "when", "while", "who", "whole", "why", "with", "working", "you", "your", "yours", "yourself", "yourselves"]);

const NOISE_WORDS = new Set(["current", "currently", "different", "engineer", "family", "first", "friend", "get", "girl", "goal", "hard", "impossible", "kth", "life", "lot", "not", "plan", "pretty", "question", "science", "side", "software", "student", "study", "time", "toward", "visual", "which", "year", "zone"]);

const PHRASE_CORRECTIONS = [
  [/3d\s+modelling/g, "3dmodeling"],
  [/3d\s+modeling/g, "3dmodeling"],
  [/3d\s+printing/g, "3dprinting"],
  [/video\s+games?/g, "videogame"],
  [/board\s+games?/g, "boardgame"],
  [/counter\s*strike/g, "counterstrike"],
  [/working\s+out/g, "workout"],
  [/data\s+analysis/g, "dataanalysis"],
  [/television\s+series/g, "series"],
  [/tv\s+series/g, "series"],
];

const MULTIWORD_CANONICAL = {
  "video game": "videogame",
  "video games": "videogame",
  "board game": "boardgame",
  "board games": "boardgame",
  "data analysis": "dataanalysis",
  "3d modeling": "3dmodeling",
  "3d modelling": "3dmodeling",
  "3d printing": "3dprinting",
  "working out": "workout",
};

const TOKEN_CORRECTIONS = {
  analysi: "analysis",
  bas: "bass",
  ches: "chess",
  films: "film",
  games: "game",
  modelling: "modeling",
  movies: "movie",
  photos: "photo",
  programing: "programming",
  sports: "sport",
  studie: "study",
  thirtie: "thirties",
  traveling: "travel",
  travelling: "travel",
  videogames: "videogame",
};

// [ [area, [keywords...]], ... ]
const AREA_RULES = [
  ["sports_outdoors", ["badminton", "basketball", "bike", "bouldering", "climb", "climbing", "cycling", "dance", "fitness", "football", "gym", "handball", "hike", "hiking", "jogging", "kendo", "run", "running", "sailing", "skate", "ski", "skiing", "soccer", "sport", "swim", "swimming", "tennis", "workout", "yoga"]],
  ["arts_media", ["anime", "art", "band", "choir", "cinema", "design", "draw", "drawing", "film", "guitar", "illustration", "movie", "movies", "music", "paint", "painting", "photo", "photography", "piano", "series", "sing", "singing", "sketch", "ukulele"]],
  ["games", ["boardgame", "chess", "counterstrike", "dnd", "game", "gaming", "pokemon", "videogame"]],
  ["tech_making", ["3d", "3dmodeling", "3dprinting", "blender", "code", "coding", "dataanalysis", "electronics", "maker", "program", "programming", "rendering", "robot", "rust", "unity", "wasm"]],
  ["reading_writing", ["book", "books", "fiction", "literature", "novel", "poem", "poetry", "read", "reading", "write", "writing"]],
  ["travel", ["travel", "trip"]],
  ["food", ["bake", "baking", "bartending", "beer", "cocktail", "coffee", "cook", "cooking", "food", "tea"]],
  ["languages_culture", ["culture", "japanese", "language", "languages", "swedish"]],
];

const VALID_HOBBY_TERMS = new Set(AREA_RULES.flatMap(([, words]) => words));
const MULTIWORD_RULES = Object.entries(MULTIWORD_CANONICAL)
  .map(([phrase, canonical]) => ({ phraseTokens: phrase.split(" "), canonical }))
  .sort((a, b) => b.phraseTokens.length - a.phraseTokens.length);

function normalizeText(s) {
  if (!s) return "";
  let t = String(s).toLowerCase();
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ");
  t = t.replace(/[;|/\\\n\r]+/g, " ");
  t = t.replace(/&/g, " and ");
  t = t.replace(/[^a-z0-9\s]/g, " ");
  for (const [pattern, fixed] of PHRASE_CORRECTIONS) {
    t = t.replace(pattern, fixed);
  }
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function extractKeywords(raw, maxKeywords = 12) {
  const t = normalizeText(raw);
  const words = t.split(" ").filter(Boolean);
  const seen = new Set();
  const out = [];

  for (let i = 0; i < words.length; i++) {
    let matchedCanonical = null;

    for (const { phraseTokens, canonical } of MULTIWORD_RULES) {
      if (i + phraseTokens.length > words.length) continue;
      let matched = true;
      for (let j = 0; j < phraseTokens.length; j++) {
        if (words[i + j] !== phraseTokens[j]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        matchedCanonical = TOKEN_CORRECTIONS[canonical] ?? canonical;
        i += phraseTokens.length - 1;
        break;
      }
    }

    let w = matchedCanonical ?? words[i];
    w = TOKEN_CORRECTIONS[w] ?? w;
    if (STOP_WORDS.has(w)) continue;
    if (NOISE_WORDS.has(w)) continue;
    if (w.length <= 2 && w !== "3d") continue;
    if (/^\d+$/.test(w)) continue;
    if (!VALID_HOBBY_TERMS.has(w)) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= maxKeywords) break;
  }

  if (seen.has("videogame")) {
    return out.filter((w) => w !== "game");
  }
  return out;
}

function hobbyAreas(keywords) {
  const kw = new Set(keywords);
  const areas = [];
  for (const [area, words] of AREA_RULES) {
    if (words.some((w) => kw.has(w))) areas.push(area);
  }
  return areas.length ? areas : ["other"];
}

function yearFromTimestamp(ts) {
  if (!ts) return "";
  const m = String(ts).match(/(19|20)\d{2}/);
  return m ? m[0] : "";
}

function toNum(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (Number.isInteger(n) ? n : n) : null;
}

// minimal CSV parser supporting quoted fields
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      row.push(cur);
      cur = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cur);
      cur = "";
      rows.push(row);
      row = [];
      continue;
    }
    cur += ch;
  }
  row.push(cur);
  rows.push(row);
  return rows.filter((r) => r.some((c) => c && c.length > 0));
}

const csvText = fs.readFileSync(path.resolve(input), "utf-8");
const rows = parseCSV(csvText);
if (rows.length < 2) {
  console.error("CSV appears to have no data rows.");
  process.exit(1);
}

const headers = rows[0].map((h) => h.trim());
function idxOf(name) {
  const i = headers.indexOf(name);
  if (i === -1) {
    console.error("Missing required column:", name);
    console.error("Headers:", headers);
    process.exit(1);
  }
  return i;
}

const iTs = idxOf(COL_TIMESTAMP);
const iAlias = idxOf(COL_ALIAS);
const iHobby = idxOf(COL_HOBBY_RAW);
const iCollab = idxOf(COL_COLLAB);
const iRepo = idxOf(COL_REPO);

const ratingIdx = Object.fromEntries(
  Object.entries(RATING_COLS).map(([k, colName]) => [k, idxOf(colName)])
);

const areaCounts = new Map();
const out = [];

for (let r = 1; r < rows.length; r++) {
  const cols = rows[r];

  const ts = cols[iTs] ?? "";
  const alias = cols[iAlias] ?? "";
  const raw = cols[iHobby] ?? "";

  const hobby = extractKeywords(raw, 12);
  const hobby_area = hobbyAreas(hobby);

  for (const a of hobby_area) {
    areaCounts.set(a, (areaCounts.get(a) ?? 0) + 1);
  }

  const ratings = {};
  for (const [k, iCol] of Object.entries(ratingIdx)) {
    ratings[k] = toNum(cols[iCol]);
  }
  // include collaboration + repo inside ratings ONLY
  ratings.collaboration = toNum(cols[iCollab]);
  ratings.code_repository = toNum(cols[iRepo]);

  out.push({
    id: r,
    alias,
    time_year: yearFromTimestamp(ts),
    hobby_raw: raw,
    hobby,
    hobby_area,
    ratings,
  });
}

// write main json
fs.writeFileSync(path.join(outDir, "IVIS23_final.json"), JSON.stringify(out, null, 2), "utf-8");

// write hobby_area_counts.json
const countsArr = Array.from(areaCounts.entries())
  .map(([hobby_area, count]) => ({ hobby_area, count }))
  .sort((a,b) => b.count - a.count);
fs.writeFileSync(path.join(outDir, "hobby_area_counts.json"), JSON.stringify(countsArr, null, 2), "utf-8");

// write hobby_area_rules.json (mapping used)
const rulesArr = AREA_RULES.map(([hobby_area, keywords]) => ({ hobby_area, keywords }));
fs.writeFileSync(path.join(outDir, "hobby_area_rules.json"), JSON.stringify(rulesArr, null, 2), "utf-8");

console.log("Wrote:", path.join(outDir, "IVIS23_final.json"));
console.log("Wrote:", path.join(outDir, "hobby_area_counts.json"));
console.log("Wrote:", path.join(outDir, "hobby_area_rules.json"));
console.log("Rows:", out.length);
