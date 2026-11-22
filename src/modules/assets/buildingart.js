// Building art: painted-style sprites for buildings, the gate and the wall (assets/sprites/buildings/<name>_<condition>.png, transparent background, drawn by
// scripts/make-building-sprites.mjs). Presentation only: a building still owns exactly its logical footprint; how big its picture is drawn never changes interaction.
//
// TOWERS have their own pictures per LEVEL (tower_level_<1-5>.png) and four mounted-weapon pictures (tower_mount_*.png); see towerart.js for the layout and the aiming maths.
//
// One picture per (type, condition): 'repaired' | 'damaged' | 'ruined' (the same three conditions the world already derives from health). Levels share the picture for now.
// `cells` = how wide the REPAIRED picture is drawn, in grid cells; `refW` = that picture's width in pixels. The damaged / ruined pictures use the same pixels-per-cell,
// so a ruin is smaller than the finished building instead of being stretched to the same width.
// Until a picture has loaded (or when it is missing, or there is no DOM) `get()` answers null and the renderer draws its placeholder instead.

import { WALL_SECTION_CELLS, WALL_ART_LEVELS } from './wallart.js';
import { TOWER_ART_LEVELS, TOWER_PX_PER_CELL, MOUNT_ART, towerArtKey } from './towerart.js';

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

// LEVEL art (wall + gate): one painted picture per building LEVEL, `<file>_level<1-5>.png`. It is a whole wall section (see wallart.js), drawn WALL_SECTION_CELLS tall,
// so one picture pixel is `refH / WALL_SECTION_CELLS` per cell. The pictures only show the finished building, so a damaged or ruined one is the same picture darkened
// (`LEVEL_TINT`) until condition pictures exist. A level whose picture is missing falls back to the next lower one; nothing here ever invents a higher one.
export const LEVEL_ART = Object.freeze({ fence: { file: 'wall', refH: 670 }, gate: { file: 'gate', refH: 670 } });
export const LEVEL_TINT = Object.freeze({ repaired: null, damaged: { color: 'rgba(34,20,10,0.32)', alpha: 1 }, ruined: { color: 'rgba(22,12,8,0.58)', alpha: 0.86 } });

