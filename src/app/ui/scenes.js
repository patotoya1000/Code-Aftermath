// Static map art for the TOWN and FRONT screens: inline SVG strings, built from the learner view (so a train really appears at the station, a survivor
// really shows at the site she is away at). Placeholder flat art in the HUD palette, like the rest of the game's placeholder assets (PA-6 replaces it).
// Hotspots are `<g class="spot" data-spot="…">`; the page delegates clicks and keys on them. Pure: no DOM.
import { esc } from './panels.js';
import { spotStatus } from './screens.js';

const spot = (id, label, inner, { active, status } = {}) => `<g class="spot${active === id ? ' is-picked' : ''}" data-spot="${esc(id)}" tabindex="0" role="button" aria-label="${esc(label)}${status ? `: ${esc(status)}` : ''}">${inner}</g>`;
const pill = (x, y, text, cls = '') => { const w = Math.max(60, text.length * 8.4 + 18); return `<g class="sc-pill ${cls}"><rect x="${x - w / 2}" y="${y - 13}" width="${w}" height="24" rx="12"/><text x="${x}" y="${y + 4}" text-anchor="middle">${esc(text)}</text></g>`; };
const label = (x, y, text) => `<text class="sc-label" x="${x}" y="${y}" text-anchor="middle">${esc(text)}</text>`;

/** MAP 1 · TOWN. Viewbox 1000x400: skyline, recruit hall (store), train station + track, housing, and the wall on the east edge. */
export function townSceneSvg(view, { active } = {}) {
  const t = view?.town; const train = Boolean(t?.train?.present);
  const sky = Array.from({ length: 16 }, (_, i) => { const h = 50 + ((i * 37) % 90); const x = i * 62 - 10; return `<rect class="sc-far" x="${x}" y="${300 - h}" width="${40 + (i % 3) * 8}" height="${h}"/>${i % 2 ? `<rect class="sc-lit" x="${x + 8}" y="${300 - h + 12}" width="6" height="8"/>` : ''}`; }).join('');
  const hall = spot('hall', 'Recruit hall', `
    <rect class="sc-hit" x="95" y="150" width="260" height="170"/>
    <rect class="sc-wall-a" x="110" y="195" width="230" height="105"/>
    <polygon class="sc-roof" points="100,195 225,150 350,195"/>
    <rect class="sc-awning" x="110" y="215" width="230" height="26"/>
    ${Array.from({ length: 8 }, (_, i) => `<rect class="sc-awning-b" x="${110 + i * 29}" y="215" width="14.5" height="26"/>`).join('')}
    <rect class="sc-door" x="200" y="250" width="50" height="50"/><rect class="sc-window" x="128" y="255" width="46" height="34"/><rect class="sc-window" x="276" y="255" width="46" height="34"/>
    ${label(225, 138, 'RECRUIT HALL')}${pill(225, 342, spotStatus(view, 'hall'))}`, { active });
  const station = spot('station', 'Train station', `
    <rect class="sc-hit" x="395" y="170" width="350" height="190"/>
    <rect class="sc-wall-b" x="410" y="205" width="140" height="95"/><polygon class="sc-roof-b" points="400,205 480,172 560,205"/>
    <rect class="sc-window" x="425" y="228" width="30" height="26"/><rect class="sc-door" x="500" y="245" width="34" height="55"/>
    <rect class="sc-platform" x="400" y="300" width="340" height="14"/>
    <rect class="sc-rail" x="400" y="330" width="340" height="5"/>${Array.from({ length: 24 }, (_, i) => `<rect class="sc-tie" x="${404 + i * 14.3}" y="334" width="6" height="8"/>`).join('')}
    ${train ? `<rect class="sc-train-a" x="560" y="282" width="62" height="46" rx="6"/><rect class="sc-train-b" x="626" y="288" width="52" height="40" rx="4"/><rect class="sc-train-b" x="682" y="288" width="52" height="40" rx="4"/><circle class="sc-wheel" cx="580" cy="332" r="7"/><circle class="sc-wheel" cx="606" cy="332" r="7"/><rect class="sc-window" x="570" y="290" width="22" height="16"/>` : ''}
    ${label(570, 160, 'TRAIN STATION')}${pill(570, 372, spotStatus(view, 'station'), train ? 'is-hot' : '')}`, { active });
  const housing = spot('housing', 'Housing', `
    <rect class="sc-hit" x="770" y="190" width="150" height="150"/>
    ${[780, 835, 890].map((x, i) => `<rect class="sc-wall-c" x="${x}" y="${250 - (i === 1 ? 14 : 0)}" width="42" height="${50 + (i === 1 ? 14 : 0)}"/><polygon class="sc-roof-c" points="${x - 4},${250 - (i === 1 ? 14 : 0)} ${x + 21},${222 - (i === 1 ? 14 : 0)} ${x + 46},${250 - (i === 1 ? 14 : 0)}"/><rect class="sc-window" x="${x + 13}" y="${268 - (i === 1 ? 14 : 0)}" width="16" height="14"/>`).join('')}
    ${label(850, 200, 'HOUSING')}${pill(850, 342, spotStatus(view, 'housing'))}`, { active });
  return `<svg class="scene" viewBox="0 0 1000 400" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Map 1: the town">
    <defs><linearGradient id="sky-town" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1020"/><stop offset="1" stop-color="#26324a"/></linearGradient></defs>
    <rect width="1000" height="400" fill="url(#sky-town)"/>${sky}
    <rect class="sc-ground-town" x="0" y="300" width="1000" height="100"/><rect class="sc-street" x="0" y="318" width="1000" height="6"/>
    ${hall}${station}${housing}
    <g class="sc-wall" aria-hidden="true"><rect x="946" y="40" width="54" height="360"/>${Array.from({ length: 9 }, (_, i) => `<rect class="sc-crenel" x="946" y="${34 + i * 40}" width="14" height="12"/>`).join('')}<text x="973" y="230" text-anchor="middle" transform="rotate(90 973 230)">THE WALL · TO OUTPOST ▸</text></g>
  </svg>`;
}

