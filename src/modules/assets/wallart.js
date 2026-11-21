// Wall art layout (presentation only): how the painted wall / gate pictures (assets/sprites/buildings/wall_level<1-5>.png, gate_level<1-5>.png) are laid along a
// LINE wall (one column running top to bottom, bounds.shape 'line'). Pure maths in grid-cell units - no pixels, no DOM, no gameplay.
//
// Each picture is one self-contained wall SECTION about WALL_SECTION_CELLS tall (its own posts at both ends), so a wall is a stack of sections. The gate picture is
// the same size as a section and replaces one: it is centred on the gate's cell, so the door lands on the road. Whatever is left above and below the gate is divided
// into whole sections, each stretched a little (vertically only) so the sections meet exactly and the wall ends exactly at the map edge.
// The logical wall is untouched: it still owns its cells, the gate still owns its one cell. Only what is DRAWN follows these sections.

export const WALL_SECTION_CELLS = 4;
export const WALL_ART_LEVELS = Object.freeze([1, 2, 3, 4, 5]);

/**
 * Sections of a line wall.
 *   top, bottom : the wall's extent in cell edges (bounds.y1 and bounds.y2 + 1)
 *   gates       : y cells of the gates standing in the wall that are drawn with a gate picture (their section replaces a wall section)
 * Returns [{ kind: 'wall' | 'gate', y0, y1, gateY? }] in top-to-bottom order, covering [top, bottom] without gaps or overlaps.
 */
export function wallSections({ top, bottom, gates = [], section = WALL_SECTION_CELLS } = {}) {
  const out = []; const length = bottom - top;
  if (!(length > 0)) return out;
  const fill = (a, b) => { // whole sections between two edges, stretched to fit
    const len = b - a; if (len < 0.25) return;
    const n = Math.max(1, Math.round(len / section)); const each = len / n;
    for (let i = 0; i < n; i++) out.push({ kind: 'wall', y0: a + i * each, y1: a + (i + 1) * each });
  };
  let cursor = top;
  for (const gy of [...gates].sort((a, b) => a - b)) {
    const h = Math.min(section, bottom - cursor); if (h <= 0) break;
    let y0 = gy + 0.5 - section / 2;
    y0 = Math.min(Math.max(y0, cursor), bottom - h); // a gate near an edge (or another gate) slides inwards instead of leaving the wall
    fill(cursor, y0);
    out.push({ kind: 'gate', y0, y1: y0 + h, gateY: gy });
    cursor = y0 + h;
  }
  fill(cursor, bottom);
  return out;
}

/** The level a picture is chosen for: the building's level, never below 1 and never above what art exists. */
export const artLevel = (level) => Math.min(WALL_ART_LEVELS.at(-1), Math.max(1, Math.trunc(Number(level) || 1)));
