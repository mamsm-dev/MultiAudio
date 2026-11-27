'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { checkForUpdate, isNewer } = require('../src/main/update');

test('compares versions numerically', () => {
  assert.ok(isNewer('v1.10.0', '1.9.0'));
  assert.ok(!isNewer('v1.0.0', '1.0.0'));
  assert.ok(!isNewer('v1.0.0', '1.1.0'));
  assert.ok(!isNewer('nightly', '1.0.0'));
});

test('reports a newer release and stays quiet when offline', async () => {
  const reply = async () => ({ ok: true, json: async () => ({ tag_name: 'v2.0.0' }) });
  assert.strictEqual(await checkForUpdate('1.1.0', reply), '2.0.0');
  assert.strictEqual(await checkForUpdate('1.1.0', async () => { throw new Error('offline'); }), null);
});
