// src/vector/index.ts
type Vec = number[];

function cosine(a: Vec, b: Vec): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

class LocalVectorIndex {
  private map = new Map<string, Vec>();

  clear() {
    this.map.clear();
  }

  upsert(memoryId: string, embedding: Vec) {
    this.map.set(memoryId, embedding);
  }

  delete(memoryId: string) {
    this.map.delete(memoryId);
  }

  search(query: Vec, topK: number) {
    const scored: { memory_id: string; score: number }[] = [];
    for (const [memory_id, vec] of this.map.entries()) {
      const score = cosine(query, vec);
      scored.push({ memory_id, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}

export const vectorIndex = new LocalVectorIndex();
