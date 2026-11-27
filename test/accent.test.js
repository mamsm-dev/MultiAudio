'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { accentColor, parsePortal, parseKdeGlobals } = require('../src/main/accent');

test('reads the portal reply and ignores "no preference"', () => {
  assert.strictEqual(parsePortal('{"type":"v","data":[{"type":"(ddd)","data":[1,0,0.5]}]}'), '#ff0080');
  assert.strictEqual(parsePortal('{"type":"v","data":[{"type":"(ddd)","data":[-1,-1,-1]}]}'), null);
  assert.strictEqual(parsePortal('garbage'), null);
});

test('reads kdeglobals, preferring the custom accent', () => {
  const scheme = '[Colors:Selection]\nBackgroundNormal=61,174,233\n';
  assert.strictEqual(parseKdeGlobals(scheme), '#3daee9');
  assert.strictEqual(parseKdeGlobals(`${scheme}[General]\nAccentColor=146,61,233\n`), '#923de9');
  assert.strictEqual(parseKdeGlobals(''), null);
});

test('converts the Windows value', async () => {
  assert.strictEqual(await accentColor('win32', { getAccentColor: () => '0078D4ff' }), '#0078d4');
});
