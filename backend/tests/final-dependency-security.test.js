import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const configRequire = createRequire(require.resolve('@prisma/config'));
const { deepmerge } = configRequire('deepmerge-ts');

test('patched deepmerge handles self-referential inputs without stack exhaustion', () => {
  const first = {}, second = {};
  first.self = first;
  second.self = second;
  assert.doesNotThrow(() => deepmerge(first, second));
});
