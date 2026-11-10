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
    ofType: (type) => events.filter((e) => e.type === type),
    get length() {
      return events.length;
    },
    hash: () => hashValue(events),
  };
}
