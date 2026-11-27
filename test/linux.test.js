'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createBackend, ourModules } = require('../src/main/linux');

function fakePactl() {
  const sinks = [
    { index: 1, name: 'alsa_output.pci', description: 'Speakers' },
    { index: 2, name: 'bluez_output.AA.1', description: 'JBL' },
    { index: 3, name: 'bluez_output.BB.1', description: 'Sony' },
  ];
  const pa = { def: 'alsa_output.pci', inputs: [{ index: 7, sink: 1 }], loaded: false, calls: [] };
  pa.run = async (args) => {
    pa.calls.push(args.join(' '));
    const [cmd, a, b] = args;
    if (cmd === '--format=json') {
      const all = pa.loaded ? [...sinks, { index: 9, name: 'multiaudio' }] : sinks;
      return JSON.stringify(b === 'sinks' ? all : pa.inputs);
    }
    if (cmd === 'list') return pa.loaded ? '42\tmodule-combine-sink\tsink_name=multiaudio slaves=x\n' : '';
    if (cmd === 'get-default-sink') return `${pa.def}\n`;
    if (cmd === 'set-default-sink') pa.def = a;
    if (cmd === 'load-module') pa.loaded = true;
    if (cmd === 'unload-module') pa.loaded = false;
    if (cmd === 'move-sink-input') {
      pa.inputs.find((i) => String(i.index) === a).sink = b === 'multiaudio' ? 9 : sinks.find((s) => s.name === b).index;
    }
    return '';
  };
  return pa;
}

test('detects Bluetooth sinks', async () => {
  const list = await createBackend(fakePactl().run).list();
  assert.deepStrictEqual(list.map((d) => d.bluetooth), [false, true, true]);
});

test('start combines devices and stop restores the previous output', async () => {
  const pa = fakePactl();
  const backend = createBackend(pa.run);
  await backend.start(['bluez_output.AA.1', 'bluez_output.BB.1']);
  assert.ok(pa.calls.some((c) => c.includes('slaves=bluez_output.AA.1,bluez_output.BB.1')));
  assert.strictEqual(pa.def, 'multiaudio');
  assert.strictEqual(pa.inputs[0].sink, 9);
  assert.strictEqual(await backend.active(), true);

  await backend.stop();
  assert.strictEqual(pa.def, 'alsa_output.pci');
  assert.strictEqual(pa.inputs[0].sink, 1);
  assert.strictEqual(await backend.active(), false);
});

test('start needs two known devices', async () => {
  const backend = createBackend(fakePactl().run);
  await assert.rejects(backend.start(['bluez_output.AA.1', 'nope']), /NEED_TWO/);
});

test('only our own module is matched', () => {
  assert.deepStrictEqual(ourModules('1\tmodule-combine-sink\tsink_name=other\n2\tmodule-combine-sink\tsink_name=multiaudio'), ['2']);
});

test('mutes only known devices', async () => {
  const pa = fakePactl();
  const backend = createBackend(pa.run);
  await backend.setMute('bluez_output.AA.1', true);
  await backend.setMute('nope', true);
  assert.deepStrictEqual(pa.calls.filter((c) => c.startsWith('set-sink-mute')), ['set-sink-mute bluez_output.AA.1 1']);
});
