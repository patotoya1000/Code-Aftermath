// Draws the painted-style building, gate and wall sprites (assets/sprites/buildings/<name>_<condition>.png, transparent background).
// Deterministic: same script, same pictures (seeded wobble, no Math.random). Run: node scripts/make-building-sprites.mjs [contact-sheet.png]
// Each sprite is a front-on 3/4 view standing on a soft shadow, feet at the bottom edge of the picture. `sizes.json` records the pixel size of each
// one; the renderer scales a sprite to its type's width in cells (BUILDING_ART in src/modules/assets/buildingart.js).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const OUT = new URL('../assets/sprites/buildings/', import.meta.url).pathname;
const C = { ink: '#1c1814', wood: '#8b6b49', woodD: '#5e4631', woodL: '#b08d63', stone: '#8c8e86', stoneD: '#5c5e58', stoneL: '#b4b6ad', roofR: '#8e4b3b', roofRD: '#5f2f27', roofG: '#566f4d', roofGD: '#364a33',
  roofB: '#55626b', roofBD: '#343d44', metal: '#74808a', metalD: '#444d55', metalL: '#a3adb5', canvas: '#c3b083', canvasD: '#8e7c55', blue: '#3f6f93', blueD: '#264559', grass: '#6d8f3f', soil: '#6b5238', soilD: '#47341f', rust: '#8a4b2a', soot: '#25211d', yellow: '#d6a928', red: '#b23b32', glass: '#7fa6b8' };
const CONDS = ['repaired', 'damaged', 'ruined'];

