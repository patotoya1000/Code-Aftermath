// Tower art (presentation only): the five painted watchtower pictures (assets/sprites/buildings/tower_level_<1-5>.png) and the four painted MOUNTED weapons that sit on
// their roofs (tower_mount_<ballista|machinegun|minigun|dual_minigun>.png), plus the maths that makes a mount TURN to face the zombie it is shooting at.
// Pure maths and plain data + one canvas helper that takes a context: no DOM, no gameplay. The simulation already says what a mount is aimed at (`tower.installed[i].aim`);
// this file only decides how that looks.
//
// Pictures are drawn at TOWER_PX_PER_CELL source pixels per grid cell, standing on the bottom edge of the tower's cell (like every other painted building).
// A level 1 lookout has no mount seat (a survivor stands there); levels 2-5 have a round socket on the roof, measured in source pixels in TOWER_SEATS.
//
// HOW A MOUNT TURNS. The pictures are side views that face right, so a real turntable cannot be shown. Two cheap tricks give the same feel:
//   1. the HEAD (gun, belt, yoke - everything above `cut`) tilts around `pivot` toward the target, up to MAX_ELEVATION either way, while the BASE (disc + pedestal) stays put;
//   2. when the target is on the other side, the head turns round like a turntable: it squashes through edge-on to a mirrored picture in FLIP_MS (`facing` runs -1..1).
// If the target is nowhere, the head eases back to level and keeps the side it last faced.

export const TOWER_ART_LEVELS = Object.freeze([1, 2, 3, 4, 5]);
export const TOWER_PX_PER_CELL = 190;

/** Where a mount sits on each level's roof: the centre of the round socket (source px of tower_level_<n>.png) and its flange width. Level 1 has none. */
export const TOWER_SEATS = Object.freeze({
  2: { x: 122, y: 67, w: 74 },
  3: { x: 150, y: 61, w: 63 },
  4: { x: 135, y: 57, w: 76 },
  5: { x: 145, y: 75, w: 85 },
});

/**
 * One entry per mounted weapon id (the same ids as `weapons` in arsenal.js). All numbers are SOURCE pixels of the mount's own picture:
 *   base  = centre and width of the round foot (it lands on the socket), pivot = what the head tilts around, cut = the row where head and base part (a few px overlap).
 *   muzzles = where shots leave the barrel(s) at rest, used by the muzzle flash.
 */
export const MOUNT_ART = Object.freeze({
  ballista: { file: 'tower_mount_ballista', w: 315, h: 251, base: { x: 138, y: 204, w: 182 }, pivot: { x: 112, y: 108 }, cut: 158, muzzles: [{ x: 300, y: 100 }] },
  machine_gun: { file: 'tower_mount_machinegun', w: 331, h: 252, base: { x: 152, y: 212, w: 148 }, pivot: { x: 152, y: 102 }, cut: 122, muzzles: [{ x: 326, y: 124 }] },
  minigun: { file: 'tower_mount_minigun', w: 324, h: 274, base: { x: 145, y: 240, w: 172 }, pivot: { x: 128, y: 135 }, cut: 176, muzzles: [{ x: 318, y: 122 }] },
  dual_minigun: { file: 'tower_mount_dual_minigun', w: 348, h: 295, base: { x: 138, y: 240, w: 190 }, pivot: { x: 150, y: 150 }, cut: 196, muzzles: [{ x: 342, y: 98 }, { x: 342, y: 142 }] },
});

export const MOUNT_FILES = Object.freeze(Object.fromEntries(Object.entries(MOUNT_ART).map(([id, m]) => [id, m.file])));

export const MAX_ELEVATION = (55 * Math.PI) / 180; // the head never tilts more than this up or down (the picture looks wrong beyond it)
export const TURN_RAD_PER_MS = 0.0065;              // ~370 degrees per second
export const FLIP_MS = 200;                          // time to turn round to the other side
export const HEAD_OVERLAP = 4;                       // source px the head picture reaches below `cut`, so no seam shows

/** How wide a mount is drawn relative to the socket flange: the foot is a little wider than the hole it sits on. */
export const FOOT_FILL = 1.15;
/** With 2 or more mounts on a roof each is drawn smaller and shifted sideways so they sit side by side (`step` = distance between neighbours, in socket widths). */
export const CROWD = Object.freeze({ 2: { scale: 0.78, step: 0.95 }, 3: { scale: 0.68, step: 0.82 } });

/** Level -> the picture key (`tower_level_<n>`); a level beyond the art uses the highest one. */
export const towerArtKey = (level) => `tower_level_${Math.min(TOWER_ART_LEVELS.at(-1), Math.max(1, Math.trunc(Number(level) || 1)))}`;

