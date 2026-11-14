import { Status } from './lifecycle.js';

/**
 * R4a — needs policies. Runs once per tick, BEFORE the action engine steps, inside the simulation tick.
 * Everything here is a pure function of GameState + definitions, so replays reproduce it exactly: the learner only ever
 * records the `policy` command itself, never the reactions.
 *
 * Per survivor, per tick, at most ONE policy fires:
 *   1. skip survivors that are not active, have no policies, or already have a policy action pending/running
 *      (a policy action is never interrupted by another policy — explicit rule);
 *   2. consider the survivor's policies in definition priority order (lower number first);
 *   3. a policy is due when the need is BELOW its threshold and it is not in its post-failure silence (`retryAt`);
 *   4. look at the survivor's FIFO head action:
 *        none ............ run the survival action now
 *        same action ..... skip (the learner is already doing it)
 *        waiting (QUEUED)  insert the survival action in front of it
 *        running + interruptible
 *                          pause it (work done is banked), run the survival action, then resume the job
 *        running + not interruptible
 *                          wait (the learner chose that action explicitly)
 * Policy and resume actions are created by the simulation: they cost no strategy points and are not in the timeline.
 */
export function runPolicies(ctx, engine) {
  const { state, defs } = ctx;
  const order = Object.entries(defs.policies.list).sort((x, y) => x[1].priority - y[1].priority);
  for (const s of Object.values(state.survivors)) {
    if (s.status !== 'active' || !s.policies || Object.keys(s.policies).length === 0) continue;
    const mine = state.activeActions.map((id) => state.actions[id]).filter((a) => a.actorId === s.id);
    if (mine.some((a) => a.origin?.startsWith('policy:'))) continue;
    const head = mine[0] ?? null;

    for (const [name, def] of order) {
      const rule = s.policies[name];
      if (!rule || s.needs[def.need] >= rule.below || state.tick < (rule.retryAt ?? 0)) continue;
      if (head && head.actionType === def.action) continue;
      const base = { apiVersion: 1, actorId: s.id, type: def.action, params: { ...def.params }, mode: 'queue' };
      const origin = `policy:${name}`;

      if (!head) {
        ctx.emit('policy.triggered', { actorId: s.id, policy: name, need: def.need, value: s.needs[def.need], below: rule.below, interrupted: null });
        engine.submit(ctx, base, { origin });
      } else if (head.status === Status.QUEUED) {
        ctx.emit('policy.triggered', { actorId: s.id, policy: name, need: def.need, value: s.needs[def.need], below: rule.below, interrupted: null });
        engine.submit(ctx, base, { origin, place: 'front' });
      } else if (head.status === Status.EXECUTING && defs.actions[head.actionType].interruptible) {
        ctx.emit('policy.triggered', { actorId: s.id, policy: name, need: def.need, value: s.needs[def.need], below: rule.below, interrupted: head.actionId });
        const resume = engine.interrupt(ctx, head);
        const policyId = engine.submit(ctx, base, { origin, place: 'front' });
        if (resume) engine.submit(ctx, { apiVersion: 1, actorId: s.id, type: resume.type, params: resume.params, mode: 'queue' }, { origin: 'resume', resumeOf: head.actionId, place: { after: policyId } });
      } else continue; // running a non-interruptible action chosen by the learner: nothing may pause it, every policy waits
      break;
    }
  }
}
