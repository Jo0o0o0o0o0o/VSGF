import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { Plugin, ViteDevServer } from "vite";
import { env, pipeline } from "@xenova/transformers";
import { EMBEDDING_MODEL_ID, EMBEDDING_TEXT_BUILDER_VERSION } from "../src/embeddings/config";

type StudentRecord = {
  id: number;
  hobby_raw: string;
  hobby: string[];
  hobby_area: string[];
};

type GeneratedEmbeddings = {
  model: string;
  textBuilderVersion: string;
  fingerprint: string;
  generatedAt: string;
  datasetPath: string;
  embeddings: Array<{ id: number; vector: number[] }>;
};

const DATASET_REL_PATH = "src/data/IVIS23_final.json";
const OUTPUT_REL_PATH = "src/data/ivis23_student_embeddings.generated.json";
const CACHE_DIR_REL_PATH = "node_modules/.cache/ivis-embeddings";

function createFingerprint(payload: string) {
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function toEmbeddingText(student: StudentRecord) {
  return student.hobby_raw ?? "";
}

function tensorRowToVector(
  tensor: { data: Float32Array | number[]; dims?: number[] },
  rowIndex: number
) {
  const dim = tensor.dims?.[1] ?? tensor.dims?.[0] ?? 0;
  if (!dim) return [];
  const offset = rowIndex * dim;
  return Array.from(tensor.data.slice(offset, offset + dim));
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export function precomputeStudentEmbeddingsPlugin(): Plugin {
  let isRunning = false;
  let queued = false;

  async function runGeneration(logger?: { info: (msg: string) => void; error: (msg: string) => void }) {
    if (isRunning) {
      queued = true;
      return;
    }
    isRunning = true;
    try {
      const root = process.cwd();
      const datasetPath = path.join(root, DATASET_REL_PATH);
      const outputPath = path.join(root, OUTPUT_REL_PATH);
      const cacheDir = path.join(root, CACHE_DIR_REL_PATH);

      const datasetRaw = await fs.readFile(datasetPath, "utf8");
      const fingerprint = createFingerprint(
        JSON.stringify({
          model: EMBEDDING_MODEL_ID,
          textBuilderVersion: EMBEDDING_TEXT_BUILDER_VERSION,
          datasetSha: createFingerprint(datasetRaw),
        })
      );

      const cacheFilePath = path.join(cacheDir, `${fingerprint}.json`);
      await ensureDir(cacheDir);
      await ensureDir(path.dirname(outputPath));

      try {
        const cached = await fs.readFile(cacheFilePath, "utf8");
        await fs.writeFile(outputPath, cached, "utf8");
        logger?.info?.(`[embeddings] Using cached precomputed vectors: ${cacheFilePath}`);
        return;
      } catch {
        // cache miss: continue with compute
      }

      const records = JSON.parse(datasetRaw) as StudentRecord[];
      const rows = records
        .filter((r) => r && typeof r.id === "number")
        .map((r) => ({ id: r.id, text: toEmbeddingText(r) }));

      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      env.useBrowserCache = false;
      env.useFSCache = true;
      env.localModelPath = "";

      const extractor = (await pipeline("feature-extraction", EMBEDDING_MODEL_ID)) as any;
      const tensor = (await extractor(
        rows.map((r) => r.text),
        { pooling: "mean", normalize: true }
      )) as { data: Float32Array | number[]; dims?: number[] };

      const embeddings = rows.map((row, i) => ({
        id: row.id,
        vector: tensorRowToVector(tensor, i),
      }));

      const payload: GeneratedEmbeddings = {
        model: EMBEDDING_MODEL_ID,
        textBuilderVersion: EMBEDDING_TEXT_BUILDER_VERSION,
        fingerprint,
        generatedAt: new Date().toISOString(),
        datasetPath: DATASET_REL_PATH,
        embeddings,
      };

      const serialized = JSON.stringify(payload);
      await fs.writeFile(cacheFilePath, serialized, "utf8");
      await fs.writeFile(outputPath, serialized, "utf8");
      logger?.info?.(`[embeddings] Generated and cached vectors (${embeddings.length} rows).`);
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      logger?.error?.(`[embeddings] Failed to generate embeddings.\n${message}`);
    } finally {
      isRunning = false;
      if (queued) {
        queued = false;
        await runGeneration(logger);
      }
    }
  }

  function setupDevWatcher(server: ViteDevServer) {
    const root = process.cwd();
    const datasetPath = path.resolve(root, DATASET_REL_PATH);
    const configPath = path.resolve(root, "src/embeddings/config.ts");

    const onFileChange = async (changedPath: string) => {
      if (changedPath !== datasetPath && changedPath !== configPath) return;
      await runGeneration(server.config.logger);
      server.ws.send({ type: "full-reload" });
    };

    server.watcher.add([datasetPath, configPath]);
    server.watcher.on("change", onFileChange);
  }

  return {
    name: "precompute-student-embeddings",
    apply: () => true,
    async buildStart() {
      await runGeneration({ info: (msg) => this.info(msg), error: (msg) => this.error(msg) });
    },
    async configureServer(server) {
      await runGeneration(server.config.logger);
      setupDevWatcher(server);
    },
  };
}
