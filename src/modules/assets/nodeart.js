// Node art: the painted tree and rock sprites (assets/sprites/nodes/*.png, transparent background, sliced from the concept sheets by
// scripts/slice-node-sprites.py). Presentation only: the stage is a pure function of the ledger amount the projection already carries.
// A node still owns exactly its one logical cell (OBJECT_SPECS footprint); how big the sprite is drawn never changes interaction.
//
//   stage 'full'  : plenty left          -> intact tree / large rock pile
//   stage 'worn'  : about half or less   -> broken tree / smaller rock pile
//   stage 'gone'  : amount 0 (depleted)  -> stump / a few loose stones
//
// Sprites of one type share one pixel scale (a stump is drawn smaller than its tree), so the width is relative to REF_W.

export const NODE_ART_DIR = 'assets/sprites/nodes/';
export const REF_W = Object.freeze({ tree: 256, rock: 192 }); // pixel width of the biggest sprite of each type; drawn at objectSpec(type).spriteSize cells (tree: scripts/prepare-tree-sprites.py)
export const WORN_BELOW = 0.5;                                // a node is 'worn' once it holds less than this share of a typical full node

/** Visual families per node type. A node picks one deterministically from its id, so a map always looks the same. */
export const NODE_FAMILIES = Object.freeze({
  tree: Object.freeze(['green']),                 // the main map's trees; 'spring', 'autumn' and 'winter' pictures exist too (TREE_FAMILIES): pass { tree: ['winter'] } to createNodeArt for a season
  rock: Object.freeze(['spire', 'arch', 'slab']),
});
export const TREE_FAMILIES = Object.freeze(['green', 'spring', 'autumn', 'winter']);
/** Pictures per type: trees come in 2 looks per family (and 2 felled looks), picked from the id; rocks have one picture per family. */
export const NODE_VARIANTS = Object.freeze({ tree: 2, rock: 1 });
// Trees: full and worn both show the whole tree (there is no half-chopped picture); gone shows the felled tree (`tree_cut_<n>`, one set for every family).
const STAGE_FILE = { tree: { full: 'full', worn: 'full', gone: 'cut' }, rock: { full: 'full', worn: 'worn', gone: 'rubble' } };

/** 'full' | 'worn' | 'gone' from the ledger amount and the type's typical amount (`capacity`). amount <= 0 is always 'gone'. */
export function nodeStage(amount, capacity) {
  if (!(amount > 0)) return 'gone';
  if (!(capacity > 0)) return 'full';
  return amount < capacity * WORN_BELOW ? 'worn' : 'full';
}

const hashId = (id) => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

/** Sprite file stem for a node, e.g. tree_green_full_2, tree_cut_1, rock_arch_rubble. Null for node types without painted art. */
export function nodeSpriteKey(type, id, stage, families = NODE_FAMILIES) {
  const list = families[type]; const files = STAGE_FILE[type];
  if (!list?.length || !files) return null;
  const h = hashId(id); const family = list[h % list.length]; const file = files[stage] ?? files.full;
  const look = 1 + (Math.floor(h / list.length) % (NODE_VARIANTS[type] ?? 1)); // the 2nd look of a tree is independent of its family
  if (type === 'tree') return file === 'cut' ? `tree_cut_${look}` : `tree_${family}_${file}_${look}`;
  return `${type}_${family}_${file}`;
}

/**
 * Lazy image cache. `loadImage(url)` returns an image-like object (browser: new Image). `get(key)` returns it once it has loaded,
 * and null before that (or if the file is missing), so the renderer falls back to its placeholder instead of drawing nothing.
 */
export function createNodeArt({ baseUrl = NODE_ART_DIR, loadImage = null, families = NODE_FAMILIES } = {}) {
  const cache = new Map();
  // no DOM (Node tests, workers): no loader, so get() stays null and the placeholder art is used
  const make = loadImage ?? (typeof Image === 'undefined' ? null : (url) => { const img = new Image(); img.src = url; return img; });
  const isReady = (img) => Boolean(img && img.complete !== false && (img.naturalWidth ?? img.width) > 0);
  const entry = (key) => {
    if (!key || !make) return null;
    let e = cache.get(key);
    if (!e) { e = { img: make(`${baseUrl}${key}.png`), failed: false }; try { e.img.onerror = () => { e.failed = true; }; } catch { /* non-DOM image stand-in */ } cache.set(key, e); }
    return e;
  };
  return {
    families,
    key: (type, id, stage) => nodeSpriteKey(type, id, stage, families),
    get(key) {
      const e = entry(key);
      return e && !e.failed && isReady(e.img) ? e.img : null;
    },
    /** 'none' (no key / no DOM) | 'loading' | 'ready' | 'failed': the renderer shows the loader only while 'loading' (assets/loader.js). */
    state(key) {
      const e = entry(key); if (!e) return 'none';
      return e.failed ? 'failed' : isReady(e.img) ? 'ready' : 'loading';
    },
  };
}
