import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { env, pipeline } from "@xenova/transformers";

const EMBEDDING_MODEL_ID = "Xenova/bge-small-en-v1.5";
const EMBEDDING_TEXT_BUILDER_VERSION = "v2_hobby_raw_only";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const cacheDir = path.join(projectRoot, "node_modules", ".cache", "ivis-embeddings");

function createFingerprint(payload) {
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function tensorRowToVector(tensor, rowIndex) {
  const dim = tensor.dims?.[1] ?? tensor.dims?.[0] ?? 0;
  if (!dim) return [];
  const offset = rowIndex * dim;
  return Array.from(tensor.data.slice(offset, offset + dim));
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function main() {
  const datasetRelPath = process.argv[2];
  const outputRelPath = process.argv[3];
  if (!datasetRelPath || !outputRelPath) {
    console.error("Usage: node scripts/generateStudentEmbeddings.mjs <datasetRelPath> <outputRelPath>");
    process.exit(1);
  }

  const datasetPath = path.resolve(projectRoot, datasetRelPath);
  const outputPath = path.resolve(projectRoot, outputRelPath);
  const datasetRaw = await fs.readFile(datasetPath, "utf8");
  const records = JSON.parse(datasetRaw);

  const rows = records
    .filter((r) => r && typeof r.id === "number")
    .map((r) => ({
      id: r.id,
      text: typeof r.hobby_raw === "string" ? r.hobby_raw : "",
    }));

  const fingerprint = createFingerprint(
    JSON.stringify({
      model: EMBEDDING_MODEL_ID,
      textBuilderVersion: EMBEDDING_TEXT_BUILDER_VERSION,
      datasetSha: createFingerprint(datasetRaw),
      datasetPath: datasetRelPath,
    }),
  );

  const cacheFilePath = path.join(cacheDir, `${fingerprint}.json`);
  await ensureDir(cacheDir);
  await ensureDir(path.dirname(outputPath));

  try {
    const cached = await fs.readFile(cacheFilePath, "utf8");
    await fs.writeFile(outputPath, cached, "utf8");
    console.log(`[embeddings] cache hit -> ${outputRelPath}`);
    return;
  } catch {
    // cache miss
  }

  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.useBrowserCache = false;
  env.useFSCache = true;
  env.localModelPath = "";

  console.log(`[embeddings] generating for ${datasetRelPath} (${rows.length} rows) ...`);
  const extractor = await pipeline("feature-extraction", EMBEDDING_MODEL_ID);
  const tensor = await extractor(rows.map((r) => r.text), { pooling: "mean", normalize: true });

  const embeddings = rows.map((row, i) => ({
    id: row.id,
    vector: tensorRowToVector(tensor, i),
  }));

  const payload = {
    model: EMBEDDING_MODEL_ID,
    textBuilderVersion: EMBEDDING_TEXT_BUILDER_VERSION,
    fingerprint,
    generatedAt: new Date().toISOString(),
    datasetPath: datasetRelPath,
    embeddings,
  };

  const serialized = JSON.stringify(payload);
  await fs.writeFile(cacheFilePath, serialized, "utf8");
  await fs.writeFile(outputPath, serialized, "utf8");
  console.log(`[embeddings] done -> ${outputRelPath}`);
}

main().catch((err) => {
  console.error("[embeddings] failed");
  console.error(err);
  process.exit(1);
});

