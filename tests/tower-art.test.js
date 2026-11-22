// Tower pictures (levels 1-5) and the aiming mounts: the seat / aim maths in assets/towerart.js, the picture cache in assets/buildingart.js, and the aim the projection hands the renderer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBuildingArt, TOWER_ART_LEVELS, TOWER_SEATS, TOWER_PX_PER_CELL, MOUNT_ART, MAX_ELEVATION, FLIP_MS, mountSeats, aimAt, stepAim, restingAim, drawMount, towerArtKey } from '../src/modules/assets/index.js';
import { weapons, towers } from '../src/modules/definitions/data/arsenal.js';
import { defs, newSim } from './helpers.js';

const fakeLoader = (urls, { ready = true, fail = [] } = {}) => (url) => { const i = { url, complete: ready, naturalWidth: ready ? 280 : 0, naturalHeight: ready ? 450 : 0 }; urls.push(i); if (fail.some((f) => url.includes(f))) { i.complete = false; i.naturalWidth = 0; } return i; };

test('data: five tower pictures, a seat on every level that can mount something, and a picture + geometry for every mounted weapon', () => {
  assert.deepEqual([...TOWER_ART_LEVELS], Object.keys(towers).map(Number), 'one picture per tower level');
  assert.equal(TOWER_SEATS[1], undefined, 'a lookout has no mount seat');
  for (const lv of Object.keys(towers).map(Number).filter((l) => towers[l].mounts.length)) assert.ok(TOWER_SEATS[lv]?.w > 0, `level ${lv} has a seat`);
  for (const [id, w] of Object.entries(weapons).filter(([, w]) => w.kind === 'mounted')) {
    const a = MOUNT_ART[id]; assert.ok(a, `${id} has mount art`);
    assert.ok(a.cut > a.pivot.y && a.cut < a.h, `${id}: the head/base cut lies between the pivot and the bottom of the picture`);
    assert.ok(a.muzzles.length === (w.shots ?? 1), `${id}: one muzzle per projectile of a trigger pull`);
  }
});

test('mountSeats: none on level 1, one centred seat for one mount, side-by-side smaller seats for several', () => {
  assert.deepEqual(mountSeats(1, 1), []); assert.deepEqual(mountSeats(5, 0), []);
  const one = mountSeats(3, 1); assert.equal(one.length, 1); assert.equal(one[0].x, TOWER_SEATS[3].x);
  const three = mountSeats(5, 3); assert.equal(three.length, 3);
  assert.ok(three[0].x < three[1].x && three[1].x < three[2].x, 'left to right');
  assert.ok(three[0].w < mountSeats(5, 1)[0].w, 'a crowded roof draws smaller mounts');
  assert.equal(mountSeats(9, 1)[0].x, TOWER_SEATS[5].x, 'a level beyond the art uses the top picture');
  assert.equal(towerArtKey(9), 'tower_level_5'); assert.equal(towerArtKey(0), 'tower_level_1');
});

test('aimAt: faces the side of the target and tilts toward it (down the screen = positive), clamped', () => {
  const from = { x: 100, y: 100 };
  assert.deepEqual(aimAt(from, { x: 200, y: 100 }), { facing: 1, angle: 0 });
  const down = aimAt(from, { x: 200, y: 200 }); assert.equal(down.facing, 1); assert.ok(Math.abs(down.angle - Math.PI / 4) < 1e-9);
  assert.ok(aimAt(from, { x: 200, y: 0 }).angle < 0, 'a target above: the barrel goes up');
  const left = aimAt(from, { x: 0, y: 150 }); assert.equal(left.facing, -1); assert.ok(left.angle > 0, 'tilt is measured from the facing direction');
  assert.equal(aimAt(from, { x: 101, y: 900 }).angle, MAX_ELEVATION, 'straight below: clamped');
  assert.equal(aimAt(from, { x: 100, y: 150 }, -1).facing, -1, 'directly above / below keeps the side it was facing');
});

test('stepAim: turns at a bounded speed, never overshoots, takes FLIP_MS to turn round, and levels off when there is no target', () => {
  let s = restingAim(); assert.deepEqual(s, { facing: 1, angle: 0 });
  s = stepAim(s, { facing: 1, angle: 1 }, 16); assert.ok(s.angle > 0 && s.angle < 0.2, 'a frame moves it a little');
  for (let i = 0; i < 200; i++) s = stepAim(s, { facing: 1, angle: 0.5 }, 16); assert.equal(s.angle, 0.5, 'arrives exactly');
  let t = { facing: 1, angle: 0 }; let ms = 0; while (t.facing > -1 && ms < 2000) { t = stepAim(t, { facing: -1, angle: 0 }, 10); ms += 10; }
  assert.ok(ms >= FLIP_MS - 10 && ms <= FLIP_MS + 10, `turning round takes about ${FLIP_MS} ms (${ms})`);
  let idle = { facing: -1, angle: 0.8 }; for (let i = 0; i < 200; i++) idle = stepAim(idle, null, 16);
  assert.deepEqual(idle, { facing: -1, angle: 0 }, 'no target: level, keeping the side it last faced');
  assert.deepEqual(stepAim({ facing: 1, angle: 0 }, { facing: 1, angle: 1 }, 100000), { facing: 1, angle: stepAim({ facing: 1, angle: 0 }, { facing: 1, angle: 1 }, 250).angle }, 'a long pause is capped at one step of 250 ms');
});

