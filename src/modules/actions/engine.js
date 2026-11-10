import { AftermathError } from '../../kernel/index.js';
import { reserve, commit, releaseOwner } from '../resources/index.js';
import { Status, FailureReason, canTransition, isTerminal } from './lifecycle.js';
import { createHandlers } from './handlers/index.js';

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
    if (isTerminal(to)) a.endedAtTick = ctx.state.tick;
    ctx.emit(`action.${to.toLowerCase()}`, { actionId: a.actionId, actorId: a.actorId, actionType: a.actionType, targetId: a.targetId, ...extra });
  }

  // FAILED / CANCELLED always release every reservation the action still holds.
  function terminate(ctx, a, to, reason) {
    releaseOwner(ctx.state, a.actionId);
    a.reservationIds = [];
    a.failureReason = reason;
    transition(ctx, a, to, { reason });
  }

  function submit(ctx, command) {
    if (!defs.actions[command.type]) throw new AftermathError('UNKNOWN_ACTION', `Unknown action type ${command.type}`);
    const { state } = ctx;
    state.counters.action += 1;
    const actionId = `act_${state.counters.action}`;
    state.actions[actionId] = {
      actionId, actorId: command.actorId, actionType: command.type, targetId: command.params?.targetId ?? null,
      params: { ...command.params }, requestedAtTick: state.tick, status: Status.QUEUED, failureReason: null,
      reservationIds: [], progress: 0, travelTicks: 0, phase: null, startedAtTick: null, endedAtTick: null,
    };
    state.activeActions.push(actionId);
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
        h.complete?.({ ...ctx, defs }, a, committed);
        transition(ctx, a, Status.COMPLETED);
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

  const isIdle = (state) => state.activeActions.length === 0;

  return { submit, step, cancelFor, isIdle };
}
