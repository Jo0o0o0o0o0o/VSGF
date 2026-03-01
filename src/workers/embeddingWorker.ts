import { env, pipeline } from "@xenova/transformers";
import { EMBEDDING_MODEL_ID } from "@/embeddings/config";

type WorkerRequest =
  | { type: "warmup"; requestId: number; payload: {} }
  | { type: "embed-query"; requestId: number; payload: { query: string } };

type WorkerResponse =
  | { type: "warmup"; requestId: number; payload: { ok: true } }
  | { type: "query"; requestId: number; payload: { query: string; vector: number[] } }
  | { type: "error"; requestId: number; payload: { message: string } };

type EmbeddingTensor = { data: Float32Array | number[]; dims?: number[] };

let extractorPromise: Promise<any> | null = null;

function tensorRowToVector(tensor: EmbeddingTensor, rowIndex: number) {
  const dim = tensor.dims?.[1] ?? tensor.dims?.[0] ?? 0;
  if (!dim) return [];
  const offset = rowIndex * dim;
  return Array.from(tensor.data.slice(offset, offset + dim));
}

function dot(a: number[], b: number[]) {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i += 1) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

function normalizeVector(vec: number[]) {
  const norm = Math.sqrt(dot(vec, vec)) || 1;
  return vec.map((v) => v / norm);
}

async function getExtractor() {
  if (!extractorPromise) {
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
    env.useBrowserCache = true;
    env.useFSCache = true;
    env.localModelPath = "";
    extractorPromise = pipeline("feature-extraction", EMBEDDING_MODEL_ID) as Promise<any>;
  }
  return extractorPromise;
}

async function embedQuery(query: string) {
  const extractor = await getExtractor();
  const tensor = (await (extractor as any)(query, { pooling: "mean", normalize: true })) as EmbeddingTensor;
  const vec = tensorRowToVector(tensor, 0);
  return normalizeVector(vec);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    if (req.type === "warmup") {
      await getExtractor();
      const message: WorkerResponse = { type: "warmup", requestId: req.requestId, payload: { ok: true } };
      self.postMessage(message);
      return;
    }

    if (req.type === "embed-query") {
      const vector = await embedQuery(req.payload.query);
      const message: WorkerResponse = {
        type: "query",
        requestId: req.requestId,
        payload: { query: req.payload.query, vector },
      };
      self.postMessage(message);
    }
  } catch (error) {
    const message: WorkerResponse = {
      type: "error",
      requestId: req.requestId,
      payload: { message: error instanceof Error ? error.message : "Embedding worker failed." },
    };
    self.postMessage(message);
  }
};
