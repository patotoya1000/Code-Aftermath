import { SIM_VERSION, API_VERSION, REPLAY_FORMAT } from '../../kernel/index.js';
import { runAttempt } from '../session/index.js';

/**
 * Re-run a replay record (seed + scenario + code + versions) and compare hashes.
 * A mismatch in versions is reported as such rather than as a confusing hash difference.
 */
export async function verifyReplay(record, { defs, sandbox }) {
  const mismatches = [];
  if (record.format !== REPLAY_FORMAT) mismatches.push('format');
  if (record.simVersion !== SIM_VERSION) mismatches.push('simVersion');
  if (record.apiVersion !== API_VERSION) mismatches.push('apiVersion');
  if (mismatches.length) return { matches: false, reason: 'VERSION_MISMATCH', mismatches };

  const again = await runAttempt({
    defs, sandbox, code: record.code, scenarioId: record.scenarioId, seed: record.seed, maxTicks: record.maxTicks,
    lessonId: record.lessonId, lessonVersion: record.lessonVersion,
  });
  for (const key of ['initialStateHash', 'eventLogHash', 'stateHash']) if (again.record[key] !== record[key]) mismatches.push(key);
  return { matches: mismatches.length === 0, reason: mismatches.length ? 'HASH_MISMATCH' : null, mismatches, attempt: again };
}
