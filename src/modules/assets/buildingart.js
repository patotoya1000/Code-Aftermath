// Building art: painted-style sprites for buildings, the gate and the wall (assets/sprites/buildings/<name>_<condition>.png, transparent background, drawn by
// scripts/make-building-sprites.mjs). Presentation only: a building still owns exactly its logical footprint; how big its picture is drawn never changes interaction.
//
// One picture per (type, condition): 'repaired' | 'damaged' | 'ruined' (the same three conditions the world already derives from health). Levels share the picture for now.
// `cells` = how wide the REPAIRED picture is drawn, in grid cells; `refW` = that picture's width in pixels. The damaged / ruined pictures use the same pixels-per-cell,
// so a ruin is smaller than the finished building instead of being stretched to the same width.
// Until a picture has loaded (or when it is missing, or there is no DOM) `get()` answers null and the renderer draws its placeholder instead.

export const BUILDING_ART_DIR = 'assets/sprites/buildings/';
export const BUILDING_ART = Object.freeze({
  hq: { file: 'hq', cells: 3.3, refW: 331 },
  tent: { file: 'tent', cells: 1.5, refW: 206 },
  storage: { file: 'storage', cells: 1.6, refW: 240 },
  kitchen: { file: 'kitchen', cells: 1.5, refW: 224 },
  workshop: { file: 'workshop', cells: 1.6, refW: 242 },
  generator: { file: 'generator', cells: 1.3, refW: 190 },
  battery: { file: 'battery', cells: 1.1, refW: 173 },
  solar_panel: { file: 'solar_panel', cells: 1.6, refW: 206 },
  water_tank: { file: 'water_tank', cells: 1.1, refW: 154 },
  well: { file: 'well', cells: 1.2, refW: 166 },
  tower: { file: 'tower', cells: 1.2, refW: 168 },
  field: { file: 'field', cells: 1.7, refW: 248 },
  gate: { file: 'gate', cells: 1.5, refW: 192 },
  fence: { file: 'wall', cells: 1.0, refW: 121 },
});
export const ART_CONDITIONS = Object.freeze(['repaired', 'damaged', 'ruined']);

/** Lazy image cache, same shape as createNodeArt. `get(type, condition)` → { img, cells } (cells = the picture's drawn width in grid cells) or null. */
export function createBuildingArt({ baseUrl = BUILDING_ART_DIR, specs = BUILDING_ART, loadImage = null } = {}) {
  const cache = new Map();
  const make = loadImage ?? (typeof Image === 'undefined' ? null : (url) => { const img = new Image(); img.src = url; return img; });
  const isReady = (img) => Boolean(img && img.complete !== false && (img.naturalWidth ?? img.width) > 0);
  return {
    specs,
    has: (type) => Object.hasOwn(specs, type),
    get(type, condition) {
      const spec = Object.hasOwn(specs, type) ? specs[type] : null; if (!spec || !make) return null;
      const cond = ART_CONDITIONS.includes(condition) ? condition : 'repaired';
      const key = `${spec.file}_${cond}`;
      let e = cache.get(key);
      if (!e) { e = { img: make(`${baseUrl}${key}.png`), failed: false }; try { e.img.onerror = () => { e.failed = true; }; } catch { /* non-DOM image stand-in */ } cache.set(key, e); }
      if (e.failed || !isReady(e.img)) return null;
      return { img: e.img, cells: (e.img.naturalWidth ?? e.img.width) / (spec.refW / spec.cells) };
    },
  };
}
