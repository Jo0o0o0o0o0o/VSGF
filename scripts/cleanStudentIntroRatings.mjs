import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ABOUT_COLUMN = 'Please, tell me about yourself. What interest you? Do you have any hobbies?';
const ALIAS_COLUMN = 'What is your alias? An Alias is a secret name you give yourself. For example: Nintendo65. Please, send your alias through the assignment text field on Canvas to complete and get a grade for this assignment.';
const DEFAULT_CANON_PATH = 'scripts/hobby_canon.json';
const DEFAULT_UNKNOWN_PATH = 'src/data/unknown_hobbies.json';

const NOISE_PHRASES = [
  'i like',
  'i love',
  'i enjoy',
  'interested in',
  'my hobbies are',
  'in my free time',
];

const STOPWORDS = new Set([
  'i',
  'my',
  'and',
  'or',
  'like',
  'love',
  'enjoy',
  'interested',
  'hobby',
  'hobbies',
  'to',
  'in',
  'on',
  'at',
  'for',
  'with',
  'the',
  'a',
  'an',
  'of',
]);

const INVALID_VALUES = new Set(['none', 'no', 'n a', 'na', '-', 'nothing', 'null']);
const UNKNOWN_REJECT_WORDS = new Set([
  'am',
  'also',
  'afterwards',
  'both',
  'well',
  'main',
  'student',
  'year',
  'children',
  'married',
  'especially',
  'such',
  'who',
  'that',
  'which',
]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        value += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ',') {
      row.push(value);
      value = '';
      continue;
    }

    if (ch === '\n') {
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
      continue;
    }

    if (ch !== '\r') {
      value += ch;
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function slugifyHeader(header) {
  return header
    .toLowerCase()
    .replace(/^how would you rate your\s+/, '')
    .replace(/\s*skills\??\s*$/i, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function cleanAbout(text) {
  if (!text) return '';

  return text
    .replace(/\s+/g, ' ')
    .replace(/\s*[,;|]\s*/g, ', ')
    .replace(/,\s*,+/g, ', ')
    .replace(/\s+([.!?])/g, '$1')
    .replace(/[,\s]+$/g, '')
    .trim();
}

function normalizeForLookup(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHobbyText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
    .replace(/[;|/\n\r\\]+/g, ',')
    .replace(/[^\p{L}\p{N}\s,&]/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ',')
    .replace(/,+/g, ',')
    .replace(/^,|,$/g, '')
    .trim();
}

function stripNoisePhrases(text) {
  let current = text;
  for (const phrase of NOISE_PHRASES) {
    const pattern = new RegExp(`\\b${phrase.replace(/\s+/g, '\\s+')}\\b`, 'g');
    current = current.replace(pattern, ' ');
  }
  return current.replace(/\s+/g, ' ').trim();
}

function cleanCandidatePhrase(text) {
  const noNoise = stripNoisePhrases(normalizeForLookup(text));
  const words = noNoise
    .split(' ')
    .map((word) => word.trim())
    .filter((word) => word && !STOPWORDS.has(word));
  return words.join(' ').trim();
}

function isInvalidPhrase(value) {
  return INVALID_VALUES.has(normalizeForLookup(value));
}

function isReasonableUnknown(value) {
  if (!value || value.length <= 2) return false;
  if (isInvalidPhrase(value)) return false;
  if (!/[a-z0-9]/i.test(value)) return false;
  if (/\b(as well as|such as|i am|i m)\b/i.test(value)) return false;
  const words = value.split(' ').filter(Boolean);
  if (words.length > 4) return false;
  if (words.some((word) => UNKNOWN_REJECT_WORDS.has(word))) return false;
  return true;
}

function extractHobbyCandidates(aboutText) {
  const normalized = normalizeHobbyText(aboutText);
  if (!normalized) return [];

  const chunks = normalized
    .split(',')
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const results = [];
  for (const chunk of chunks) {
    const subChunks = chunk
      .split(/\b(?:and|&)\b/g)
      .map((part) => part.trim())
      .filter(Boolean);

    for (const part of subChunks) {
      const cleaned = cleanCandidatePhrase(part);
      if (!cleaned || cleaned.length <= 2) continue;
      if (isInvalidPhrase(cleaned)) continue;
      results.push(cleaned);
    }
  }

  return [...new Set(results)];
}

function buildCanonMap(canonDict) {
  const map = new Map();

  for (const [canonical, variants] of Object.entries(canonDict)) {
    const cleanCanonical = cleanCandidatePhrase(canonical);
    if (cleanCanonical) {
      map.set(cleanCanonical, canonical);
    }

    if (!Array.isArray(variants)) continue;
    for (const variant of variants) {
      const cleaned = cleanCandidatePhrase(variant);
      if (cleaned) {
        map.set(cleaned, canonical);
      }
    }
  }

  return map;
}

function toRating(value) {
  const n = Number.parseFloat(String(value).trim());
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 10) return null;
  return Math.round(n * 10) / 10;
}

async function main() {
  const inputArg = process.argv[2] ?? 'src/data/IVIS23.csv';
  const outputArg = process.argv[3] ?? 'src/data/IVIS23.cleaned.json';
  const canonArg = process.argv[4] ?? DEFAULT_CANON_PATH;
  const unknownArg = process.argv[5] ?? DEFAULT_UNKNOWN_PATH;
  const includeUnknownAsTags = /^(1|true|yes)$/i.test(process.env.INCLUDE_UNKNOWN_AS_TAGS ?? '');

  const inputPath = path.resolve(process.cwd(), inputArg);
  const outputPath = path.resolve(process.cwd(), outputArg);
  const canonPath = path.resolve(process.cwd(), canonArg);
  const unknownPath = path.resolve(process.cwd(), unknownArg);

  const csvText = await readFile(inputPath, 'utf8');
  const canonRaw = (await readFile(canonPath, 'utf8')).replace(/^\uFEFF/, '');
  const canonDict = JSON.parse(canonRaw);
  const canonMap = buildCanonMap(canonDict);

  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    throw new Error(`CSV has no data rows: ${inputArg}`);
  }

  const [headers, ...dataRows] = rows;
  const aliasIndex = headers.indexOf(ALIAS_COLUMN);
  const aboutIndex = headers.indexOf(ABOUT_COLUMN);

  if (aboutIndex === -1) {
    throw new Error(`Cannot find hobby column: ${ABOUT_COLUMN}`);
  }

  const ratingIndexes = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => /^How would you rate your /i.test(header));

  const unknownCounts = new Map();

  const records = dataRows
    .filter((row) => row.some((cell) => String(cell ?? '').trim().length > 0))
    .map((row, rowIndex) => {
      const alias = String(row[aliasIndex] ?? '').trim();
      const about = cleanAbout(String(row[aboutIndex] ?? ''));
      const candidates = extractHobbyCandidates(about);
      const hobbyTags = new Set();

      for (const candidate of candidates) {
        const canonical = canonMap.get(candidate);
        if (canonical) {
          hobbyTags.add(canonical);
          continue;
        }

        if (isReasonableUnknown(candidate)) {
          unknownCounts.set(candidate, (unknownCounts.get(candidate) ?? 0) + 1);
          if (includeUnknownAsTags) {
            hobbyTags.add(candidate);
          }
        }
      }

      const ratings = {};
      for (const { header, index } of ratingIndexes) {
        const key = slugifyHeader(header);
        const numeric = toRating(row[index]);
        if (numeric !== null && key) {
          ratings[key] = numeric;
        }
      }

      return {
        id: rowIndex + 1,
        alias,
        about,
        hobbies: [...hobbyTags].sort(),
        ratings,
      };
    });

  const unknownHobbies = [...unknownCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([hobby, count]) => ({ hobby, count }));

  const output = {
    inputFile: inputArg,
    totalRecords: records.length,
    hobbyConfig: {
      canonFile: canonArg,
      unknownFile: unknownArg,
      includeUnknownAsTags,
    },
    ratingFields: ratingIndexes.map(({ header }) => ({
      original: header,
      key: slugifyHeader(header),
    })),
    records,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(unknownPath), { recursive: true });

  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  await writeFile(unknownPath, `${JSON.stringify(unknownHobbies, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${records.length} records to ${outputArg}`);
  console.log(`Wrote ${unknownHobbies.length} unknown hobbies to ${unknownArg}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
