// Seeded PRNG (mulberry32). The whole state is one uint32, so it can be saved and resumed.
export function createRng(seedOrState) {
  let s = seedOrState >>> 0;
  const rng = {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(n) {
      return Math.floor(rng.next() * n);
    },
    get state() {
      return s;
    },
  };
  return rng;
}
