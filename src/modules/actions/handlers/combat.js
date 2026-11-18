import { chebyshev } from '../../../kernel/index.js';
import { ok, fail, RUNNING, DONE, failTick, walkStep } from './shared.js';
import { awardSkillXp, carriedOf, removeCarried } from '../../survivors/index.js';

const nearestZombie = (state, from) => {
  const zs = Object.values(state.threats?.zombies ?? {}).sort((a, b) => a.id < b.id ? -1 : 1);
  return zs.reduce((best, z) => {
    if (z.health <= 0) return best;
    if (!best) return z;
    return chebyshev(from, z) < chebyshev(from, best) ? z : best;
  }, null);
};

export const combatHandler = {
  validate(ctx, a) {
    if (!ctx.state.threats?.wave) return fail('NO_WAVE');
    const z = ctx.state.threats.zombies[a.params.targetId];
    if (!z || z.health <= 0) return fail('NO_TARGET');
    return ok;
  },
  reservations: () => [],
  tick(ctx, a) {
    const s = ctx.state.survivors[a.actorId];
    const z = ctx.state.threats.zombies[a.params.targetId];
    if (!z || z.health <= 0) return DONE;

    const weaponId = s.equipment.weapon ?? 'spear';
    const weapon = ctx.defs.weapons[weaponId];
    if (!weapon) return failTick('NO_WEAPON');
    const range = weapon.kind === 'melee' ? weapon.reach : weapon.range;

    if (weapon.ammo && carriedOf(s, weapon.ammo) <= 0) return failTick('NO_AMMO');

    if (chebyshev(s.position, z) > range) {
      a.phase = 'travel';
      a.travelTicks = (a.travelTicks ?? 0) + 1;
      if (a.travelTicks % ctx.defs.actions.attack.ticksPerTile === 0 &&
          !walkStep(ctx, a, z)) return failTick('NO_PATH');
      a.travelTicks += 1;
      return RUNNING;
    }

    a.phase = 'attack';
    a.progress += 1;
    if (a.progress < (a.shotAt ?? 0) + weapon.reload) return RUNNING;
    a.shotAt = a.progress;

    if (weapon.ammo) {
      const ammo = carriedOf(s, weapon.ammo);
      if (ammo <= 0) return failTick('NO_AMMO');
      removeCarried(s, weapon.ammo, 1);
    }

    const reduction = Math.max(0, (ctx.defs.zombies[z.type].armor ?? 0) - weapon.pierce);
    const damage = Math.max(0, weapon.damage - reduction);
    z.health = Math.max(0, z.health - damage);
    z.state = 'hurt';
    ctx.emit('zombie.hurt', { zombieId: z.id, survivorId: s.id, weapon: weaponId, damage, health: z.health });
    awardSkillXp(ctx, s, 'combat', 1);
    if (z.health <= 0) {
      z.state = 'dead';
      ctx.emit('zombie.killed', { zombieId: z.id, survivorId: s.id, weapon: weaponId, type: z.type });
      delete ctx.state.threats.zombies[z.id];

      const remaining = Object.keys(ctx.state.threats.zombies).length;
      if (ctx.state.threats.wave.queue.length === 0 && remaining === 0) {
        ctx.state.threats.wave.cleared = true;
        ctx.emit('wave.cleared', { day: ctx.state.threats.wave.day });
      }
      return DONE;
    }
    return RUNNING;
  },
};

export const guardHandler = {
  validate(ctx, a) {
    if (!ctx.state.threats?.wave) return fail('NO_WAVE');
    if (a.params.targetId) {
      const p = ctx.state.buildings[a.params.targetId] ?? ctx.state.survivors[a.params.targetId];
      if (!p) return fail('UNKNOWN_TARGET');
    }
    return ok;
  },
  reservations: () => [],
  tick(ctx, a) {
    const s = ctx.state.survivors[a.actorId];
    const wave = ctx.state.threats.wave;
    if (!wave) return DONE;

    if (a.params.targetId) {
      const target = ctx.state.buildings[a.params.targetId] ?? ctx.state.survivors[a.params.targetId];
      const dest = target.position ?? { x: target.x, y: target.y };
      if (chebyshev(s.position, dest) > 1) {
        a.phase = 'travel';
        a.travelTicks = (a.travelTicks ?? 0) + 1;
        if (a.travelTicks % ctx.defs.actions.guard.ticksPerTile === 0 && !walkStep(ctx, a, dest)) return failTick('NO_PATH');
        a.travelTicks += 1;
        return RUNNING;
      }
    }

    a.phase = 'guard';
    const z = nearestZombie(ctx.state, s.position);
    if (!z) return RUNNING;

    const weaponId = s.equipment.weapon ?? 'spear';
    const weapon = ctx.defs.weapons[weaponId];
    if (!weapon) return RUNNING;
    const range = weapon.kind === 'melee' ? weapon.reach : weapon.range;
    if (chebyshev(s.position, z) > range) return RUNNING;

    a.guardProgress = (a.guardProgress ?? 0) + 1;
    if (a.guardProgress % weapon.reload !== 0) return RUNNING;
    if (weapon.ammo) {
      if (carriedOf(s, weapon.ammo) <= 0) return RUNNING;
      removeCarried(s, weapon.ammo, 1);
    }
    const reduction = Math.max(0, (ctx.defs.zombies[z.type].armor ?? 0) - weapon.pierce);
    const damage = Math.max(0, weapon.damage - reduction);
    z.health = Math.max(0, z.health - damage);
    z.state = z.health > 0 ? 'hurt' : 'dead';
    ctx.emit('zombie.hurt', { zombieId: z.id, survivorId: s.id, weapon: weaponId, damage, health: z.health });
    awardSkillXp(ctx, s, 'combat', 1);
    if (z.health <= 0) {
      ctx.emit('zombie.killed', { zombieId: z.id, survivorId: s.id, weapon: weaponId, type: z.type });
      delete ctx.state.threats.zombies[z.id];
      if (ctx.state.threats.wave.queue.length === 0 && Object.keys(ctx.state.threats.zombies).length === 0) {
        ctx.state.threats.wave.cleared = true;
        ctx.emit('wave.cleared', { day: ctx.state.threats.wave.day });
      }
    }
    return RUNNING;
  },
};
