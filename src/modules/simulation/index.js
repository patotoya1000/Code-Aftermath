import { AftermathError, createEventLog, hashValue, SUPPORTED_API_VERSIONS } from '../../kernel/index.js';
import { applyNeedsDecay } from '../survivors/index.js';
import { createActionEngine } from '../actions/index.js';
import { studentView, renderProjection, inspectorCard } from '../projection/index.js';

/**
 * The simulation is the ONLY writer of GameState. The state object lives in this closure; the outside
 * world gets commands in (submit), time (step) and frozen projections out.
 */
export function createSimulation({ defs, state, log = createEventLog() }) {
  const engine = createActionEngine(defs);
  const ctx = { state, defs, emit: (type, data) => log.append(state.tick, type, data) };

  // Turn budget (command-focused simulation)
  const MAX_COMMANDS_PER_TURN = 3;
  const MAX_STRATEGY_POINTS = 10;

  function submit(command) {
    if (!command || typeof command !== 'object') throw new AftermathError('INVALID_COMMAND', 'Command must be an object');
    if (!SUPPORTED_API_VERSIONS.includes(command.apiVersion)) throw new AftermathError('UNSUPPORTED_API_VERSION', `API version ${command.apiVersion} is not supported`);
    if (!state.survivors[command.actorId]) throw new AftermathError('UNKNOWN_ACTOR', `Unknown actor ${command.actorId}`);
    if (command.type === 'stop') {
      engine.cancelFor(ctx, command.actorId);
      ctx.emit('command.stop', { actorId: command.actorId });
      return null;
    }
    return engine.submit(ctx, command);
  }

  function tickOnce() {
    state.tick += 1;
    for (const id of applyNeedsDecay(ctx)) engine.cancelFor(ctx, id, 'ACTOR_DOWNED');
    engine.step(ctx);
  }

  /** Get turn-related info for the command console UI. */
  function getTurnInfo() {
    return {
      tick: state.tick,
      turn: state.turn ?? 0,
      commandsLeft: state.commandsLeft ?? MAX_COMMANDS_PER_TURN,
      maxCommands: MAX_COMMANDS_PER_TURN,
      strategyPoints: state.strategyPoints ?? MAX_STRATEGY_POINTS,
      maxStrategyPoints: MAX_STRATEGY_POINTS,
    };
  }

  /** Start a new turn: reset command budget, recharge strategy points. */
  function startTurn() {
    state.turn = (state.turn ?? 0) + 1;
    state.commandsLeft = MAX_COMMANDS_PER_TURN;
    state.strategyPoints = Math.min(MAX_STRATEGY_POINTS, (state.strategyPoints ?? 0) + 2);
    ctx.emit('turn.start', { turn: state.turn, commandsLeft: state.commandsLeft, strategyPoints: state.strategyPoints });
  }

  /** Submit a command if budget allows. Returns { ok, actionId } or throws. */
  function submitCommand(command) {
    const info = getTurnInfo();
    if (info.commandsLeft <= 0) throw new AftermathError('COMMAND_BUDGET_EXCEEDED', `No commands left this turn (max ${MAX_COMMANDS_PER_TURN}). Start a new turn.`);
    if (info.strategyPoints < 1) throw new AftermathError('INSUFFICIENT_STRATEGY_POINTS', `Not enough strategy points to issue a command.`);

    state.commandsLeft -= 1;
    state.strategyPoints = Math.max(0, state.strategyPoints - 1);

    return submit(command);
  }

  /** Execute the turn: run ticks until all actions are idle or maxTicks reached. */
  function executeTurn(maxTicks = 600) {
    const eventsBefore = log.all().length;
    while (!isIdle() && state.tick < maxTicks) {
      tickOnce();
    }
    const eventsAfter = log.all().length;
    return { events: log.all().slice(eventsBefore), tick: state.tick };
  }

  return {
    log,
    submit,
    submitCommand,
    startTurn,
    executeTurn,
    getTurnInfo,
    step(n = 1) { for (let i = 0; i < n; i++) tickOnce(); },
    get tick() { return state.tick; },
    isIdle: () => engine.isIdle(state),
    stateHash: () => hashValue(state),
    snapshot: () => structuredClone(state),
    studentView: () => studentView(state, defs),
    renderProjection: () => renderProjection(state, defs),
    inspector: (id) => inspectorCard(state, defs, id),
  };
}
