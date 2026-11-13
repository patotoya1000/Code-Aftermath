import { hashValue } from './hash.js';

// Append-only event log. Events are frozen; reserved keys (seq/tick/type) always win over payload keys.
export function createEventLog() {
  const events = [];
  return {
    append(tick, type, data = {}) {
      const e = Object.freeze({ ...data, seq: events.length, tick, type });
      events.push(e);
      return e;
    },
    all: () => events.slice(),
    /** Events from index `from` on (cheap cursor reads for the UI; does not copy the whole log). */
    since: (from = 0) => events.slice(from),
    ofType: (type) => events.filter((e) => e.type === type),
    get length() {
      return events.length;
    },
    hash: () => hashValue(events),
  };
}
