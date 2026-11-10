import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDirectExecutionEntry } from '../scripts/serve.mjs';

test('serve entry detection works for Windows-style paths', () => {
  const scriptPath = 'C:\\Game Development\\code-aftermath\\scripts\\serve.mjs';
  const scriptUrl = 'file:///C:/Game%20Development/code-aftermath/scripts/serve.mjs';

  assert.equal(isDirectExecutionEntry(scriptUrl, scriptPath), true);
  assert.equal(isDirectExecutionEntry(scriptUrl, 'C:/Game Development/code-aftermath/scripts/serve.mjs'), true);
  assert.equal(isDirectExecutionEntry(scriptUrl, 'C:/Game Development/code-aftermath/scripts/other.mjs'), false);
});
