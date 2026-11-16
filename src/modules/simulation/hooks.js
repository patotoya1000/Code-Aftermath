import { AftermathError, hasOwn } from '../../kernel/index.js';

/**
 * Learner event hooks (R4b), the simulation's half. The simulation only STORES registrations (they are commands in the
 * timeline, so replay and save/load rebuild them) and never runs learner code: the session's hook runner reacts to
 * events, runs the handler in the sandbox Worker with a fresh frozen view, and sends the resulting commands back through
 * the normal command path (strategy points, timeline). Replay therefore replays the COMMANDS the hooks produced.
 */
const bad = (msg) => new AftermathError('INVALID_COMMAND', msg);

export function setHook(ctx, actorId, params = {}) {
  const { state, defs } = ctx;
  const { event, source } = params;
  const { events, limits } = defs.hooks;
  if (typeof event !== 'string' || !hasOwn(events, event)) throw bad(`on(): unknown event "${event}". Use one of: ${Object.keys(events).join(', ')}.`);
  if (typeof source !== 'string' || !source.trim()) throw bad('on(): the second argument must be a function, like () => { survivor.eat(); }');
  if (source.length > limits.maxSourceChars) throw bad(`on(): the handler is too long (max ${limits.maxSourceChars} characters). Keep hooks short.`);
  const id = `${actorId}:${event}`;
  const mine = Object.values(state.hooks).filter((h) => h.actorId === actorId && h.id !== id).length;
  if (mine >= limits.perSurvivor) throw bad(`on(): a survivor can have at most ${limits.perSurvivor} hooks. Remove one with survivor.off(event).`);
  state.hooks[id] = { id, actorId, event, source, registeredAtTick: state.tick };
  ctx.emit('hook.set', { actorId, event });
}

export function clearHook(ctx, actorId, params = {}) {
  const { state, defs } = ctx;
  if (params.event !== undefined && (typeof params.event !== 'string' || !hasOwn(defs.hooks.events, params.event))) throw bad(`off(): unknown event "${params.event}". Use one of: ${Object.keys(defs.hooks.events).join(', ')}.`);
  for (const h of Object.values(state.hooks)) {
    if (h.actorId === actorId && (params.event === undefined || h.event === params.event)) {
      delete state.hooks[h.id];
      ctx.emit('hook.cleared', { actorId, event: h.event });
    }
  }
}
