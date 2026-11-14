import { AftermathError, hasOwn } from '../../kernel/index.js';
import { reserve, commit, releaseOwner } from '../resources/index.js';
import { Status, FailureReason, canTransition, isTerminal } from './lifecycle.js';
import { createHandlers } from './handlers/index.js';
import { checkCapability } from '../capability/index.js';

/**
 * The action engine owns the queue and the lifecycle. It mutates the state it is handed (inside the
 * simulation tick) and never touches rendering. ctx = { state, defs, emit }.
 */
export function createActionEngine(defs) {
  const handlers = createHandlers();
  const handlerOf = (a) => handlers[defs.actions[a.actionType].handler];

  function transition(ctx, a, to, extra = {}) {
    if (!canTransition(a.status, to)) throw new AftermathError('ILLEGAL_TRANSITION', `${a.status} -> ${to}`);
    a.status = to;
    if (to === Status.EXECUTING) a.startedAtTick = ctx.state.tick;
    if (isTerminal(to)) {
      a.endedAtTick = ctx.state.tick;
      // Learner-readable "what happened last" (survivor.lastTask): why the survivor is idle now.
      const who = ctx.state.survivors[a.actorId];
      if (who) who.lastTask = { actionId: a.actionId, type: a.actionType, status: to, reason: extra.reason ?? a.stopReason ?? null, gathered: a.stats?.gathered ?? null, tick: ctx.state.tick, ...(extra.capabilityDetail ? { capabilityDetail: extra.capabilityDetail } : {}) };
    }
    ctx.emit(`action.${to.toLowerCase()}`, { actionId: a.actionId, actorId: a.actorId, actionType: a.actionType, targetId: a.targetId, ...extra });
    if (to === Status.EXECUTING && a.origin === 'resume') ctx.emit('task.resumed', { actionId: a.actionId, actorId: a.actorId, taskType: a.actionType, resumedFrom: a.resumeOf });
    if (isTerminal(to) && a.origin?.startsWith('policy:')) policyFinished(ctx, a, to, extra.reason ?? a.failureReason ?? null);
  }

  // A policy action ended. Only a real FAILURE silences the policy for a while (so a failing policy cannot thrash the
  // survivor's work); being replaced/stopped by the learner, or completing, never does.
  function policyFinished(ctx, a, to, reason) {
    const name = a.origin.slice('policy:'.length);
    const rule = ctx.state.survivors[a.actorId]?.policies?.[name];
    if (to === Status.FAILED && reason !== FailureReason.ACTOR_DOWNED) {
      if (rule) rule.retryAt = ctx.state.tick + ctx.defs.policies.rules.retryAfter;
      ctx.emit('policy.failed', { actorId: a.actorId, policy: name, reason, retryAt: rule?.retryAt ?? null });
    } else if (to === Status.COMPLETED) ctx.emit('policy.completed', { actorId: a.actorId, policy: name });
  }

  // FAILED / CANCELLED always release every reservation the action still holds.
  function terminate(ctx, a, to, reason, extra = {}) {
    releaseOwner(ctx.state, a.actionId);
    a.reservationIds = [];
    a.failureReason = reason;
    transition(ctx, a, to, { reason, ...extra, ...(a.stats ? { ...a.stats } : {}) });
  }

  /** Index in activeActions of the actor's first live action (FIFO head), or -1. */
  const headIndex = (state, actorId) => state.activeActions.findIndex((id) => state.actions[id].actorId === actorId);

  /**
   * opts (engine-internal; learner commands never set these):
   *   origin    'policy:<name>' | 'resume' — who created the action (system-made actions cost no strategy points)
   *   resumeOf  action id this action carries on
   *   place     'front' = before the actor's other live actions;  { after: actionId } = right behind that action
   */
  function submit(ctx, command, opts = {}) {
    if (!hasOwn(defs.actions, command.type)) throw new AftermathError('UNKNOWN_ACTION', `Unknown action type ${command.type}`);
    const { state } = ctx;
    state.counters.action += 1;
    const actionId = `act_${state.counters.action}`;
    state.actions[actionId] = {
      actionId, actorId: command.actorId, actionType: command.type, targetId: command.params?.targetId ?? null,
      params: { ...command.params }, requestedAtTick: state.tick, status: Status.QUEUED, failureReason: null,
      reservationIds: [], progress: 0, workTotal: 0, travelTicks: 0, phase: null, startedAtTick: null, endedAtTick: null,
<<<<<<< HEAD
=======
      ...(opts.origin ? { origin: opts.origin } : {}), ...(opts.resumeOf ? { resumeOf: opts.resumeOf } : {}),
>>>>>>> 29b1943 (docs: document real-time policies, save/load, and phase tracker)
    };
    if (opts.place === 'front') {
      const i = headIndex(state, command.actorId);
      state.activeActions.splice(i < 0 ? state.activeActions.length : i, 0, actionId);
    } else if (opts.place?.after) {
      state.activeActions.splice(state.activeActions.indexOf(opts.place.after) + 1, 0, actionId);
    } else state.activeActions.push(actionId);
    ctx.emit('action.queued', { actionId, actorId: command.actorId, actionType: command.type });
    return actionId;
  }

  const busy = (state, a) =>
    state.activeActions.some((id) => {
      const o = state.actions[id];
      return o !== a && o.actorId === a.actorId && (o.status === Status.VALIDATING || o.status === Status.RESERVED || o.status === Status.EXECUTING);
    });

  function advance(ctx, a) {
    const { state } = ctx;
    const actor = state.survivors[a.actorId];
    if (!actor) return terminate(ctx, a, Status.FAILED, FailureReason.UNKNOWN_ACTOR);
    if (actor.status !== 'active') return terminate(ctx, a, Status.FAILED, FailureReason.ACTOR_DOWNED);
    const h = handlerOf(a);

    if (a.status === Status.QUEUED) {
      if (busy(state, a)) return; // one active action per survivor; the rest wait in FIFO order
      transition(ctx, a, Status.VALIDATING);
    }
    if (a.status === Status.VALIDATING) {
      const v = h.validate({ ...ctx, defs }, a);
      if (!v.ok) return terminate(ctx, a, Status.FAILED, v.reason);
      // Capability check: attributes, skills, traits, equipment, needs must meet the action's requirements.
      // This runs BEFORE any resources are reserved, so a failed capability check spends nothing.
      const actor = state.survivors[a.actorId];
      const actionDef = defs.actions[a.actionType];
      const cap = checkCapability(actor, actionDef, defs, ctx);
      if (!cap.ok) {
        return terminate(ctx, a, Status.FAILED, FailureReason.CAPABILITY_INSUFFICIENT, { capabilityDetail: cap.detail });
      }
      a.durationModifier = cap.durationModifier;
      a.outputModifier = cap.outputModifier;
      try {
        for (const r of h.reservations({ ...ctx, defs }, a)) a.reservationIds.push(reserve(state, { owner: a.actionId, account: r.account, qty: r.qty }));
      } catch (e) {
        if (e instanceof AftermathError && e.code === 'INSUFFICIENT_RESOURCE') return terminate(ctx, a, Status.FAILED, FailureReason.INSUFFICIENT_RESOURCE);
        throw e;
      }
      transition(ctx, a, Status.RESERVED);
    }
    if (a.status === Status.RESERVED) transition(ctx, a, Status.EXECUTING);
    if (a.status === Status.EXECUTING) {
      const r = h.tick({ ...ctx, defs }, a);
      if (r.status === 'fail') return terminate(ctx, a, Status.FAILED, r.reason);
      if (r.status === 'done') {
        const committed = a.reservationIds.map((id) => commit(state, id));
        a.reservationIds = [];
        a.stopReason = r.stopReason ?? null; // standing actions say why they stopped
        h.complete?.({ ...ctx, defs }, a, committed);
        transition(ctx, a, Status.COMPLETED, a.stopReason ? { reason: a.stopReason, ...(a.stats ?? {}) } : {});
      }
    }
  }

  /** Advance every live action by one tick, in submission order (deterministic). */
  function step(ctx) {
    for (const id of [...ctx.state.activeActions]) {
      const a = ctx.state.actions[id];
      if (!isTerminal(a.status)) advance(ctx, a);
    }
    ctx.state.activeActions = ctx.state.activeActions.filter((id) => !isTerminal(ctx.state.actions[id].status));
  }

  function cancelFor(ctx, actorId, reason = FailureReason.CANCELLED) {
    for (const id of [...ctx.state.activeActions]) {
      const a = ctx.state.actions[id];
      if (a.actorId === actorId && !isTerminal(a.status)) terminate(ctx, a, Status.CANCELLED, reason);
    }
    ctx.state.activeActions = ctx.state.activeActions.filter((id) => !isTerminal(ctx.state.actions[id].status));
  }

  /**
   * Pause a RUNNING interruptible action for a needs policy. The handler (optional `onInterrupt`) banks the work already
   * done (gather credits the units chopped so far) and says how to carry on; the action ends CANCELLED/INTERRUPTED and
   * every reservation it held is released. Returns the resume spec { type, params } or null when nothing is left to do.
   */
  function interrupt(ctx, a) {
    const h = handlerOf(a);
    const spec = h.onInterrupt ? h.onInterrupt({ ...ctx, defs }, a) : { type: a.actionType, params: { ...a.params } };
    ctx.emit('task.interrupted', { actionId: a.actionId, actorId: a.actorId, taskType: a.actionType, ...(a.stats ? { gathered: a.stats.gathered, trips: a.stats.trips } : {}) });
    terminate(ctx, a, Status.CANCELLED, FailureReason.INTERRUPTED);
    ctx.state.activeActions = ctx.state.activeActions.filter((id) => id !== a.actionId);
    return spec;
  }

  const isIdle = (state) => state.activeActions.length === 0;

  return { submit, step, cancelFor, interrupt, isIdle };
}
