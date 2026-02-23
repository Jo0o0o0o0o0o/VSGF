// src/utils/fuzzySearch.ts
export type FuzzyOptions = {
  limit?: number;           // 最多返回多少
  minScore?: number;        // 低于这个分数直接过滤
};

function norm(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

// query 是否是 text 的“子序列”（不要求连续）
// 例：q="gshd" 可匹配 "German Shepherd"
function isSubsequence(q: string, text: string) {
  let i = 0;
  for (let j = 0; j < text.length && i < q.length; j++) {
    if (text[j] === q[i]) i++;
  }
  return i === q.length;
}

function scoreOne(textRaw: string, qRaw: string): number {
  const text = norm(textRaw);
  const q = norm(qRaw);
  if (!q) return 0;

  if (text === q) return 1000;              // 完全相等：最强
  if (text.startsWith(q)) return 700;       // 前缀命中
  if (text.includes(q)) return 500;         // 子串命中

  // 单词命中：比如搜 "shep" 命中 "Shepherd"
  const words = text.split(" ");
  let bestWord = 0;
  for (const w of words) {
    if (w === q) bestWord = Math.max(bestWord, 450);
    else if (w.startsWith(q)) bestWord = Math.max(bestWord, 350);
    else if (w.includes(q)) bestWord = Math.max(bestWord, 250);
  }
  if (bestWord) return bestWord;

  // 子序列：允许跳字符，比如 "gshd" -> "german shepherd"
  if (isSubsequence(q.replace(/ /g, ""), text.replace(/ /g, ""))) {
    // 越短越强（更“精准”），用长度惩罚一下
    const penalty = Math.min(200, (text.length - q.length) * 5);
    return 220 - penalty;
  }

  return 0;
}

export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
  opt: FuzzyOptions = {}
): T[] {
  const limit = opt.limit ?? 80;
  const minScore = opt.minScore ?? 1;

  const q = norm(query);
  if (!q) return items.slice(0, limit);

  const scored = items
    .map((item) => {
      const text = getText(item);
      const s = scoreOne(text, q);
      return { item, s, textLen: text.length };
    })
    .filter((x) => x.s >= minScore)
    .sort((a, b) => (b.s - a.s) || (a.textLen - b.textLen)); // 分数高优先，名字短优先
  return scored.slice(0, limit).map((x) => x.item);
}
