// NPC art: the painted survivor sprites (assets/sprites/npc/*.png, transparent background, sliced from the matryoshka concept sheets by
// scripts/slice-npc-sprites.py). Presentation only: the simulation still says "survivor X is doing GATHER facing LEFT"; this module answers
// "which picture, which walk frame, mirrored or not". A survivor still owns exactly one logical cell.
//
// The art has four views (down / up / left / right) instead of eight: the four diagonals use the nearest side view (left or right).
// Work poses exist as one picture each (axe, pickaxe, wrench, ...) facing right; facing left they are mirrored by the renderer.
// All sprites share one pixel scale, so a pose with a tool is as big as the idle pose. `ax` (sizes.json) is the foot anchor inside the picture.

export const NPC_ART_DIR = 'assets/sprites/npc/';
export const NPC_REF_H = 112;      // pixel height of the idle picture; drawn NPC_CELLS grid cells tall
export const NPC_CELLS = 1.3;
export const NPC_WALK_FPS = 5;

/** The four painted views and which of the eight simulation directions uses each. */
export const VIEW_OF = Object.freeze({
  UP: 'up', DOWN: 'down', LEFT: 'left', RIGHT: 'right',
  UP_LEFT: 'left', DOWN_LEFT: 'left', UP_RIGHT: 'right', DOWN_RIGHT: 'right',
});
/** Pictures that exist (the file stem). A test checks that every stem has a PNG and a sizes.json entry. */
export const NPC_POSES = Object.freeze([
  'idle_down', 'idle_up', 'idle_left', 'idle_right',
  'walk_down_0', 'walk_down_1', 'walk_up_0', 'walk_up_1', 'walk_left_0', 'walk_left_1', 'walk_right_0', 'walk_right_1',
  'tool_axe', 'tool_pickaxe', 'tool_spear', 'tool_bow', 'tool_crossbow', 'tool_rifle', 'tool_wrench',
  'downed', 'dead',
]);
/** Foot anchor (x, in picture pixels) per picture: the centre of mass of the lower body. Written by scripts/slice-npc-sprites.py into sizes.json (a test keeps this table equal to it);
 *  it lives in code because the page's CSP has connect-src 'none', so the browser could not fetch sizes.json. */
export const NPC_ANCHORS = Object.freeze(Object.fromEntries(Object.entries({ idle_down: 35.1, idle_up: 34.7, idle_left: 33.9, idle_right: 36.5, tool_axe: 32.4, tool_pickaxe: 32.5, tool_spear: 34.3, tool_bow: 38.8, tool_crossbow: 32.7, tool_rifle: 31.6, tool_wrench: 36.5, downed: 66.4, dead: 54.2, walk_down_0: 34.4, walk_down_1: 34.9, walk_up_0: 32.8, walk_up_1: 33.2, walk_left_0: 40.3, walk_left_1: 34.0, walk_right_0: 36.9, walk_right_1: 34.4 }).map(([k, ax]) => [k, { ax }])));
const LEFT_VIEWS = new Set(['left']);

/** Is this gather job a rock job (pickaxe, stone chips) rather than a tree job (axe, wood chips)? */
export const isStoneWork = (resource) => /stone|rock|ore|metal|scrap/.test(String(resource ?? ''));

/** Which tool picture a work animation shows. `resource` is what the survivor is gathering ('wood', 'stone', ...), null when unknown. */
export function toolPoseFor(animation, resource = null) {
  const a = String(animation ?? '').toLowerCase();
  if (a === 'repair' || a === 'work') return 'tool_wrench';
  if (a === 'gather') return isStoneWork(resource) ? 'tool_pickaxe' : 'tool_axe';
  if (a === 'attack') return 'tool_spear';
  return null;
}

/**
 * Semantic request -> { key, mirror } or null (null = no painted look; the renderer falls back to the placeholder atlas).
 * downed / dead: the lying pictures · walk: the two stride frames of the view · work poses: the tool picture (mirrored when facing left) ·
 * everything else (idle, rest, eat, drink, guard, hurt): the standing picture of the view.
 */
export function npcPose({ animation = 'IDLE', direction = 'DOWN', resource = null, frame = 0 } = {}) {
  const a = String(animation).toLowerCase();
  const view = VIEW_OF[direction] ?? 'down';
  const mirrorLeft = LEFT_VIEWS.has(view);
  if (a === 'downed') return { key: 'downed', mirror: false };
  if (a === 'dead') return { key: 'dead', mirror: false };
  if (a === 'walk') return { key: `walk_${view}_${((frame % 2) + 2) % 2}`, mirror: false };
  const tool = toolPoseFor(a, resource);
  if (tool) return { key: tool, mirror: mirrorLeft };
  return { key: `idle_${view}`, mirror: false };
}

