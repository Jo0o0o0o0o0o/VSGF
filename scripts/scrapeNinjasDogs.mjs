// scripts/scrapeNinjasDogs.mjs
import fs from "node:fs";

const BASE = "https://api.api-ninjas.com/v1/dogs";
const KEY = process.env.API_NINJAS_KEY; // 用环境变量，不要写死在代码里
const PAGE_SIZE = 20;

if (!KEY) {
  console.error("Missing env API_NINJAS_KEY. Run: API_NINJAS_KEY=xxx node scripts/scrapeNinjasDogs.mjs");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function breedKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

async function fetchPage({ shedding, offset }) {
  const url = `${BASE}?shedding=${shedding}&offset=${offset}`;
  const res = await fetch(url, { headers: { "X-Api-Key": KEY } });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${url} ${text}`);
  }
  return res.json();
}

async function scrapeAll() {
  const byKey = new Map(); // key -> dog object
  const rawAll = [];

  for (let shedding = 1; shedding <= 5; shedding++) {
    let offset = 0;
    console.log(`\n=== shedding=${shedding} ===`);

    while (true) {
      const page = await fetchPage({ shedding, offset });

      console.log(`shedding=${shedding} offset=${offset} got=${page.length}`);

      if (!Array.isArray(page) || page.length === 0) break;

      for (const dog of page) {
        rawAll.push(dog);
        const k = breedKey(dog.name);
        // 去重策略：保留“字段更完整”的那条
        const prev = byKey.get(k);
        if (!prev) {
          byKey.set(k, dog);
        } else {
          const score = (obj) => Object.values(obj).filter((v) => v !== null && v !== undefined).length;
          if (score(dog) > score(prev)) byKey.set(k, dog);
        }
      }

      if (page.length < PAGE_SIZE) break;

      offset += PAGE_SIZE;

      // 轻微延迟，避免触发限流
      await sleep(120);
    }
  }

  const unique = Array.from(byKey.values());

  return { unique, rawAll };
}

const { unique, rawAll } = await scrapeAll();

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/dogs_ninjas_unique.json", JSON.stringify(unique, null, 2), "utf-8");
fs.writeFileSync("data/dogs_ninjas_raw.json", JSON.stringify(rawAll, null, 2), "utf-8");

console.log(`\nDONE ✅ raw=${rawAll.length}, unique=${unique.length}`);
console.log("Saved to:");
console.log(" - data/dogs_ninjas_unique.json");
console.log(" - data/dogs_ninjas_raw.json");