const SITE_ART = {
  roadside_store: (x, y) => `<rect class="sc-wall-a" x="${x - 42}" y="${y - 34}" width="84" height="44"/><rect class="sc-awning" x="${x - 46}" y="${y - 40}" width="92" height="12"/><rect class="sc-door" x="${x - 8}" y="${y - 8}" width="16" height="18"/>`,
  old_farmhouse: (x, y) => `<rect class="sc-wall-c" x="${x - 40}" y="${y - 30}" width="80" height="40"/><polygon class="sc-roof-c" points="${x - 48},${y - 30} ${x},${y - 62} ${x + 48},${y - 30}"/><rect class="sc-door" x="${x - 8}" y="${y - 10}" width="16" height="20"/><rect class="sc-silo" x="${x + 52}" y="${y - 50}" width="22" height="60" rx="8"/>`,
  junkyard: (x, y) => `<rect class="sc-junk" x="${x - 46}" y="${y - 16}" width="46" height="26"/><rect class="sc-junk-b" x="${x - 12}" y="${y - 38}" width="40" height="26" transform="rotate(-8 ${x} ${y})"/><rect class="sc-junk" x="${x + 6}" y="${y - 12}" width="42" height="22"/><circle class="sc-wheel" cx="${x - 30}" cy="${y + 10}" r="8"/>`,
  army_depot: (x, y) => `<polygon class="sc-depot" points="${x - 56},${y + 10} ${x - 44},${y - 34} ${x + 44},${y - 34} ${x + 56},${y + 10}"/><rect class="sc-door" x="${x - 14}" y="${y - 16}" width="28" height="26"/><line class="sc-flagpole" x1="${x + 30}" y1="${y - 34}" x2="${x + 30}" y2="${y - 64}"/><polygon class="sc-flag" points="${x + 30},${y - 64} ${x + 52},${y - 57} ${x + 30},${y - 50}"/>`,
};
const genericSite = (x, y) => `<rect class="sc-wall-b" x="${x - 36}" y="${y - 30}" width="72" height="40"/>`;

