/** Small seeded random number generator (mulberry32), so AI matches are repeatable. */
export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a key by weight. Entries with weight 0 or less are skipped. */
export function weighted<T>(rng: Rng, options: [T, number][]): T | null {
  const live = options.filter(([, w]) => w > 0);
  const total = live.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (const [value, w] of live) {
    roll -= w;
    if (roll < 0) return value;
  }
  return live[live.length - 1][0];
}
