import fs from "node:fs";

const BASE = "https://api.thedogapi.com/v1";
const KEY = process.env.DOG_API_KEY || process.env.VITE_DOG_API_KEY || "";

function makeHeaders() {
  return KEY ? { "x-api-key": KEY } : {};
}

async function fetchBreeds() {
  const url = `${BASE}/breeds`;
  const res = await fetch(url, { headers: makeHeaders() });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${url} ${text}`);
  }

  return res.json();
}

const breeds = await fetchBreeds();

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/dogs_thedogapi_breeds.json", JSON.stringify(breeds, null, 2), "utf-8");

console.log(`DONE: fetched ${Array.isArray(breeds) ? breeds.length : 0} breeds`);
console.log("Saved to: data/dogs_thedogapi_breeds.json");
