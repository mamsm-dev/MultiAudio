'use strict';
// Linux backend: drives PulseAudio / PipeWire (pipewire-pulse) through pactl.
const { execFile } = require('node:child_process');

const SINK = 'multiaudio';

function defaultRun(args) {
  return new Promise((resolve, reject) => {
    // C.UTF-8 keeps device names intact; LC_ALL also forces "." decimals in JSON.
    const env = { ...process.env, LC_ALL: 'C.UTF-8' };
    execFile('pactl', args, { env, timeout: 8000 }, (err, stdout, stderr) => {
      if (!err) return resolve(stdout);
      if (err.code === 'ENOENT') return reject(new Error('PACTL_MISSING'));
      reject(new Error(stderr.trim() || err.message));
    });
  });
}

const isBluetooth = (s) =>
  /^bluez_(output|sink)\./.test(s.name) || s.properties?.['device.bus'] === 'bluetooth';

function volumeOf(sink) {
  const channels = Object.values(sink.volume || {});
  return channels.length ? parseInt(channels[0].value_percent, 10) : 100;
}

// "pactl list short modules": id <tab> name <tab> arguments
const ourModules = (text) =>
  text.split('\n')
    .map((line) => line.split('\t'))
    .filter(([, name, args]) =>
      name === 'module-combine-sink' && (args || '').split(/\s+/).includes(`sink_name=${SINK}`))
    .map(([id]) => id);

function createBackend(run = defaultRun) {
  let previousDefault = null;

  const json = async (what) => JSON.parse(await run(['--format=json', 'list', what]));
  const modules = async () => ourModules(await run(['list', 'short', 'modules']));

  async function list() {
    const sinks = await json('sinks');
    return sinks
      .filter((s) => s.name !== SINK)
      .map((s) => ({
        id: s.name,
        name: s.description || s.name,
        bluetooth: isBluetooth(s),
        volume: volumeOf(s),
        muted: !!s.mute,
      }));
  }

  async function inputsOn(sinkName) {
    const sink = (await json('sinks')).find((s) => s.name === sinkName);
    if (!sink) return [];
    return (await json('sink-inputs')).filter((i) => i.sink === sink.index).map((i) => i.index);
  }

  // A stream may end between listing and moving, so failures are ignored.
  const move = (ids, sinkName) =>
    Promise.all(ids.map((id) => run(['move-sink-input', String(id), sinkName]).catch(() => {})));

  async function stop() {
    const ids = await modules();
    if (!ids.length) return;
    const sinks = await list();
    const fallback = sinks.find((s) => s.id === previousDefault) || sinks[0];
    if (fallback) {
      const playing = await inputsOn(SINK);
      await run(['set-default-sink', fallback.id]);
      await move(playing, fallback.id);
    }
    for (const id of ids) await run(['unload-module', id]);
    previousDefault = null;
  }

  async function start(selected) {
    const known = new Set((await list()).map((s) => s.id));
    const targets = [...new Set(selected)].filter((id) => known.has(id) && !/[,\s]/.test(id));
    if (targets.length < 2) throw new Error('NEED_TWO');

    await stop();
    const current = (await run(['get-default-sink'])).trim();
    previousDefault = current === SINK ? null : current;
    // Collected before loading, so the combine module's own streams are never moved.
    const playing = (await json('sink-inputs')).map((i) => i.index);

    await run(['load-module', 'module-combine-sink', `sink_name=${SINK}`,
      `slaves=${targets.join(',')}`, 'sink_properties=device.description=MultiAudio']);
    try {
      await run(['set-default-sink', SINK]);
    } catch (err) {
      await stop();
      throw err;
    }
    await move(playing, SINK);
  }

  async function setVolume(id, percent) {
    const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    if (!(await list()).some((s) => s.id === id)) return;
    await run(['set-sink-volume', id, `${value}%`]);
  }

  async function setMute(id, muted) {
    if (!(await list()).some((s) => s.id === id)) return;
    await run(['set-sink-mute', id, muted ? '1' : '0']);
  }

  const active = async () => (await modules()).length > 0;

  return { list, start, stop, setVolume, setMute, active };
}

module.exports = { createBackend, ourModules, isBluetooth };