const rngFor = (seed) => { let a = 0; for (const ch of seed) a = (a * 31 + ch.charCodeAt(0)) >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const f = (n) => Math.round(n * 10) / 10;
const poly = (pts, fill, stroke = C.ink, sw = 3, extra = '') => `<polygon points="${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" ${extra}/>`;
const rect = (x, y, w, h, fill, stroke = C.ink, sw = 3, r = 2, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
const line = (x1, y1, x2, y2, stroke, sw = 2, extra = '') => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" ${extra}/>`;
const ell = (cx, cy, rx, ry, fill, stroke = 'none', sw = 0) => `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const shadow = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgba(8,10,6,.45)" filter="url(#blur)"/>`;
/** vertical plank lines + a light strip on the left, to make a flat wall read as wood */
const planks = (x, y, w, h, n, color = C.woodD) => Array.from({ length: n - 1 }, (_, i) => line(x + (w * (i + 1)) / n, y + 2, x + (w * (i + 1)) / n, y + h - 2, color, 2, 'opacity=".7"')).join('') + `<rect x="${x + 3}" y="${y + 3}" width="${Math.max(3, w * 0.06)}" height="${h - 6}" fill="rgba(255,236,200,.18)"/>`;
const rubble = (rnd, cx, cy, spread, n, cols = [C.stone, C.stoneD, C.woodD, C.wood]) => Array.from({ length: n }, () => { const x = cx + (rnd() - 0.5) * spread * 2; const y = cy + (rnd() - 0.5) * spread * 0.45; const s = 5 + rnd() * 13; const col = cols[Math.floor(rnd() * cols.length)];
  return rnd() > 0.45 ? poly([[x - s, y + s * 0.3], [x - s * 0.3, y - s * 0.6], [x + s * 0.8, y - s * 0.2], [x + s, y + s * 0.4]], col, C.ink, 2) : rect(x - s, y - s * 0.25, s * 2, s * 0.5, col, C.ink, 2, 1, `transform="rotate(${f((rnd() - 0.5) * 70)} ${f(x)} ${f(y)})"`); }).join('');
const jag = (rnd, x1, x2, y, amp, n) => { const out = []; for (let i = 0; i <= n; i++) out.push([x1 + ((x2 - x1) * i) / n, y - rnd() * amp]); return out; };
const soot = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(20,16,12,.38)" filter="url(#blur)"/>`;
const crack = (rnd, x, y, len) => { let px = x; let py = y; const pts = [`${f(px)},${f(py)}`]; for (let i = 0; i < 4; i++) { px += (rnd() - 0.5) * 14; py += len / 4; pts.push(`${f(px)},${f(py)}`); } return `<polyline points="${pts.join(' ')}" fill="none" stroke="${C.ink}" stroke-width="2" opacity=".75"/>`; };
const tileLines = (x1, y1, x2, y2, rows, color) => Array.from({ length: rows - 1 }, (_, i) => { const t = (i + 1) / rows; return line(x1 + (x2 - x1) * 0, y1 + (y2 - y1) * t, x2, y1 + (y2 - y1) * t, color, 2, 'opacity=".55"'); }).join('');

/** A pitched-roof house: wall box, roof, door, windows. `o` carries the colours and details; wear changes the roof, the walls and the whole outline. */
function house(cond, rnd, W, H, o) {
  const { cx, base, ww, wh, rh, roof, roofD, door = true, windows = [], chimney = null, signs = '', wall = C.wood, wallD = C.woodD, stoneBase = true } = o;
  const x = cx - ww / 2; const y = base - wh;
  let s = shadow(cx, base - 4, ww * 0.62, 16);
  if (cond === 'ruined') {
    const top = jag(rnd, x + 4, x + ww - 4, y + wh * 0.42, wh * 0.4, 9);
    s += poly([[x + 4, base], ...top, [x + ww - 4, base]], wall, C.ink, 3);
    s += planks(x + 4, y + wh * 0.4, ww - 8, wh * 0.6, 7) + soot(x, y + wh * 0.3, ww, wh * 0.7);
    if (stoneBase) s += rect(x, base - 24, ww, 24, C.stone, C.ink, 3, 2) + crack(rnd, cx - ww * 0.2, base - 22, 20);
    s += poly([[x - 6, y + wh * 0.3], [x + ww * 0.55, y + wh * 0.12], [x + ww * 0.62, y + wh * 0.42], [x + 6, y + wh * 0.62]], roof, C.ink, 3, `transform="rotate(-9 ${x} ${y})"`) + tileLines(x, y + wh * 0.3, x + ww * 0.6, y + wh * 0.4, 3, roofD);
    s += rect(cx + ww * 0.1, y + wh * 0.34, ww * 0.34, 10, C.woodD, C.ink, 2, 1, `transform="rotate(14 ${cx} ${y})"`) + rubble(rnd, cx, base - 6, ww * 0.55, 13);
    if (chimney) s += rect(chimney.x, base - 70, chimney.w, 60, C.stoneD, C.ink, 3, 2) + soot(chimney.x - 4, base - 76, chimney.w + 8, 40);
    return s;
  }
  const tilt = cond === 'damaged' ? `transform="rotate(${f(rnd() * 2.4 - 1.2)} ${cx} ${base})"` : '';
  s += `<g ${tilt}>`;
  s += rect(x, y, ww, wh, wall, C.ink, 3, 2) + planks(x, y, ww, wh, Math.max(5, Math.round(ww / 26)), wallD);
  if (stoneBase) s += rect(x - 2, base - 22, ww + 4, 22, C.stone, C.ink, 3, 2) + Array.from({ length: Math.round(ww / 34) }, (_, i) => line(x + 14 + i * 34, base - 22, x + 14 + i * 34, base, C.stoneD, 2)).join('');
  if (door) s += rect(cx - 22, base - wh * 0.78, 44, wh * 0.78 - 0, C.woodD, C.ink, 3, 2) + rect(cx - 14, base - wh * 0.7, 28, wh * 0.7, '#2b2119', 'none', 0, 1) + `<circle cx="${cx + 12}" cy="${base - wh * 0.38}" r="3" fill="${C.yellow}"/>`;
  for (const wd of windows) { s += rect(wd.x, wd.y, wd.w, wd.h, cond === 'damaged' && wd.broken ? '#2b2119' : C.glass, C.ink, 3, 2) + line(wd.x + wd.w / 2, wd.y, wd.x + wd.w / 2, wd.y + wd.h, C.ink, 2) + line(wd.x, wd.y + wd.h / 2, wd.x + wd.w, wd.y + wd.h / 2, C.ink, 2);
    if (cond === 'damaged' && wd.broken) s += rect(wd.x - 4, wd.y + 4, wd.w + 8, 8, C.woodD, C.ink, 2, 1, `transform="rotate(-12 ${wd.x} ${wd.y})"`); }
  const rx1 = x - 22; const rx2 = x + ww + 22; const ry = y + 6;
  s += poly([[rx1, ry], [rx2, ry], [rx2 - ww * 0.12, ry - rh], [rx1 + ww * 0.12, ry - rh]], roof, C.ink, 3) + tileLines(rx1, ry - rh, rx2, ry, 5, roofD);
  s += `<rect x="${rx1 + 4}" y="${ry - rh + 3}" width="${rx2 - rx1 - 8}" height="7" fill="rgba(255,245,215,.2)"/>` + line(rx1, ry + 3, rx2, ry + 3, 'rgba(0,0,0,.35)', 5);
  if (chimney) s += rect(chimney.x, ry - rh - 26, chimney.w, 44, C.stone, C.ink, 3, 2) + rect(chimney.x - 3, ry - rh - 30, chimney.w + 6, 8, C.stoneD, C.ink, 2, 1);
  if (cond === 'damaged') { // a hole in the roof, missing planks, cracks, soot
    s += poly([[cx - 40, ry - rh * 0.8], [cx + 10, ry - rh * 0.9], [cx + 28, ry - rh * 0.35], [cx - 22, ry - rh * 0.18]], '#1f1a16', C.ink, 2) + line(cx - 30, ry - rh * 0.5, cx + 18, ry - rh * 0.62, C.woodD, 5);
    s += Array.from({ length: 3 }, () => rect(x + rnd() * (ww - 22), y + 6 + rnd() * (wh - 40), 10, 26 + rnd() * 20, '#2b2119', 'none', 0, 1)).join('') + crack(rnd, x + ww * 0.8, y + 6, 40) + soot(x, y, ww, wh * 0.5);
  }
  s += signs + '</g>';
  return s;
}

const wearField = (cond, rnd) => cond; // (kept for readability: fields wear in their own drawer)

// ---------------------------------------------------------------------------------------------- one drawer per building type
const DRAW = {
  hq: (cond, rnd) => ({ w: 384, h: 384, svg: house(cond, rnd, 384, 384, { cx: 192, base: 356, ww: 262, wh: 150, rh: 102, roof: C.roofG, roofD: C.roofGD, windows: [{ x: 84, y: 236, w: 44, h: 42, broken: true }, { x: 256, y: 236, w: 44, h: 42 }], chimney: { x: 282, w: 28 },
    signs: cond === 'repaired' ? line(192, 112, 192, 52, C.woodD, 4) + poly([[192, 54], [232, 64], [192, 78]], C.red, C.ink, 2) : cond === 'damaged' ? line(192, 126, 192, 84, C.woodD, 4) + poly([[192, 86], [214, 98], [192, 104]], '#7a2a24', C.ink, 2) : '' }) }),
  tent: (cond, rnd) => { let s = shadow(128, 232, 100, 14);
    if (cond === 'ruined') return { w: 256, h: 256, svg: s + poly([[40, 236], [90, 196], [150, 214], [214, 200], [226, 238]], C.canvasD, C.ink, 3) + poly([[70, 232], [120, 206], [170, 224], [205, 236]], C.canvas, C.ink, 2) + line(60, 236, 98, 130, C.woodD, 5) + line(196, 236, 170, 168, C.woodD, 5) + rubble(rnd, 128, 238, 80, 5) };
    s += `<g ${cond === 'damaged' ? 'transform="rotate(2 128 236)"' : ''}>` + poly([[128, 60], [226, 236], [30, 236]], C.canvas, C.ink, 3) + poly([[128, 60], [226, 236], [150, 236]], C.canvasD, C.ink, 3) + poly([[128, 116], [166, 236], [92, 236]], '#3a2f20', C.ink, 3) + line(128, 60, 128, 236, 'rgba(0,0,0,.25)', 2) + line(128, 40, 128, 66, C.woodD, 5) + `<polygon points="128,36 150,44 128,52" fill="${C.red}" stroke="${C.ink}" stroke-width="2"/>`;
    if (cond === 'damaged') s += poly([[90, 150], [118, 176], [96, 196]], '#2b2119', C.ink, 2) + poly([[170, 190], [196, 214], [172, 222]], '#2b2119', C.ink, 2) + line(30, 236, 70, 236, C.woodD, 3);
    return { w: 256, h: 256, svg: s + '</g>' + rect(36, 226, 18, 10, C.woodD, C.ink, 2) }; },
  storage: (cond, rnd) => ({ w: 256, h: 256, svg: house(cond, rnd, 256, 256, { cx: 128, base: 236, ww: 186, wh: 100, rh: 64, roof: C.roofB, roofD: C.roofBD, windows: [], door: false, signs: cond === 'ruined' ? '' : rect(92, 154, 72, 82, C.woodD, C.ink, 3, 2) + line(128, 154, 128, 236, C.ink, 3) + rect(98, 176, 28, 10, C.metal, C.ink, 2, 1) + rect(132, 176, 28, 10, C.metal, C.ink, 2, 1) + rect(176, 206, 34, 30, C.woodL, C.ink, 3, 2) + rect(50, 212, 28, 24, C.wood, C.ink, 3, 2) }) }),
  kitchen: (cond, rnd) => ({ w: 256, h: 256, svg: house(cond, rnd, 256, 256, { cx: 128, base: 238, ww: 170, wh: 100, rh: 66, roof: C.roofR, roofD: C.roofRD, windows: [{ x: 56, y: 166, w: 36, h: 32, broken: true }], chimney: { x: 168, w: 24 }, signs: cond === 'repaired' ? ell(176, 70, 10, 6, 'rgba(230,230,230,.55)') + ell(184, 48, 14, 8, 'rgba(230,230,230,.4)') : '' }) }),
  workshop: (cond, rnd) => ({ w: 256, h: 256, svg: house(cond, rnd, 256, 256, { cx: 128, base: 238, ww: 188, wh: 102, rh: 62, roof: C.roofB, roofD: C.roofBD, windows: [{ x: 160, y: 168, w: 34, h: 30 }], chimney: { x: 54, w: 22 },
    signs: cond === 'ruined' ? '' : rect(58, 206, 34, 12, C.metalD, C.ink, 2, 1) + rect(66, 216, 18, 20, C.metal, C.ink, 2, 1) + `<g transform="translate(206 176)"><circle r="16" fill="${C.metal}" stroke="${C.ink}" stroke-width="3"/><circle r="6" fill="${C.metalD}"/>${Array.from({ length: 8 }, (_, i) => `<rect x="-3" y="-23" width="6" height="8" fill="${C.metal}" stroke="${C.ink}" stroke-width="2" transform="rotate(${i * 45})"/>`).join('')}</g>` }) }),
  generator: (cond, rnd) => { let s = shadow(128, 230, 92, 13);
    if (cond === 'ruined') return { w: 256, h: 256, svg: s + rect(60, 190, 130, 44, C.rust, C.ink, 3, 3, 'transform="rotate(-4 128 230)"') + soot(60, 170, 130, 64) + line(180, 200, 214, 150, C.metalD, 8) + rubble(rnd, 128, 236, 78, 7, [C.metalD, C.rust, C.stoneD]) + rect(94, 214, 60, 14, C.metalD, C.ink, 2, 1, 'transform="rotate(8 120 220)"') };
    s += `<g ${cond === 'damaged' ? 'transform="rotate(-2 128 234)"' : ''}>` + rect(46, 126, 164, 108, C.metal, C.ink, 3, 6) + rect(46, 126, 164, 18, C.metalL, C.ink, 3, 4) + rect(58, 154, 74, 62, C.metalD, C.ink, 3, 3) + Array.from({ length: 5 }, (_, i) => line(64, 164 + i * 11, 126, 164 + i * 11, C.ink, 2)).join('') + `<circle cx="168" cy="176" r="24" fill="${C.metalD}" stroke="${C.ink}" stroke-width="3"/><circle cx="168" cy="176" r="9" fill="${C.yellow}" stroke="${C.ink}" stroke-width="2"/>` + rect(196, 70, 14, 62, C.metalD, C.ink, 3, 2) + rect(192, 62, 22, 10, C.metalL, C.ink, 2, 2) + rect(46, 216, 164, 8, C.yellow, 'none', 0, 0, 'opacity=".85"');
    if (cond === 'damaged') s += soot(46, 126, 164, 110) + crack(rnd, 120, 128, 60) + rect(70, 140, 34, 8, C.rust, 'none', 0, 1) + line(196, 62, 214, 40, 'rgba(70,70,70,.6)', 10);
    else s += ell(204, 52, 9, 6, 'rgba(210,210,210,.5)');
    return { w: 256, h: 256, svg: s + '</g>' }; },
  battery: (cond, rnd) => { let s = shadow(128, 232, 84, 12);
    if (cond === 'ruined') return { w: 256, h: 256, svg: s + rect(54, 196, 62, 38, C.metalD, C.ink, 3, 3, 'transform="rotate(-9 80 220)"') + rect(130, 204, 70, 30, C.rust, C.ink, 3, 3, 'transform="rotate(6 160 220)"') + soot(50, 180, 160, 56) + rubble(rnd, 128, 238, 74, 6, [C.metalD, C.rust, C.stoneD]) };
    s += `<g ${cond === 'damaged' ? 'transform="rotate(3 128 234)"' : ''}>`;
    for (const [i, bx] of [[0, 52], [1, 100], [2, 148]]) { s += rect(bx, 118, 44, 116, C.metalD, C.ink, 3, 4) + rect(bx + 4, 124, 36, 22, C.metal, C.ink, 2, 2) + rect(bx + 12, 108, 20, 12, C.metalL, C.ink, 2, 2) + rect(bx + 6, 160, 32, 64, i === 1 && cond === 'damaged' ? '#5a3a2a' : C.blueD, C.ink, 2, 2) + `<circle cx="${bx + 22}" cy="136" r="5" fill="${cond === 'repaired' || i !== 1 ? '#5fd16a' : '#7a2a24'}" stroke="${C.ink}" stroke-width="1.5"/>`; }
    s += line(74, 112, 122, 112, C.red, 4) + line(122, 112, 170, 112, C.ink, 4);
    if (cond === 'damaged') s += soot(52, 118, 140, 116) + crack(rnd, 112, 160, 50);
    return { w: 256, h: 256, svg: s + '</g>' }; },
  solar_panel: (cond, rnd) => { let s = shadow(128, 232, 100, 12);
    if (cond === 'ruined') return { w: 256, h: 256, svg: s + poly([[60, 230], [120, 196], [150, 214], [92, 238]], '#26323a', C.ink, 3) + poly([[140, 220], [200, 190], [214, 206], [158, 230]], '#2f3b44', C.ink, 3) + line(110, 232, 126, 170, C.metalD, 5) + rubble(rnd, 128, 238, 86, 6, [C.metalD, C.glass, C.stoneD]) };
    const panel = (x, y, w, h, skew) => poly([[x, y + skew], [x + w, y], [x + w, y + h], [x, y + h + skew]], C.blue, C.ink, 3) + Array.from({ length: 4 }, (_, i) => line(x + (w * (i + 1)) / 5, y + skew * (1 - (i + 1) / 5), x + (w * (i + 1)) / 5, y + h + skew * (1 - (i + 1) / 5), C.blueD, 2)).join('') + line(x, y + skew + h / 2, x + w, y + h / 2, C.blueD, 2) + poly([[x + 4, y + skew + 4], [x + w * 0.5, y + skew * 0.5 + 4], [x + w * 0.5, y + skew * 0.5 + 16], [x + 4, y + skew + 18]], 'rgba(255,255,255,.18)', 'none', 0);
    s += line(90, 232, 90, 170, C.metalD, 6) + line(182, 232, 182, 164, C.metalD, 6) + panel(40, 96, 100, 80, 24) + panel(120, 90, 100, 80, 24);
    if (cond === 'damaged') s += poly([[160, 100], [200, 96], [210, 140], [172, 150]], '#1d2a33', C.ink, 2) + crack(rnd, 70, 110, 60) + crack(rnd, 190, 100, 50) + soot(40, 90, 180, 90);
    return { w: 256, h: 256, svg: s }; },
  water_tank: (cond, rnd) => { let s = shadow(128, 234, 74, 12);
    if (cond === 'ruined') return { w: 256, h: 256, svg: s + rect(76, 190, 104, 44, C.blueD, C.ink, 3, 8, 'transform="rotate(-8 128 220)"') + ell(128, 190, 52, 12, '#1d2a33', C.ink, 3) + line(80, 234, 60, 150, C.woodD, 6) + line(176, 234, 190, 170, C.woodD, 6) + rubble(rnd, 128, 238, 70, 6, [C.woodD, C.stoneD, C.blueD]) + `<ellipse cx="128" cy="236" rx="64" ry="8" fill="rgba(70,110,140,.35)"/>` };
    s += line(74, 234, 74, 160, C.woodD, 8) + line(182, 234, 182, 160, C.woodD, 8) + line(74, 200, 182, 200, C.woodD, 5) + rect(66, 70, 124, 130, C.blue, C.ink, 3, 14) + ell(128, 72, 62, 16, C.blueD, C.ink, 3) + rect(66, 110, 124, 10, C.metal, C.ink, 2, 1) + rect(66, 150, 124, 10, C.metal, C.ink, 2, 1) + rect(74, 76, 14, 118, 'rgba(255,255,255,.16)', 'none', 0, 6);
    if (cond === 'damaged') s += crack(rnd, 128, 112, 70) + `<path d="M128 182 q-8 24 -4 50" stroke="rgba(120,170,210,.7)" stroke-width="5" fill="none"/>` + soot(66, 70, 124, 130);
    return { w: 256, h: 256, svg: s }; },
  well: (cond, rnd) => { let s = shadow(128, 232, 80, 12);
    if (cond === 'ruined') return { w: 256, h: 256, svg: s + ell(128, 206, 64, 24, C.stoneD, C.ink, 3) + ell(128, 202, 44, 14, '#17110d', C.ink, 2) + poly([[62, 206], [76, 188], [96, 196], [90, 220]], C.stone, C.ink, 2) + line(70, 214, 116, 128, C.woodD, 6) + rect(150, 214, 60, 10, C.woodD, C.ink, 2, 1, 'transform="rotate(-18 180 219)"') + rubble(rnd, 128, 236, 72, 5) };
    s += ell(128, 200, 64, 26, C.stone, C.ink, 3) + rect(64, 168, 128, 34, C.stone, C.ink, 3, 4) + ell(128, 168, 64, 24, C.stoneL, C.ink, 3) + ell(128, 168, 44, 14, '#1a2c38', C.ink, 2) + Array.from({ length: 6 }, (_, i) => line(76 + i * 20, 170, 76 + i * 20, 200, C.stoneD, 2)).join('');
    s += line(80, 176, 80, 80, C.woodD, 8) + line(176, 176, 176, 80, C.woodD, 8) + line(80, 100, 176, 100, C.woodD, 7) + line(128, 100, 128, 150, C.ink, 2) + rect(118, 146, 20, 16, C.woodL, C.ink, 2, 2) + poly([[62, 92], [128, 40], [194, 92]], C.roofR, C.ink, 3) + `<path d="M62 92 L194 92" stroke="rgba(0,0,0,.35)" stroke-width="5"/>`;
    if (cond === 'damaged') s += line(176, 80, 188, 90, C.ink, 3) + poly([[128, 40], [154, 64], [140, 80]], '#1f1a16', C.ink, 2) + crack(rnd, 100, 172, 26);
    return { w: 256, h: 256, svg: s }; },
  tower: (cond, rnd) => { let s = shadow(128, 330, 80, 14);
    if (cond === 'ruined') return { w: 256, h: 352, svg: s + line(70, 332, 80, 220, C.woodD, 9) + line(186, 332, 176, 250, C.woodD, 9) + line(70, 300, 176, 252, C.woodD, 5) + rect(60, 214, 78, 12, C.wood, C.ink, 3, 1, 'transform="rotate(-16 90 220)"') + rect(130, 300, 90, 10, C.woodD, C.ink, 2, 1, 'transform="rotate(10 170 305)"') + soot(60, 220, 140, 112) + rubble(rnd, 128, 336, 84, 10) };
    s += `<g ${cond === 'damaged' ? 'transform="rotate(-2 128 334)"' : ''}>` + line(70, 334, 88, 140, C.woodD, 10) + line(186, 334, 168, 140, C.woodD, 10) + line(74, 334, 182, 140, C.wood, 6) + line(182, 334, 74, 140, C.wood, 6) + line(78, 284, 178, 284, C.woodD, 7) + line(84, 220, 172, 220, C.woodD, 7) + line(92, 252, 98, 332, C.woodL, 5) + line(112, 252, 118, 332, C.woodL, 5)
      + rect(58, 128, 140, 16, C.woodL, C.ink, 3, 2) + rect(64, 90, 128, 42, C.wood, C.ink, 3, 2) + planks(64, 90, 128, 42, 6) + Array.from({ length: 7 }, (_, i) => line(66 + i * 21, 92, 66 + i * 21, 128, C.ink, 2, 'opacity=".4"')).join('')
      + poly([[50, 92], [206, 92], [176, 36], [80, 36]], C.roofR, C.ink, 3) + tileLines(50, 36, 206, 92, 3, C.roofRD) + line(128, 36, 128, 8, C.woodD, 4) + poly([[128, 8], [158, 16], [128, 26]], C.red, C.ink, 2);
    if (cond === 'damaged') s += poly([[96, 96], [124, 92], [132, 124], [104, 130]], '#1f1a16', C.ink, 2) + line(146, 128, 170, 148, C.woodD, 7) + crack(rnd, 150, 96, 30) + soot(58, 90, 150, 60);
    return { w: 256, h: 352, svg: s + '</g>' }; },
  field: (cond, rnd) => { const pts = [[28, 70], [228, 70], [248, 142], [8, 142]]; let s = shadow(128, 148, 112, 8) + poly(pts, C.soil, C.ink, 3) + poly([[28, 70], [228, 70], [232, 80], [24, 80]], 'rgba(255,230,190,.14)', 'none', 0);
    for (let r = 0; r < 4; r++) { const y = 86 + r * 14; s += line(20 - r * 3, y, 236 + r * 3, y, C.soilD, 4, 'opacity=".8"'); if (cond === 'repaired') for (let i = 0; i < 9; i++) { const x = 34 + i * 24 + (r % 2) * 8 - r * 2; s += `<g><path d="M${x} ${y - 1} q-5 -12 -10 -14 M${x} ${y - 1} q5 -14 10 -15 M${x} ${y - 1} v-18" stroke="${C.grass}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M${x} ${y - 1} q-5 -12 -10 -14 M${x} ${y - 1} q5 -14 10 -15 M${x} ${y - 1} v-18" stroke="rgba(30,50,15,.8)" stroke-width="1.5" fill="none" stroke-linecap="round"/></g>`; }
      else if (cond === 'damaged') for (let i = 0; i < 4; i++) { const x = 40 + rnd() * 180; s += `<path d="M${f(x)} ${y} q-3 -8 -7 -9 M${f(x)} ${y} q4 -9 8 -9" stroke="#8a8a45" stroke-width="3" fill="none" stroke-linecap="round"/>`; } }
    s += rect(14, 130, 232, 10, C.woodD, C.ink, 3, 2) + rect(14, 62, 232, 8, C.woodD, C.ink, 3, 2) + rect(14, 62, 8, 78, C.wood, C.ink, 3, 2) + rect(238, 62, 8, 78, C.wood, C.ink, 3, 2);
    if (cond !== 'repaired') s += rubble(rnd, 128, 116, 100, cond === 'ruined' ? 8 : 3, [C.stoneD, C.soilD, C.stone]) + (cond === 'ruined' ? Array.from({ length: 6 }, () => crack(rnd, 30 + rnd() * 190, 76 + rnd() * 30, 22)).join('') + rect(60, 126, 60, 10, C.woodD, C.ink, 2, 1, 'transform="rotate(-12 90 130)"') : '');
    return { w: 256, h: 160, svg: s }; },
  gate: (cond, rnd) => { let s = shadow(128, 236, 90, 12);
    if (cond === 'ruined') return { w: 256, h: 256, svg: s + line(52, 238, 62, 110, C.woodD, 14) + line(204, 238, 194, 150, C.woodD, 14) + rect(70, 196, 64, 14, C.wood, C.ink, 3, 2, 'transform="rotate(-8 100 200)"') + rect(120, 222, 80, 12, C.woodL, C.ink, 3, 2, 'transform="rotate(6 160 228)"') + rubble(rnd, 128, 238, 80, 8) };
    s += `<g ${cond === 'damaged' ? 'transform="rotate(-1.2 128 238)"' : ''}>` + rect(40, 70, 26, 170, C.woodD, C.ink, 3, 3) + rect(190, 70, 26, 170, C.woodD, C.ink, 3, 3) + poly([[40, 70], [66, 70], [53, 48]], C.wood, C.ink, 3) + poly([[190, 70], [216, 70], [203, 48]], C.wood, C.ink, 3) + rect(36, 80, 184, 12, C.woodL, C.ink, 3, 2);
    const door = (x, broken) => `<g ${broken ? `transform="rotate(7 ${x + 54} 100)"` : ''}>` + rect(x, 100, 58, 134, C.wood, C.ink, 3, 2) + planks(x, 100, 58, 134, 4) + rect(x, 120, 58, 9, C.metalD, C.ink, 2, 1) + rect(x, 196, 58, 9, C.metalD, C.ink, 2, 1) + (broken ? rect(x + 8, 150, 20, 60, '#1d1914', 'none', 0, 1) : '') + '</g>';
    s += door(68, false) + door(130, cond === 'damaged') + `<circle cx="124" cy="170" r="4" fill="${C.yellow}"/><circle cx="132" cy="170" r="4" fill="${C.yellow}"/>` + (cond === 'damaged' ? crack(rnd, 90, 104, 40) : '');
    return { w: 256, h: 256, svg: s + '</g>' }; },
  wall: (cond, rnd) => { let s = shadow(64, 150, 44, 8);
    const stake = (x, h, broken) => poly([[x - 11, 156], [x - 11, 156 - h], [x, 156 - h - 18], [x + 11, 156 - h], [x + 11, 156]], broken ? C.woodD : C.wood, C.ink, 3) + line(x - 4, 150, x - 4, 156 - h + 4, 'rgba(255,236,200,.22)', 3) + line(x + 4, 150, x + 4, 156 - h, 'rgba(0,0,0,.25)', 2);
    if (cond === 'ruined') return { w: 128, h: 160, svg: s + [26, 64, 102].map((x, i) => poly([[x - 11, 156], [x - 11, 118 - i * 8], [x - 2, 108 - i * 10], [x + 4, 120 - i * 6], [x + 11, 112], [x + 11, 156]], C.woodD, C.ink, 3)).join('') + soot(10, 100, 108, 56) + rubble(rnd, 64, 152, 52, 4) };
    const hs = cond === 'repaired' ? [92, 96, 92] : [92, 60, 84];
    s += [26, 64, 102].map((x, i) => stake(x, hs[i], cond === 'damaged' && i === 1)).join('') + rect(8, 96, 112, 10, C.woodD, C.ink, 3, 2) + rect(8, 126, 112, 10, C.woodD, C.ink, 3, 2);
    if (cond === 'damaged') s += crack(rnd, 100, 80, 40) + soot(8, 90, 112, 66);
    return { w: 128, h: 160, svg: s }; },
};

const wrap = ({ w, h, svg }) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>
  <filter id="blur" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="paint" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="9" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 0.1  0 0 0 0 0.08  0 0 0 0 0.05  0 0 0 0.5 -0.12" result="gr"/><feComposite in="gr" in2="d" operator="in" result="grc"/><feMerge><feMergeNode in="d"/><feMergeNode in="grc"/></feMerge></filter></defs>
  <g filter="url(#paint)">${svg}</g></svg>`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(); const page = await browser.newPage({ deviceScaleFactor: 1 });
const sizes = {}; const sheet = [];
for (const [name, draw] of Object.entries(DRAW)) for (const cond of CONDS) {
  const art = draw(cond, rngFor(`${name}_${cond}`)); const key = `${name}_${cond}`;
  await page.setContent(`<body style="margin:0;background:transparent">${wrap(art)}</body>`);
  const raw = await page.locator('svg').screenshot({ omitBackground: true });
  // crop the empty margins (feet stay on the bottom edge), so a sprite scales by what is actually drawn
  const box = await page.evaluate(async (b64) => { const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; let x1 = c.width; let y1 = c.height; let x2 = 0; let y2 = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 24) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
    return { x: Math.max(0, x1 - 2), y: Math.max(0, y1 - 2), width: Math.min(c.width, x2 + 3) - Math.max(0, x1 - 2), height: Math.min(c.height, y2 + 3) - Math.max(0, y1 - 2) }; }, raw.toString('base64'));
  await page.screenshot({ path: `${OUT}${key}.png`, omitBackground: true, clip: box });
  sizes[key] = { w: box.width, h: box.height }; sheet.push({ key, ...art, w: box.width, h: box.height });
}
writeFileSync(`${OUT}sizes.json`, `${JSON.stringify(sizes, null, 1)}\n`);
if (process.argv[2]) { // contact sheet for eyeballing
  const cell = 400; const cols = 6; const rows = Math.ceil(sheet.length / cols);
  const html = `<body style="margin:0;background:#4b5a3a"><div style="display:grid;grid-template-columns:repeat(${cols},${cell}px)">${sheet.map((s) => `<div style="height:${cell}px;display:flex;align-items:flex-end;justify-content:center;border:1px solid #0003;position:relative"><img src="data:image/png;base64,${readFileSync(`${OUT}${s.key}.png`).toString('base64')}" style="max-width:${cell - 20}px;max-height:${cell - 30}px"><span style="position:absolute;left:6px;top:4px;color:#fff;font:12px sans-serif">${s.key}</span></div>`).join('')}</div></body>`;
  await page.setViewportSize({ width: cell * cols, height: cell * rows }); await page.setContent(html); await page.waitForTimeout(500);
  await page.screenshot({ path: process.argv[2] });
}
await browser.close();
console.log(`${sheet.length} sprites written to ${OUT}`);
