'use strict';
(async () => {
  const $ = (id) => document.getElementById(id);
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  const state = {
    platform: await window.api.platform(),
    lang: read('lang', 'fa'),
    theme: read('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    selected: new Set(read('selected', [])),
    settings: read('settings', {}), // Windows volume and delay per device
    devices: [],
    active: false,
    busy: false,
    error: null,
    btNames: [],
  };
  const isWindows = state.platform === 'win32';
  const t = (key) => window.I18N[state.lang][key];

  async function windowsDevices() {
    const all = await navigator.mediaDevices.enumerateDevices();
    const outs = all.filter((d) => d.kind === 'audiooutput');
    const fallback = outs.find((d) => d.deviceId === 'default');
    return outs
      .filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications')
      .map((d) => {
        const label = d.label || d.deviceId;
        return {
          id: d.deviceId,
          name: label,
          bluetooth: /bluetooth/i.test(label) || state.btNames.some((n) => label.includes(n)),
          isDefault: !!fallback && fallback.groupId === d.groupId && fallback.label.endsWith(label),
          volume: state.settings[d.deviceId]?.volume ?? 100,
          delay: state.settings[d.deviceId]?.delay ?? 0,
        };
      });
  }

  const visible = () => state.devices.filter((d) => $('showAll').checked || d.bluetooth || d.isDefault);
  // The Windows default output always plays, so it counts as selected.
  const isOn = (d) => (isWindows && d.isDefault) || state.selected.has(d.id);
  const chosen = () => visible().filter(isOn);
  const canStart = () => chosen().length >= 2;

  function slider(device, key, label, max, unit) {
    const row = document.createElement('div');
    row.className = 'slider';
    const name = document.createElement('span');
    name.textContent = label;
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min: 0, max, value: device[key] });
    input.setAttribute('aria-label', `${label} ${device.name}`);
    const out = document.createElement('output');
    out.textContent = `${device[key]} ${unit}`;
    input.addEventListener('input', () => {
      device[key] = Number(input.value);
      out.textContent = `${input.value} ${unit}`;
      if (!isWindows) return;
      state.settings[device.id] = { volume: device.volume, delay: device.delay };
      save('settings', state.settings);
      window.Mirror.set(device.id, key, device[key]);
    });
    if (!isWindows) input.addEventListener('change', () => window.api.volume(device.id, device[key]).catch(showError));
    row.append(name, input, out);
    return row;
  }

  function card(device) {
    const el = document.createElement('div');
    el.className = 'device' + (isOn(device) ? ' selected' : '');
    const head = document.createElement('label');
    head.className = 'head';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = isOn(device);
    box.disabled = state.active || state.busy || (isWindows && device.isDefault);
    box.addEventListener('change', () => {
      state.selected[box.checked ? 'add' : 'delete'](device.id);
      save('selected', [...state.selected]);
      state.error = null;
      render();
    });
    const name = document.createElement('span');
    name.className = 'name';
    name.dir = 'auto';
    name.textContent = device.name;
    head.append(box, name);
    for (const [show, text] of [[device.bluetooth, 'Bluetooth'], [device.isDefault, t('defaultOut')]]) {
      if (!show) continue;
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = text;
      head.append(badge);
    }
    el.append(head);
    // The default output on Windows is controlled by Windows itself.
    if (!device.isDefault) {
      el.append(slider(device, 'volume', t('volume'), 100, '%'));
      if (isWindows) el.append(slider(device, 'delay', t('delay'), 1000, t('ms')));
    }
    return el;
  }

  function renderControls() {
    const toggle = $('toggle');
    toggle.textContent = state.active ? t('stop') : t('start');
    toggle.disabled = state.busy || (!state.active && !canStart());
    const status = $('status');
    status.className = state.error ? 'error' : state.active ? 'on' : '';
    status.textContent = state.error ?? (state.active ? t('playing') : canStart() ? t('ready') : t(isWindows ? 'NO_TARGET' : 'pick'));
  }

  function render() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.dataset.theme = state.theme;
    document.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.dataset.t); });
    $('lang').textContent = t('other');
    $('theme').textContent = state.theme === 'dark' ? `☀ ${t('light')}` : `☾ ${t('dark')}`;
    $('note').hidden = !isWindows;
    $('note').textContent = t('winNote');
    const list = visible();
    if (list.length) {
      $('devices').replaceChildren(...list.map(card));
    } else {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = t('empty');
      $('devices').replaceChildren(empty);
    }
    renderControls();
  }

  function showError(err) {
    const code = Object.keys(window.I18N.en).find((k) => /^[A-Z_]+$/.test(k) && err.message.includes(k));
    state.error = code ? t(code) : `${t('failed')}: ${err.message}`;
    renderControls();
  }

  let signature = '';
  async function refresh(force = false) {
    if (state.busy) return;
    try {
      let devices;
      let active = state.active;
      if (isWindows) devices = await windowsDevices();
      else ({ devices, active } = await window.api.list());
      const next = JSON.stringify([active, devices.map((d) => [d.id, d.name, d.volume, d.isDefault, d.bluetooth])]);
      state.devices = devices;
      state.active = active;
      // Redraw only on real changes, so sliders are not interrupted.
      if (force || next !== signature) {
        signature = next;
        render();
      }
    } catch (err) {
      showError(err);
    }
  }

  async function toggle() {
    state.busy = true;
    state.error = null;
    renderControls();
    try {
      if (state.active) {
        await (isWindows ? window.Mirror.stop() : window.api.stop());
        state.active = false;
      } else {
        if (isWindows) await window.Mirror.start(chosen().filter((d) => !d.isDefault));
        else await window.api.start(chosen().map((d) => d.id));
        state.active = true;
      }
      state.busy = false;
      await refresh(true);
    } catch (err) {
      state.busy = false;
      await refresh(true);
      showError(err);
    }
  }

  $('toggle').addEventListener('click', toggle);
  $('showAll').checked = read('showAll', false);
  $('showAll').addEventListener('change', () => { save('showAll', $('showAll').checked); render(); });
  $('theme').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    save('theme', state.theme);
    render();
  });
  $('lang').addEventListener('click', () => {
    state.lang = state.lang === 'fa' ? 'en' : 'fa';
    save('lang', state.lang);
    state.error = null;
    render();
  });
  const rescan = async () => {
    if (isWindows) state.btNames = await window.api.bluetoothNames();
    state.error = null;
    await refresh(true);
  };
  $('refresh').addEventListener('click', rescan);

  if (isWindows) {
    navigator.mediaDevices.addEventListener('devicechange', async () => {
      // Stop first: a new default output could otherwise feed back into itself.
      const wasActive = state.active;
      if (wasActive) await window.Mirror.stop();
      state.active = false;
      await rescan();
      if (wasActive) showError(new Error('CHANGED'));
    });
  }

  render();
  await rescan();
  if (!isWindows) setInterval(refresh, 3000);
})();