/** MAP 3 · FRONT. The wall on the west edge, the road east, one hotspot per scavenge site (nearest first), the raid road at the far east. */
export function frontSceneSvg(view, { active } = {}) {
  const sv = view?.scavenge; const sites = sv?.sites ?? [];
  const away = new Map((sv?.away ?? []).map((a) => [a.siteId, a]));
  const raid = view?.threats?.wave?.active;
  const step = sites.length > 1 ? 560 / (sites.length - 1) : 0;
  const siteSvg = sites.map((s, i) => {
    const x = 150 + i * step; const y = 262 - (i % 2) * 8;
    const art = (SITE_ART[s.id] ?? genericSite)(x, y);
    const gone = away.get(s.id);
    const bar = `<rect class="sc-bar-bg" x="${x - 34}" y="${y + 34}" width="68" height="6" rx="3"/><rect class="sc-bar" x="${x - 34}" y="${y + 34}" width="${68 * Math.max(0, Math.min(100, s.recoveryPercent)) / 100}" height="6" rx="3"/>`;
    return spot(s.id, s.name, `<rect class="sc-hit" x="${x - 70}" y="${y - 84}" width="140" height="${gone ? 150 : 130}"/>${art}${label(x, y - 76 + (s.id === 'old_farmhouse' ? -4 : 0), s.name.toUpperCase())}${bar}${pill(x, y + 62, spotStatus(view, s.id), s.dangerToday >= 30 ? 'is-hot' : '')}${gone ? `<g class="sc-away"><circle cx="${x}" cy="${y - 100}" r="9"/><text x="${x}" y="${y - 96}" text-anchor="middle">▲</text><text x="${x + 16}" y="${y - 96}">${esc(gone.survivorId)} · ${gone.returnsInTicks}t</text></g>` : ''}`, { active });
  }).join('');
  const zombies = [0, 1, 2, 3, 4].map((i) => `<g transform="translate(${900 + (i % 3) * 26} ${268 + (i > 2 ? 34 : 0) - (i === 1 ? 14 : 0)})"><g class="sc-zombie${raid ? ' is-moving' : ''}"><circle cx="0" cy="-30" r="8"/><rect x="-8" y="-22" width="16" height="30" rx="4"/><rect x="8" y="-20" width="18" height="5" rx="2"/></g></g>`).join('');
  const raidSpot = spot('raid', 'Raid road', `<rect class="sc-hit" x="855" y="190" width="145" height="160"/>${zombies}${label(930, 205, 'RAID ROAD')}${pill(930, 342, spotStatus(view, 'raid'), raid ? 'is-alarm' : '')}`, { active });
  return `<svg class="scene" viewBox="0 0 1000 400" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Map 3: the front, beyond the wall">
    <defs><linearGradient id="sky-front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${raid ? '#2a0d12' : '#0d1a14'}"/><stop offset="1" stop-color="${raid ? '#4a1a1f' : '#233a2a'}"/></linearGradient></defs>
    <rect width="1000" height="400" fill="url(#sky-front)"/>
    ${[610, 680, 760, 820].map((x, i) => `<g class="sc-tree"><rect x="${x}" y="${150 + (i % 2) * 14}" width="8" height="40"/><circle cx="${x + 4}" cy="${140 + (i % 2) * 14}" r="26"/></g>`).join('')}
    <rect class="sc-ground-front" x="0" y="290" width="1000" height="110"/>
    <rect class="sc-road" x="40" y="298" width="960" height="40"/><line class="sc-roadline" x1="60" y1="318" x2="1000" y2="318"/>
    ${siteSvg}${raidSpot}
    <g class="sc-wall" aria-hidden="true"><rect x="0" y="0" width="40" height="290"/><rect x="0" y="342" width="40" height="58"/><rect class="sc-gate" x="0" y="290" width="40" height="52"/><text x="20" y="150" text-anchor="middle" transform="rotate(-90 20 150)">◂ THE WALL · TO OUTPOST</text></g>
  </svg>`;
}