// ---- Chopping / mining swing (presentation only) ----
// The tool picture is one still image, so the "banging" is motion: the survivor leans back to wind up, lunges at the tree / rock, presses in for a moment (the hit: chips fly)
// and eases back, over and over. The simulation does not know about it; a survivor still owns exactly one logical cell and the node does not move.
export const WORK_SWING_MS = 900;     // one wind-up + strike + recovery
export const WORK_LUNGE_CELLS = 0.4;  // how far the full lunge goes toward the target, in grid cells (the wind-up goes back 0.35 of that)
export const WORK_TILT_RAD = 0.2;     // lean at full lunge, about the feet
const FACING = Object.freeze({ UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0], UP_LEFT: [-Math.SQRT1_2, -Math.SQRT1_2], UP_RIGHT: [Math.SQRT1_2, -Math.SQRT1_2], DOWN_LEFT: [-Math.SQRT1_2, Math.SQRT1_2], DOWN_RIGHT: [Math.SQRT1_2, Math.SQRT1_2] });
/** Unit vector (x right, y down) of a simulation direction; a survivor works facing her node, so this points at it. Unknown -> down. */
export const facingVector = (direction) => FACING[direction] ?? FACING.DOWN;

/**
 * Where the swing is at `timeMs`: `lunge` -0.35..1 (negative = leaning back to wind up, 1 = fully into the hit, 0 = at rest) and `impact` 0..1 (1 the instant the tool lands,
 * fading out; the renderer throws chips with it). `offsetMs` staggers survivors so two of them never strike in step. Pure.
 */
export function workSwing(timeMs, offsetMs = 0) {
  const t = ((((timeMs + offsetMs) % WORK_SWING_MS) + WORK_SWING_MS) % WORK_SWING_MS) / WORK_SWING_MS;
  let lunge;
  if (t < 0.5) lunge = -0.35 * (1 - (1 - t / 0.5) ** 2);                    // wind-up: ease back
  else if (t < 0.62) { const u = (t - 0.5) / 0.12; lunge = -0.35 + 1.35 * u * u; } // strike: fast, accelerating
  else if (t < 0.72) lunge = 1;                                              // pressed into the hit
  else { const u = (t - 0.72) / 0.28; lunge = 1 - (u * u * (3 - 2 * u)); }  // recover (smoothstep) back to rest
  const impact = t >= 0.62 && t < 0.8 ? 1 - (t - 0.62) / 0.18 : 0;
  return { lunge: lunge + 0, impact }; // + 0 turns -0 into 0
}

/** Which of the two stride frames to show at `timeMs` (presentation clock only). */
export const walkFrameAt = (timeMs, offsetMs = 0) => Math.floor(((timeMs + offsetMs) / 1000) * NPC_WALK_FPS) % 2;

/**
 * Lazy image cache, same shape as createNodeArt. `get(key)` returns { img, ax } (ax = foot anchor in picture pixels) once the picture has
 * loaded, else null (not loaded yet, missing file, no DOM). `sizes` = { key: { ax } } (default NPC_ANCHORS); a key without an entry is anchored at the picture's centre.
 *
 * The renderer must never show the placeholder (mock) survivor while the painted one is only loading, so:
 *  - `preload()` starts loading every pose at once (the renderer calls it on mount), instead of each pose waiting for its first use;
 *  - `pending()` says "some picture is still on its way" (true for at most `loadTimeoutMs` after the first request): the renderer then draws nothing
 *    rather than the mock; once everything has loaded or failed (or the time is up) a survivor with no picture at all gets the placeholder again.
 */
export function createNpcArt({ baseUrl = NPC_ART_DIR, loadImage = null, sizes = null, now = () => (typeof performance !== 'undefined' ? performance.now() : 0), loadTimeoutMs = 4000 } = {}) {
  const cache = new Map();
  const make = loadImage ?? (typeof Image === 'undefined' ? null : (url) => { const img = new Image(); img.src = url; return img; });
  const isReady = (img) => Boolean(img && img.complete !== false && (img.naturalWidth ?? img.width) > 0);
  const table = sizes ?? NPC_ANCHORS;
  let firstAt = null;
  const entry = (key) => {
    let e = cache.get(key);
    if (!e) {
      if (firstAt === null) firstAt = now();
      e = { img: make(`${baseUrl}${key}.png`), failed: false };
      try { e.img.onerror = () => { e.failed = true; }; } catch { /* non-DOM image stand-in */ }
      cache.set(key, e);
    }
    return e;
  };
  return {
    get(key) {
      if (!key || !make) return null;
      const e = entry(key);
      if (e.failed || !isReady(e.img)) return null;
      const w = e.img.naturalWidth ?? e.img.width;
      return { img: e.img, ax: table?.[key]?.ax ?? w / 2 };
    },
    /** Start loading every pose now (default: all of NPC_POSES, idle pictures first), so a pose is ready before its first use. */
    preload(keys = NPC_POSES) { if (!make) return 0; const order = [...keys].sort((a, b) => Number(b.startsWith('idle')) - Number(a.startsWith('idle'))); for (const k of order) entry(k); return order.length; },
    /** True while some requested picture is still loading (and the timeout has not run out). */
    pending() { if (!make || firstAt === null || now() - firstAt >= loadTimeoutMs) return false; for (const e of cache.values()) if (!e.failed && !isReady(e.img)) return true; return false; },
  };
}
