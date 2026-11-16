import { AftermathError, deepFreeze } from '../../kernel/index.js';
import { items, carry } from './data/items.js';
import { actions, needs, clock, policies, hooks } from './data/actions.js';
import { survivorTemplates, SKILLS, TRAITS, progression } from './data/survivors.js';
import { nodeTypes, buildings, scenarios } from './data/world.js';
import { lessons } from './data/lessons.js';
import { environment } from './data/environment.js';

const KNOWN_HANDLERS = ['move', 'gather', 'deposit', 'rest', 'consume', 'repair', 'upgrade'];

const onRectEdge = ({ x1, y1, x2, y2 }, x, y) => x >= x1 && x <= x2 && y >= y1 && y <= y2 && (x === x1 || x === x2 || y === y1 || y === y2);
const isTile = (s, x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < s.map.width && y < s.map.height;

/** Geometry rules a scenario must satisfy (so a bad layout fails at load time, not as a rendering glitch). */
function validateWorldLayout(id, s, d, need) {
  const where = (e) => `${e.id} (${e.x},${e.y})`;
  const fences = s.buildings.filter((b) => b.bounds);
  for (const f of fences) {
    const { x1, y1, x2, y2 } = f.bounds;
    need(isTile(s, x1, y1) && isTile(s, x2, y2) && x1 < x2 && y1 < y2, `scenario ${id}: ${f.id} bounds must be a rectangle inside the map`);
  }
  const taken = new Map();
  for (const e of [...s.buildings.filter((b) => !b.bounds), ...s.nodes]) {
    need(isTile(s, e.x, e.y), `scenario ${id}: ${where(e)} is outside the ${s.map.width}x${s.map.height} map`);
    const key = `${e.x},${e.y}`;
    need(!taken.has(key), `scenario ${id}: ${where(e)} shares a tile with ${taken.get(key)}`);
    taken.set(key, e.id);
  }
  for (const b of s.buildings.filter((q) => !q.bounds)) {
    const onFence = fences.some((f) => onRectEdge(f.bounds, b.x, b.y));
    const wantsFence = Boolean(d.buildings[b.type]?.perimeter);
    need(wantsFence === onFence, wantsFence ? `scenario ${id}: ${where(b)} is a ${b.type} and must sit on the fence line` : `scenario ${id}: ${where(b)} must not sit on the fence line (only perimeter buildings such as the gate may)`);
  }
  for (const sv of s.survivors) need(isTile(s, sv.x, sv.y), `scenario ${id}: survivor ${where(sv)} is outside the map`);
  const t = s.terrain ?? {};
  for (const z of t.zones ?? []) need(isTile(s, z.x1, z.y1) && isTile(s, z.x2, z.y2) && z.x1 <= z.x2 && z.y1 <= z.y2 && typeof z.label === 'string', `scenario ${id}: zone ${z.id} needs a label and a rectangle inside the map`);
  for (const p of t.paths ?? []) need(p.cells?.length > 0 && p.cells.every(([x, y]) => isTile(s, x, y)), `scenario ${id}: path ${p.id} needs cells inside the map`);
}

export function validateDefinitions(d) {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };

  for (const [id, it] of Object.entries(d.items)) need(it.unitWeight > 0, `item ${id}: unitWeight must be > 0`);
  for (const [id, n] of Object.entries(d.nodeTypes)) {
    need(d.items[n.yields], `nodeType ${id}: unknown item "${n.yields}"`);
    need(n.amount > 0, `nodeType ${id}: amount must be > 0`);
  }
  need(d.carry && d.carry.base > 0 && d.carry.perStrength >= 0, 'carry: base must be > 0 and perStrength >= 0');
  for (const [t, m] of Object.entries(d.carry?.traits ?? {})) need(d.traits[t] && m > 0, `carry: trait "${t}" is unknown or its multiplier is not > 0`);
  const c = d.clock;
  need(c && c.ticksPerSecond > 0, 'clock: ticksPerSecond must be > 0');
  need(Array.isArray(c?.speeds) && c.speeds.length > 0 && c.speeds.every((v) => v > 0), 'clock: speeds must be a non-empty list of positive numbers');
  need(c?.maxTicksPerFrame >= 1, 'clock: maxTicksPerFrame must be >= 1');
  need(c?.strategy?.max >= 1 && c.strategy.start >= 0 && c.strategy.start <= c.strategy.max && c.strategy.regenEvery >= 1, 'clock: strategy needs start <= max, max >= 1 and regenEvery >= 1');
  for (const [id, a] of Object.entries(d.actions)) {
    need(KNOWN_HANDLERS.includes(a.handler), `action ${id}: unknown handler "${a.handler}"`);
    if (a.item) need(d.items[a.item], `action ${id}: unknown item "${a.item}"`);
  }
  for (const [id, p] of Object.entries(d.policies ?? {})) {
    need(d.actions[p.action], `policy ${id}: unknown action \"${p.action}\"`);
    need(Object.values(d.survivorTemplates).every((t) => p.need in t.needs), `policy ${id}: unknown need \"${p.need}\"`);
    const range = (r) => r && Number.isInteger(r.min) && Number.isInteger(r.max) && r.min >= 1 && r.min <= r.default && r.default <= r.max && r.max <= d.needs.max;
    need(range(p.below), `policy ${id}: below needs integer min <= default <= max within 1..${d.needs.max}`);
    if (p.until) need(range(p.until) && p.until.default > p.below.default, `policy ${id}: until needs a valid range and a default above below's default`);
    need(Number.isInteger(p.retryEvery) && p.retryEvery >= 1, `policy ${id}: retryEvery must be >= 1`);
  }
  const hk = d.hooks ?? { events: {}, limits: {} };
  for (const [id, e] of Object.entries(hk.events)) need((e.on === 'condition' && typeof e.condition === 'string') || e.on === 'stopped', `hook ${id}: unknown trigger`);
  for (const k of ['perSurvivor', 'maxSourceChars', 'maxCommands', 'cooldownTicks']) need(Number.isInteger(hk.limits[k]) && hk.limits[k] >= 1, `hooks.limits.${k} must be a whole number >= 1`);
  for (const [id, b] of Object.entries(d.buildings)) {
    need(b.levels?.[1]?.maxHealth > 0, `building ${id}: level 1 needs maxHealth`);
    need(b.visual?.ruinedBelow < b.visual?.damagedBelow, `building ${id}: visual thresholds must be ruinedBelow < damagedBelow`);
    if (b.storage) {
      for (const [res, cap] of Object.entries(b.storage)) {
        need(d.items[res], `building ${id}: storage uses unknown item "${res}"`);
        need(cap > 0, `building ${id}: storage for ${res} must be > 0`);
      }
    }
    for (const res of Object.keys(b.repair?.cost ?? {})) need(d.items[res], `building ${id}: repair cost uses unknown item "${res}"`);
    if (b.note !== undefined) need(typeof b.note === 'string' && b.note, `building ${id}: note must be non-empty text`);
  }
  for (const [id, s] of Object.entries(d.scenarios)) {
    for (const b of s.buildings) need(d.buildings[b.type], `scenario ${id}: unknown building type "${b.type}"`);
    for (const n of s.nodes) need(d.nodeTypes[n.type], `scenario ${id}: unknown node type "${n.type}"`);
    for (const sv of s.survivors) need(d.survivorTemplates[sv.template], `scenario ${id}: unknown template "${sv.template}"`);
    for (const k of Object.keys(s.stock)) need(d.items[k], `scenario ${id}: stock uses unknown item "${k}"`);
    validateWorldLayout(id, s, d, need);
  }
  for (const [skillId, skill] of Object.entries(d.skills)) {
    need(typeof skill.name === 'string' && skill.name, `skill ${skillId}: name must be non-empty text`);
    need(typeof skill.description === 'string', `skill ${skillId}: description must be text`);
  }
  const en = d.environment;
  need(en && Number.isInteger(en.ticksPerDay) && en.ticksPerDay >= 24 && en.ticksPerDay % 24 === 0, 'environment: ticksPerDay must be a multiple of 24');
  need(en && en.dawnHour >= 0 && en.duskHour <= 24 && en.dawnHour < en.duskHour && en.startHour >= 0 && en.startHour < 24, 'environment: dawnHour < duskHour within 0..24 and startHour within 0..23');
  for (const s of en?.seasons ?? []) {
    need(s.days >= 1 && (s.phases ?? []).reduce((n, p) => n + p.days, 0) === s.days, `environment season ${s.id}: phase lengths must add up to ${s.days} days`);
    for (const p of s.phases ?? []) need(en.weather[p.weather] && p.days >= 1, `environment season ${s.id}: unknown weather "${p.weather}" or empty phase`);
  }
  need((en?.seasons ?? []).length > 0, 'environment: needs at least one season');
  const pr = d.progression;
  need(pr && Array.isArray(pr.thresholds) && pr.thresholds[0] === 0 && pr.thresholds.every((t, i) => i === 0 || t > pr.thresholds[i - 1]), 'progression: thresholds must start at 0 and strictly increase');
  need(pr && pr.floor >= 0 && pr.floor <= 1, 'progression: floor must be between 0 and 1');
  for (const [id, aw] of Object.entries(pr?.awards ?? {})) {
    need(d.skills[aw.skill], `progression award ${id}: unknown skill "${aw.skill}"`);
    need(aw.xp > 0 && aw.fullUntil >= 0 && aw.teachesUpTo > aw.fullUntil, `progression award ${id}: needs xp > 0 and teachesUpTo > fullUntil >= 0`);
  }
  for (const [traitId, trait] of Object.entries(d.traits)) {
    need(typeof trait.name === 'string' && trait.name, `trait ${traitId}: name must be non-empty text`);
    need(typeof trait.description === 'string', `trait ${traitId}: description must be text`);
  }
  for (const [id, s] of Object.entries(d.survivorTemplates)) {
    for (const skillId of Object.keys(s.skills ?? {})) need(d.skills[skillId], `survivor template ${id}: unknown skill \"${skillId}\"`);
    for (const traitId of s.traits ?? []) need(d.traits[traitId], `survivor template ${id}: unknown trait \"${traitId}\"`);
  }
  for (const [id, l] of Object.entries(d.lessons)) {
    need(d.scenarios[l.scenario], `lesson ${id}: unknown scenario "${l.scenario}"`);
    need(Array.isArray(l.goals) && l.goals.length > 0, `lesson ${id}: needs goals`);
    for (const g of l.goals ?? []) need(typeof g.check === 'string', `lesson ${id}: goal ${g.id} missing check`);
  }
  if (errors.length) throw new AftermathError('INVALID_DEFINITIONS', `Invalid definitions:\n- ${errors.join('\n- ')}`, { errors });
}

/** Build the validated, deeply-frozen definition set. `overrides` replaces whole top-level tables. */
export function createDefinitions(overrides = {}) {
  const defs = structuredClone({ items, carry, actions, needs, clock, policies, hooks, survivorTemplates, progression, environment, nodeTypes, buildings, scenarios, lessons, skills: SKILLS, traits: TRAITS, ...overrides });
  validateDefinitions(defs);
  return deepFreeze(defs);
}
