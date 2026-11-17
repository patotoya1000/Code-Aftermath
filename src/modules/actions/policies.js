import { AftermathError, hasOwn } from '../../kernel/index.js';
import { pickConsumable } from './handlers/consume.js';
import { Status, FailureReason, isTerminal } from './lifecycle.js';

/**
 * Needs policies (R4a). A policy is a standing rule on a survivor: "when <need> drops below X, do <action>".
 *
 *   survivor.policy("eat", { below: 30 })            survivor.policy("rest", { below: 25, until: 70 })
 *
 * When a policy fires (checked once per tick, before the action queue advances):
 *   1. the survivor's current job is INTERRUPTED (cancelled with reason INTERRUPTED, everything it reserved is released);
 *   2. the policy's action (eat / drink / rest) is queued at the FRONT of the survivor's queue;
 *   3. an equivalent continuation of the interrupted job is queued right behind it (it emits `task.resumed` when it starts),
 *      so the survivor goes back to work by itself. Jobs queued after the interrupted one keep their order.
 * Nothing is hidden: the interrupted job, the policy action and the continuation are all ordinary actions with the
 * normal lifecycle, reservations and events, so replay, save/load and the soak invariants cover them for free.
 *
 * A policy that cannot run (no food, no water, ...) never interrupts anything: it emits `policy.blocked` once and waits
 * `retryEvery` ticks. A policy never interrupts an action of its own kind (a manual rest already cures tiredness).
 */

const isPolicyAction = (a) => typeof a.origin === 'string' && a.origin.startsWith('policy:');
const bad = (msg) => new AftermathError('INVALID_COMMAND', msg);

/** Validate learner-supplied policy options against the data table; returns the normalised rule. */
export function normalizePolicy(defs, params = {}) {
  const key = params.action;
  if (typeof key !== 'string' || !hasOwn(defs.policies, key)) throw bad(`policy(): unknown policy "${key}". Use one of: ${Object.keys(defs.policies).join(', ')}.`);
  const rule = defs.policies[key];
  const known = ['action', 'below', ...(rule.until ? ['until'] : []), ...(rule.prefer ? ['prefer'] : [])];
  for (const k of Object.keys(params)) if (!known.includes(k)) throw bad(`policy("${key}"): "${k}" is not an option here. Options: ${known.slice(1).join(', ')}.`);
  const below = params.below ?? rule.below.default;
  if (!Number.isInteger(below) || below < rule.below.min || below > rule.below.max) throw bad(`policy("${key}"): below must be a whole number from ${rule.below.min} to ${rule.below.max}.`);
  const out = { key, below };
  if (rule.until) {
    const until = params.until ?? Math.max(rule.until.default, below + 1);
    if (!Number.isInteger(until) || until < rule.until.min || until > rule.until.max) throw bad(`policy("${key}"): until must be a whole number from ${rule.until.min} to ${rule.until.max}.`);
    if (until <= below) throw bad(`policy("${key}"): until (${until}) must be higher than below (${below}), or the survivor would stop before the need is cured.`);
    out.until = until;
  }
  if (params.prefer !== undefined) {
    const items = defs.actions[rule.action].items;
    if (typeof params.prefer !== 'string' || !hasOwn(items, params.prefer)) throw bad(`policy("${key}"): prefer must be one of: ${Object.keys(items).join(', ')}.`);
    out.prefer = params.prefer;
  }
  return out;
}

export function setPolicy(ctx, actorId, params) {
  const { state, defs } = ctx;
  const s = state.survivors[actorId];
  const n = normalizePolicy(defs, params);
  const prev = s.policies[n.key];
  s.policies[n.key] = { below: n.below, ...(n.until !== undefined ? { until: n.until } : {}), ...(n.prefer !== undefined ? { prefer: n.prefer } : {}), cooldownUntil: 0, lastActionId: prev?.lastActionId ?? null, blocked: null };
  ctx.emit('policy.set', { actorId, policy: n.key, below: n.below, ...(n.until !== undefined ? { until: n.until } : {}), ...(n.prefer !== undefined ? { prefer: n.prefer } : {}) });
}

export function clearPolicy(ctx, actorId, params = {}) {
  const { state, defs } = ctx;
  const s = state.survivors[actorId];
  if (params.action === undefined) {
    for (const key of Object.keys(s.policies)) ctx.emit('policy.cleared', { actorId, policy: key });
    s.policies = {};
    return;
  }
  if (typeof params.action !== 'string' || !hasOwn(defs.policies, params.action)) throw bad(`clearPolicy(): unknown policy "${params.action}". Use one of: ${Object.keys(defs.policies).join(', ')}.`);
  if (hasOwn(s.policies, params.action)) { delete s.policies[params.action]; ctx.emit('policy.cleared', { actorId, policy: params.action }); }
}

