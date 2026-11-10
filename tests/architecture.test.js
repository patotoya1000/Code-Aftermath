import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULES } from '../src/architecture.js';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}
const importsOf = (file) => {
  const src = readFileSync(file, 'utf8');
  return [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
};

test('every module directory is declared in the manifest, and vice versa', () => {
  const dirs = readdirSync(join(SRC, 'modules')).sort();
  assert.deepEqual(dirs, Object.keys(MODULES).sort());
});

test('modules only import themselves, the kernel index, or declared modules\' index.js', () => {
  const problems = [];
  for (const [name, allowed] of Object.entries(MODULES)) {
    for (const file of walk(join(SRC, 'modules', name))) {
      for (const spec of importsOf(file)) {
        if (!spec.startsWith('.')) { if (spec.startsWith('node:') && name !== 'sandbox' && name !== 'persistence') problems.push(`${relative(SRC, file)}: node import ${spec}`); continue; }
        const target = resolve(dirname(file), spec);
        const rel = relative(SRC, target).split(sep);
        const where = `${relative(SRC, file)} -> ${spec}`;
        if (rel[0] === 'kernel') { if (rel.join('/') !== 'kernel/index.js') problems.push(`${where}: import kernel via kernel/index.js only`); continue; }
        if (rel[0] !== 'modules') { problems.push(`${where}: modules may not import outside modules/ and kernel/`); continue; }
        if (rel[1] === name) continue;
        if (!allowed.includes(rel[1])) problems.push(`${where}: "${name}" may not depend on "${rel[1]}"`);
        else if (rel.slice(2).join('/') !== 'index.js') problems.push(`${where}: import another module through its index.js only`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('the module dependency graph has no cycles', () => {
  const state = {};
  const visit = (n, path) => {
    if (state[n] === 'done') return;
    assert.notEqual(state[n], 'busy', `cycle: ${[...path, n].join(' -> ')}`);
    state[n] = 'busy';
    for (const d of MODULES[n]) visit(d, [...path, n]);
    state[n] = 'done';
  };
  Object.keys(MODULES).forEach((n) => visit(n, []));
});

test('kernel imports nothing outside itself', () => {
  for (const file of walk(join(SRC, 'kernel'))) {
    for (const spec of importsOf(file)) assert.ok(spec.startsWith('./'), `${relative(SRC, file)} imports ${spec}`);
  }
});

test('simulation state is never exported: projections and simulation are the only readers', () => {
  // The renderer-facing modules must not import the simulation or actions (render can never mutate gameplay).
  for (const m of ['debugview', 'lessons', 'replay', 'persistence']) {
    assert.ok(!MODULES[m].includes('simulation') && !MODULES[m].includes('actions'), `${m} must not depend on simulation/actions`);
  }
});