test('drawMount: draws the base once and the head once (clipped above the cut), returns one muzzle per barrel', () => {
  const calls = []; const ctx = { drawImage: (...a) => calls.push(['img', ...a]), save: () => calls.push(['save']), restore: () => calls.push(['restore']), translate: () => {}, rotate: (r) => calls.push(['rotate', r]), scale: (x) => calls.push(['scale', x]) };
  const art = MOUNT_ART.dual_minigun; const m = drawMount(ctx, {}, art, { x: 500, y: 300 }, 0.5, { facing: 1, angle: 0.3 });
  const imgs = calls.filter((c) => c[0] === 'img'); assert.equal(imgs.length, 2);
  assert.equal(imgs[0][3], art.cut, 'the base starts at the cut'); assert.equal(imgs[1][3], 0, 'the head starts at the top'); assert.ok(imgs[1][5] > art.cut, 'the head overlaps the cut a little, so no seam shows');
  assert.equal(m.length, 2); assert.ok(m.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.ok(calls.some((c) => c[0] === 'rotate' && c[1] === 0.3));
  calls.length = 0; drawMount(ctx, {}, art, { x: 0, y: 0 }, 1, { facing: -1, angle: 0.3 });
  assert.ok(calls.some((c) => c[0] === 'rotate' && c[1] === -0.3) && calls.some((c) => c[0] === 'scale' && c[1] === -1), 'facing left: mirrored, and the tilt mirrors with it');
});

test('picture cache: preloadTowers asks for 5 towers + 4 mounts; getTower answers null while loading and for a ruin; a missing level falls back to a lower one', () => {
  const imgs = []; const art = createBuildingArt({ loadImage: fakeLoader(imgs, { ready: false }) });
  art.preloadTowers();
  assert.deepEqual(imgs.map((i) => i.url).sort(), [...[1, 2, 3, 4, 5].map((n) => `assets/sprites/buildings/tower_level_${n}.png`), ...Object.values(MOUNT_ART).map((m) => `assets/sprites/buildings/${m.file}.png`)].sort());
  assert.equal(art.getTower(3, 'repaired'), null, 'still loading'); assert.equal(art.towerState(3), 'loading'); assert.equal(art.getMount('minigun'), null);
  for (const i of imgs) { i.complete = true; i.naturalWidth = 280; i.naturalHeight = 450; }
  const t = art.getTower(3, 'repaired'); assert.equal(t.level, 3); assert.equal(t.alpha, 1); assert.ok(Math.abs(t.w - 280 / TOWER_PX_PER_CELL) < 1e-9); assert.equal(t.srcW, 280); assert.equal(t.srcH, 450);
  assert.equal(art.getTower(3, 'ruined'), null, 'a ruin keeps its own ruin picture');
  assert.equal(art.getTower(3, 'damaged').level, 3, 'a damaged tower still uses its level picture (darkened where a canvas exists)');
  assert.equal(art.getMount('minigun').art, MOUNT_ART.minigun); assert.equal(art.getMount('bow'), null, 'not a mounted weapon');
  const imgs2 = []; const failing = createBuildingArt({ loadImage: fakeLoader(imgs2, { fail: ['tower_level_4', 'tower_level_5'] }) });
  failing.getTower(5, 'repaired'); failing.getTower(4, 'repaired'); for (const i of imgs2) i.onerror?.();
  assert.equal(failing.getTower(5, 'repaired').level, 3, 'levels 5 and 4 are missing, so level 3 is used'); assert.equal(failing.towerState(5), 'ready');
});

test('the render projection hands the renderer each mount\'s weapon, status and aim (the nearest zombie in its range, else null)', () => {
  const mk = (zombieAt) => newSim('stage1', 1, (st) => {
    const b = st.buildings.tower_1; b.level = 4; b.condition = 'repaired'; b.health = defs.buildings.tower.levels[4].maxHealth;
    b.mounts = [{ weapon: 'minigun', hopper: 10, cooldown: 0, status: 'IDLE', powered: false }, { weapon: 'ballista', hopper: 5, cooldown: 0, status: 'IDLE', powered: false }];
    st.threats.wave = { day: 6, strength: 2, defense: 0, composition: { walker: 1 }, queue: [], spawned: 1, startTick: 0, gateClosed: true, breached: false, wallDamage: 0 };
    if (zombieAt) st.threats.zombies.zombie_1 = { id: 'zombie_1', type: 'walker', x: zombieAt[0], y: zombieAt[1], direction: 'LEFT', state: 'walk', health: 20, move: 0, hit: 0, goal: null, route: null, reached: null };
  });
  const tower = (sim) => sim.renderProjection().buildings.find((b) => b.id === 'tower_1');
  assert.deepEqual(tower(mk(null)).mounts.map((m) => [m.weapon, m.aim]), [['minigun', null], ['ballista', null]]);
  const t = mk([20, 4]); const b = t.snapshot().buildings.tower_1;
  const aimed = tower(t).mounts; assert.deepEqual(aimed[0].aim, { x: 20, y: 4 }); assert.deepEqual(aimed[1].aim, { x: 20, y: 4 }, 'the same zombie is in range of both');
  const far = tower(mk([39, 15])).mounts; assert.equal(far[0].aim, null, 'out of range: not aimed');
  assert.equal(b.type, 'tower');
  assert.equal(newSim().renderProjection().buildings.find((q) => q.type === 'hq').mounts, undefined, 'only towers carry mounts');
});
