// Deterministic string hash
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Seeded random number generator (deterministic)
export function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

export const POSITION_BUCKET_SIZE = 10;

export function getBucketIndex(value: number, minValue = 0): number {
  return Math.floor((value - minValue) / POSITION_BUCKET_SIZE);
}