/** The command that continues an interrupted job, or null when nothing is left to do. Never carries learner input twice. */
function continuationOf(a, defs) {
  const resumeOf = { actionId: a.actionId, gathered: (a.resumeOf?.gathered ?? 0) + (a.stats?.gathered ?? a.stats?.crafted ?? 0), workTotal: a.workTotal ?? 0 };
  const params = { ...a.params };
  if (a.actionType === 'gather' && params.total !== undefined) {
    params.total -= a.stats?.gathered ?? 0; // what is already in the base counts toward the learner's total
    if (params.total < 1) return null;
  }
  if (a.actionType === 'cook' && params.count !== undefined) {
    params.count -= a.stats?.crafted ?? 0; // batches already finished count toward the learner's count
    if (params.count < 1) return null;
  }
  if (a.actionType === 'farm' && params.count !== undefined) {
    params.count -= a.stats?.harvested ?? 0; // plots already harvested count toward the learner's count
    if (params.count < 1) return null;
  }
  if (a.actionType === 'rest') {
    params.ticks = (params.ticks ?? defs.actions.rest.defaultTicks) - a.progress;
    if (params.ticks < 1) return null;
  }
  return { command: { type: a.actionType, actorId: a.actorId, params }, resumeOf };
}

function block(ctx, s, key, p, reason) {
  p.cooldownUntil = ctx.state.tick + ctx.defs.policies[key].retryEvery;
  if (p.blocked !== reason) {
    p.blocked = reason;
    ctx.emit('policy.blocked', { actorId: s.id, policy: key, reason });
  }
}

function fire(ctx, engine, s, key, p) {
  const { state, defs } = ctx;
  const rule = defs.policies[key];
  const live = state.activeActions.map((id) => state.actions[id]).filter((a) => a.actorId === s.id && !isTerminal(a.status));

  if (live.some((a) => a.origin === `policy:${key}`)) return; // already being handled

  // Eating / drinking: is there anything to consume at all? `prefer` is soft - the preferred item if it is in stock, else the default order.
  const consumable = defs.actions[rule.action].items;
  let item;
  if (consumable) {
    item = p.prefer !== undefined && pickConsumable(ctx, defs.actions[rule.action], p.prefer) ? p.prefer : undefined;
    if (!item && !pickConsumable(ctx, defs.actions[rule.action])) return block(ctx, s, key, p, FailureReason.INSUFFICIENT_RESOURCE);
  }

  // The job in front of any policy actions is the one to interrupt (only if it is actually running).
  const headAt = live.findIndex((a) => !isPolicyAction(a));
  const current = headAt >= 0 ? live[headAt] : null;
  if (current?.actionType === rule.action) return; // the survivor's current job IS the cure (a manual rest already restores energy)
  let cont = null;
  let interruptedId = null;
  let anchor = null; // the action the new ones go in front of
  if (current && current.status !== Status.QUEUED) {
    cont = continuationOf(current, defs);
    interruptedId = current.actionId;
    engine.cancelAction(ctx, current, FailureReason.INTERRUPTED);
    anchor = live[headAt + 1] ?? null;
  } else {
    anchor = current;
  }

  const params = rule.action === 'rest' ? { ticks: defs.actions.rest.maxTicks, until: p.until } : item ? { item } : {};
  const actionId = engine.submit(ctx, { type: rule.action, actorId: s.id, params }, { origin: `policy:${key}`, beforeId: anchor?.actionId });
  if (cont) engine.submit(ctx, cont.command, { resumeOf: cont.resumeOf, beforeId: anchor?.actionId });
  p.lastActionId = actionId;
  p.blocked = null;
  ctx.emit('policy.triggered', { actorId: s.id, policy: key, need: rule.need, value: s.needs[rule.need], below: p.below, actionId, interrupted: interruptedId });
}

/** Called once per tick by the simulation, after needs decay and before the action queue advances. */
export function applyPolicies(ctx, engine) {
  const { state, defs } = ctx;
  for (const s of Object.values(state.survivors)) {
    if (s.status !== 'active') continue;
    for (const key of Object.keys(defs.policies)) {
      const p = s.policies[key];
      if (!p) continue;
      if (p.lastActionId) { // learn how the last policy action ended: a FAILED one blocks the policy for a while
        const prev = state.actions[p.lastActionId];
        if (prev && isTerminal(prev.status)) {
          p.lastActionId = null;
          if (prev.status === Status.FAILED) { block(ctx, s, key, p, prev.failureReason ?? 'FAILED'); continue; }
        }
      }
      if (state.tick < p.cooldownUntil) continue;
      if (!(s.needs[defs.policies[key].need] < p.below)) { p.blocked = null; continue; }
      fire(ctx, engine, s, key, p);
    }
  }
}
