import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "@xenova/transformers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const DATA_PATH = path.join(projectRoot, "src", "data", "IVIS23_final.json");
const OUTPUT_PATH = path.join(__dirname, "hobby_raw_embedding_report.json");
const SIMPLE_OUTPUT_PATH = path.join(__dirname, "hobby_raw_clusters_simple.json");

const DEFAULT_K = 6;
const MAX_ITER = 40;
const EPS = 1e-6;

function parseKFromArgv() {
  const arg = process.argv.find((v) => v.startsWith("--k="));
  if (!arg) return DEFAULT_K;
  const parsed = Number(arg.slice(4));
  if (!Number.isFinite(parsed) || parsed < 2) return DEFAULT_K;
  return Math.floor(parsed);
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

function normalize(vec) {
  const norm = Math.sqrt(dot(vec, vec)) || 1;
  return vec.map((v) => v / norm);
}

function average(vectors) {
  if (!vectors.length) return [];
  const dim = vectors[0].length;
  const out = new Array(dim).fill(0);
  for (const vec of vectors) {
    for (let i = 0; i < dim; i += 1) out[i] += vec[i];
  }
  for (let i = 0; i < dim; i += 1) out[i] /= vectors.length;
  return out;
}

function kmeansCosine(vectors, k) {
  const n = vectors.length;
  const realK = Math.max(2, Math.min(k, n));
  const centroids = [];
  const step = Math.max(1, Math.floor(n / realK));
  for (let i = 0; i < realK; i += 1) centroids.push([...vectors[Math.min(i * step, n - 1)]]);

  let assignments = new Array(n).fill(0);
  for (let iter = 0; iter < MAX_ITER; iter += 1) {
    let changed = false;

    for (let i = 0; i < n; i += 1) {
      let bestIdx = 0;
      let bestScore = -Infinity;
      for (let c = 0; c < centroids.length; c += 1) {
        const score = dot(vectors[i], centroids[c]);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = c;
        }
      }
      if (assignments[i] !== bestIdx) {
        assignments[i] = bestIdx;
        changed = true;
      }
    }

    const nextCentroids = Array.from({ length: realK }, () => []);
    for (let i = 0; i < n; i += 1) nextCentroids[assignments[i]].push(vectors[i]);

    for (let c = 0; c < realK; c += 1) {
      if (!nextCentroids[c].length) continue;
      const next = normalize(average(nextCentroids[c]));
      const delta = Math.abs(1 - dot(next, centroids[c]));
      centroids[c] = next;
      if (delta > EPS) changed = true;
    }

    if (!changed) break;
  }

  return { assignments, centroids };
}

function topTerms(tags, n = 8) {
  const counts = new Map();
  for (const t of tags) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([term, count]) => ({ term, count }));
}

async function main() {
  const k = parseKFromArgv();
  const raw = await fs.readFile(DATA_PATH, "utf8");
  const records = JSON.parse(raw);
  const rows = records
    .filter((r) => Array.isArray(r.hobby) && r.hobby.length > 0)
    .map((r) => ({
      id: r.id,
      alias: r.alias,
      hobby: r.hobby
        .filter((h) => typeof h === "string")
        .map((h) => h.trim().toLowerCase())
        .filter((h) => h.length > 0),
    }));

  if (!rows.length) {
    console.log("No hobby rows found.");
    return;
  }

  console.log(`Embedding ${rows.length} rows (clean hobby field) with Xenova/bge-small-en-v1.5 ...`);
  const extractor = await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5");
  const texts = rows.map((r) => r.hobby.join(", "));
  const out = await extractor(texts, { pooling: "mean", normalize: true });
  const dims = out.dims?.[1] ?? 384;
  const vectors = [];
  for (let i = 0; i < rows.length; i += 1) {
    const offset = i * dims;
    vectors.push(Array.from(out.data.slice(offset, offset + dims)));
  }

  const { assignments } = kmeansCosine(vectors, k);

  const clusters = [];
  const clusterCount = Math.max(...assignments) + 1;
  for (let c = 0; c < clusterCount; c += 1) {
    const memberIdx = assignments
      .map((a, i) => (a === c ? i : -1))
      .filter((i) => i >= 0);
    const members = memberIdx.map((i) => rows[i]);
    const tagsInCluster = members.flatMap((m) => m.hobby);
    clusters.push({
      cluster_id: c,
      size: members.length,
      top_terms: topTerms(tagsInCluster),
      members,
    });
  }

  const report = {
    model: "Xenova/bge-small-en-v1.5",
    source_field: "hobby",
    input_rows: rows.length,
    embedding_dims: dims,
    k,
    generated_at: new Date().toISOString(),
    clusters: clusters.sort((a, b) => b.size - a.size),
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2), "utf8");

  const simple = report.clusters.map((cluster) => ({
    cluster: cluster.cluster_id,
    members: cluster.members.map((m) => ({
      id: m.id,
      alias: m.alias,
    })),
  }));

  await fs.writeFile(SIMPLE_OUTPUT_PATH, JSON.stringify(simple, null, 2), "utf8");
  console.log(`Done. Report written to: ${OUTPUT_PATH}`);
  console.log(`Done. Simple output written to: ${SIMPLE_OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Failed to analyze hobby_raw embeddings.");
  console.error(err);
  process.exit(1);
});