/** Lazy image cache, same shape as createNodeArt. `get(type, condition)` → { img, cells } (cells = the picture's drawn width in grid cells) or null. */
export function createBuildingArt({ baseUrl = BUILDING_ART_DIR, specs = BUILDING_ART, loadImage = null, createCanvas = null, sectionCells = WALL_SECTION_CELLS, levels = WALL_ART_LEVELS } = {}) {
  const cache = new Map();
  const make = loadImage ?? (typeof Image === 'undefined' ? null : (url) => { const img = new Image(); img.src = url; return img; });
  const makeCanvas = createCanvas ?? (typeof document === 'undefined' ? null : (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
  const isReady = (img) => Boolean(img && img.complete !== false && (img.naturalWidth ?? img.width) > 0);
  const entry = (key) => {
    let e = cache.get(key);
    if (!e) { e = { img: make(`${baseUrl}${key}.png`), failed: false, tinted: new Map() }; try { e.img.onerror = () => { e.failed = true; }; } catch { /* non-DOM image stand-in */ } cache.set(key, e); }
    return e;
  };
  /** The picture to draw for a condition: the plain image when repaired, else a darkened copy made once (or the plain image when no canvas exists, e.g. in Node). */
  const shaded = (e, condition) => {
    const t = LEVEL_TINT[condition] ?? null; if (!t) return { img: e.img, alpha: 1 };
    if (!e.tinted.has(condition)) {
      let img = e.img;
      if (makeCanvas) {
        try {
          const w = e.img.naturalWidth ?? e.img.width; const h = e.img.naturalHeight ?? e.img.height; const c = makeCanvas(w, h); const g = c.getContext('2d');
          g.drawImage(e.img, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = t.color; g.fillRect(0, 0, w, h); img = c;
        } catch { img = e.img; }
      }
      e.tinted.set(condition, img);
    }
    return { img: e.tinted.get(condition), alpha: t.alpha };
  };
  return {
    specs,
    has: (type) => Object.hasOwn(specs, type),
    hasLevelArt: (type) => Object.hasOwn(LEVEL_ART, type),
    /** Start loading every level picture now so no section waits for its first use. */
    preload() { if (!make) return; for (const spec of Object.values(LEVEL_ART)) for (const lv of levels) entry(`${spec.file}_level${lv}`); },
    /**
     * The level picture for a wall ('fence') or a 'gate': { img, alpha, w } or null (not loaded yet / no art for this type) - the caller then draws the old per-cell
     * piece. `w` = the picture's drawn width in grid cells. A missing level falls back to the nearest lower one that exists.
     */
    getLevel(type, level, condition) {
      const spec = Object.hasOwn(LEVEL_ART, type) ? LEVEL_ART[type] : null; if (!spec || !make) return null;
      for (let lv = Math.min(levels.at(-1), Math.max(1, Math.trunc(Number(level) || 1))); lv >= 1; lv--) {
        const e = entry(`${spec.file}_level${lv}`);
        if (e.failed) continue;
        if (!isReady(e.img)) return null; // still loading: no flash of a lower level, the old piece stands in
        const s = shaded(e, condition);
        return { img: s.img, alpha: s.alpha, level: lv, w: (e.img.naturalWidth ?? e.img.width) / (spec.refH / sectionCells) };
      }
      return null;
    },
    /** Start loading the five tower pictures and the four mounted weapons now (a tower must never flash its old picture first). */
    preloadTowers() { if (!make) return; for (const lv of TOWER_ART_LEVELS) entry(`tower_level_${lv}`); for (const m of Object.values(MOUNT_ART)) entry(m.file); },
    /**
     * The painted tower for a LEVEL: { img, alpha, w, level, srcW, srcH } or null. `w` = its drawn width in grid cells. A ruined tower keeps its own ruin picture (tower_ruined, handled by
     * `get`), so this answers null for 'ruined'; a damaged one is the level picture darkened. A missing level picture falls back to the next lower one.
     */
    getTower(level, condition) {
      if (!make || condition === 'ruined') return null;
      for (let lv = Math.min(TOWER_ART_LEVELS.at(-1), Math.max(1, Math.trunc(Number(level) || 1))); lv >= 1; lv--) {
        const e = entry(towerArtKey(lv));
        if (e.failed) continue;
        if (!isReady(e.img)) return null;
        const s = shaded(e, condition);
        const sw = e.img.naturalWidth ?? e.img.width; const sh = e.img.naturalHeight ?? e.img.height;
        return { img: s.img, alpha: s.alpha, level: lv, w: sw / TOWER_PX_PER_CELL, srcW: sw, srcH: sh }; // srcW/srcH: the picture's own size (a darkened copy is a canvas, which has no natural size)
      }
      return null;
    },
    /** 'none' | 'loading' | 'ready' | 'failed' for the tower picture of this level (or the nearest lower one): 'loading' means wait (show the loader), 'failed' means use the old picture. */
    towerState(level) {
      if (!make) return 'none';
      for (let lv = Math.min(TOWER_ART_LEVELS.at(-1), Math.max(1, Math.trunc(Number(level) || 1))); lv >= 1; lv--) {
        const e = entry(towerArtKey(lv));
        if (e.failed) continue;
        return isReady(e.img) ? 'ready' : 'loading';
      }
      return 'failed';
    },
    /** The picture of a mounted weapon (arsenal id): { img, art } or null while loading / unknown / failed. */
    getMount(weaponId) {
      const art = Object.hasOwn(MOUNT_ART, weaponId) ? MOUNT_ART[weaponId] : null; if (!art || !make) return null;
      const e = entry(art.file);
      return e.failed || !isReady(e.img) ? null : { img: e.img, art };
    },
    /** 'none' | 'loading' | 'ready' | 'failed' for the picture `get(type, condition)` would draw. */
    state(type, condition) {
      const spec = Object.hasOwn(specs, type) ? specs[type] : null; if (!spec || !make) return 'none';
      const cond = ART_CONDITIONS.includes(condition) ? condition : 'repaired';
      const e = entry(`${spec.file}_${cond}`);
      return e.failed ? 'failed' : isReady(e.img) ? 'ready' : 'loading';
    },
    /** Same for a wall / gate LEVEL picture: 'loading' while the picture for this level (or the one below it) is still on its way, 'failed' when none exists. */
    levelState(type, level) {
      const spec = Object.hasOwn(LEVEL_ART, type) ? LEVEL_ART[type] : null; if (!spec || !make) return 'none';
      for (let lv = Math.min(levels.at(-1), Math.max(1, Math.trunc(Number(level) || 1))); lv >= 1; lv--) {
        const e = entry(`${spec.file}_level${lv}`);
        if (e.failed) continue;
        return isReady(e.img) ? 'ready' : 'loading';
      }
      return 'failed';
    },
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
