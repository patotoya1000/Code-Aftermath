import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefinitions } from '../src/modules/definitions/index.js';

test('farm action and crop definitions are accepted by the validated definition set', () => {
  const defs = createDefinitions();

  assert.equal(defs.actions.farm.handler, 'farm');
  assert.ok(defs.crops.wheat);
  assert.equal(defs.crops.wheat.id, 'wheat');
});