/**
 * The seats for `count` mounts on a level's roof, in source px of the tower picture: [{ x, y, w }] left to right (w = the foot width to draw each at). A level
 * without a socket (level 1) has none. Several mounts share the roof: smaller and spread along the roof's width.
 */
export function mountSeats(level, count) {
  const base = TOWER_SEATS[Math.min(TOWER_ART_LEVELS.at(-1), Math.max(1, Math.trunc(Number(level) || 1)))];
  const n = Math.max(0, Math.trunc(count) || 0);
  if (!base || n === 0) return [];
  const crowd = n > 1 ? CROWD[Math.min(n, 3)] : null;
  return Array.from({ length: n }, (_, i) => ({
    x: base.x + (crowd ? (i - (n - 1) / 2) * base.w * crowd.step : 0),
    y: base.y + (crowd ? ((i % 2) * 2 - 1) * -base.w * 0.05 : 0), // a slight stagger in depth, so neighbours do not line up like fence posts
    w: base.w * FOOT_FILL * (crowd ? crowd.scale : 1),
  }));
}

/**
 * Where a mount should look: from the seat (screen px) to the target (screen px). `facing` = -1 / 1 (which side), `angle` = tilt in radians measured from the
 * facing direction (positive = down the screen), clamped to MAX_ELEVATION. `keep` = the facing to keep when the target is straight above or below.
 */
export function aimAt(from, to, keep = 1) {
  const dx = to.x - from.x; const dy = to.y - from.y;
  const facing = Math.abs(dx) < 1e-6 ? keep : dx < 0 ? -1 : 1;
  const angle = Math.max(-MAX_ELEVATION, Math.min(MAX_ELEVATION, Math.atan2(dy, Math.abs(dx))));
  return { facing, angle };
}

/**
 * One animation step of a mount's head. `state` = { facing (-1..1, mid-turn values in between), angle }, `goal` = { facing, angle } or null (nothing to shoot: level, same side),
 * `dtMs` = time since the last step. Returns the new state; it never overshoots the goal.
 */
export function stepAim(state, goal, dtMs) {
  const dt = Math.max(0, Math.min(250, dtMs || 0));
  const want = goal ?? { facing: state.facing < 0 ? -1 : 1, angle: 0 };
  const turn = (cur, to, speed) => (Math.abs(to - cur) <= speed * dt ? to : cur + Math.sign(to - cur) * speed * dt);
  return { facing: turn(state.facing, want.facing, 2 / FLIP_MS), angle: turn(state.angle, want.angle, TURN_RAD_PER_MS) };
}

/** A fresh head state: level, facing right (towards where the zombies come from). */
export const restingAim = () => ({ facing: 1, angle: 0 });

/**
 * Draw one mount. `img` = its loaded picture, `art` = its MOUNT_ART entry, `at` = where the centre of the round foot lands (screen px), `scale` = screen px per source px,
 * `aim` = { facing, angle }. The base is drawn flat; the head is drawn tilted around the pivot and squashed horizontally by `facing` (a mirror at +/-1), clipped to the rows
 * above `cut`. Returns the screen position of the muzzles (for the flash): [{ x, y }].
 */
export function drawMount(ctx, img, art, at, scale, aim) {
  const w = art.w; const h = art.h;
  const ox = at.x - art.base.x * scale; const oy = at.y - art.base.y * scale; // top-left of the picture when level and facing right
  const cut = art.cut;
  ctx.drawImage(img, 0, cut, w, h - cut, ox, oy + cut * scale, w * scale, (h - cut) * scale); // base: the rows below the cut, never moves
  const px = ox + art.pivot.x * scale; const py = oy + art.pivot.y * scale;
  const sx = Math.max(0.12, Math.abs(aim.facing)) * (aim.facing < 0 ? -1 : 1); // never exactly 0: a hairline instead of a divide-by-nothing when mid-turn
  ctx.save();
  ctx.translate(px, py); ctx.rotate(aim.angle * (aim.facing < 0 ? -1 : 1)); ctx.scale(sx, 1); ctx.translate(-px, -py);
  ctx.drawImage(img, 0, 0, w, cut + HEAD_OVERLAP, ox, oy, w * scale, (cut + HEAD_OVERLAP) * scale);
  ctx.restore();
  return art.muzzles.map((m) => {
    const dx = (m.x - art.pivot.x) * scale * sx; const dy = (m.y - art.pivot.y) * scale; const r = aim.angle * (aim.facing < 0 ? -1 : 1);
    return { x: px + dx * Math.cos(r) - dy * Math.sin(r), y: py + dx * Math.sin(r) + dy * Math.cos(r) };
  });
}
