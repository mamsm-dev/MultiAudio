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
    settings: read('settings', {}), // Windows volume and mute per device
    delays: read('delays', {}), // { id: { on, seconds } }
    devices: [],
    active: false,
    busy: false,
    error: null,
    btNames: [],
    update: null,
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
          muted: state.settings[d.deviceId]?.muted ?? false,
        };
      });
  }

  const visible = () => state.devices.filter((d) => $('showAll').checked || d.bluetooth || d.isDefault);
  // The Windows default output always plays, so it counts as selected.
  const isOn = (d) => (isWindows && d.isDefault) || state.selected.has(d.id);
  const chosen = () => visible().filter(isOn);
  const canStart = () => chosen().length >= 2;

  // Persian puts the percent sign after the number in reading order.
  const percent = (value) => `${value}${t('percent')}`;
  const MAX_DELAY = 10;
  // Redrawing replaces the controls, so it waits while one is being dragged or typed in.
  let dragging = false;
  const editing = () => dragging || document.activeElement?.classList.contains('delay-input');
  const delayOf = (id) => ({ on: false, seconds: 0, ...state.delays[id] });
  const effectiveDelay = (id) => (delayOf(id).on ? delayOf(id).seconds : 0);
  const delaysFor = (devices) => Object.fromEntries(devices.map((d) => [d.id, effectiveDelay(d.id)]));

  function remember(device) {
    const { volume, muted } = device;
    state.settings[device.id] = { volume, muted };
    save('settings', state.settings);
  }

  function muteButton(device) {
    const button = document.createElement('button');
    button.className = 'mute';
    const label = t(device.muted ? 'unmute' : 'mute');
    button.title = label;
    button.setAttribute('aria-label', `${label} ${device.name}`);
    button.setAttribute('aria-pressed', String(device.muted));
    button.innerHTML = window.ICONS[device.muted ? 'muted' : 'sound'];
    button.addEventListener('click', async () => {
      const muted = !device.muted;
      try {
        if (isWindows) {
          device.muted = muted;
          remember(device);
          window.Mirror.set(device.id, 'muted', muted);
        } else {
          await window.api.mute(device.id, muted);
          device.muted = muted;
        }
        render();
      } catch (err) {
        showError(err);
      }
    });
    return button;
  }

  // --fill lets the light theme colour the part of the track before the thumb.
  const paint = (input) => input.style.setProperty('--fill', `${(input.value / input.max) * 100}%`);

  function range(value, max, step, label) {
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min: 0, max, step });
    input.value = value;
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => paint(input));
    paint(input);
    return input;
  }

  function row(...children) {
    const el = document.createElement('div');
    el.className = 'slider';
    el.append(...children);
    return el;
  }

  // Live volume on Linux: one request at a time, always finishing with the newest value.
  const wanted = new Map();
  let sending = false;
  async function sendVolume(id, value) {
    wanted.set(id, value);
    if (sending) return;
    sending = true;
    while (wanted.size) {
      const [next, volume] = wanted.entries().next().value;
      wanted.delete(next);
      await window.api.volume(next, volume).catch(showError);
    }
    sending = false;
  }

  function volumeRow(device) {
    const name = document.createElement('span');
    name.textContent = t('volume');
    const input = range(device.volume, 100, 1, `${t('volume')} ${device.name}`);
    const out = document.createElement('output');
    out.dir = 'auto';
    out.textContent = percent(device.volume);
    input.addEventListener('input', () => {
      device.volume = Number(input.value);
      out.textContent = percent(input.value);
      if (!isWindows) {
        sendVolume(device.id, device.volume);
        return;
      }
      remember(device);
      window.Mirror.set(device.id, 'volume', device.volume);
    });
    return row(name, input, out);
  }

  // Linux has to rebuild the audio route to change a delay.
  async function applyDelay(device) {
    if (isWindows) {
      window.Mirror.set(device.id, 'delay', effectiveDelay(device.id));
      return;
    }
    if (!state.active || !state.selected.has(device.id)) return;
    state.busy = true;
    state.error = null;
    render();
    let failure = null;
    try {
      const targets = chosen();
      await window.api.start(targets.map((d) => d.id), delaysFor(targets));
    } catch (err) {
      failure = err;
    }
    state.busy = false;
    await refresh(true);
    if (failure) showError(failure);
  }

  // Accepts Persian and Arabic digits and decimal separators as well as Latin ones.
  const parseSeconds = (text) => {
    const latin = text.trim()
      .replace(/[۰-۹٠-٩]/g, (c) => String(c.charCodeAt(0) & 0xf))
      .replace(/[٫,\/]/g, '.');
    const value = Number(latin);
    return Number.isFinite(value) ? Math.round(Math.max(0, Math.min(MAX_DELAY, value)) * 100) / 100 : null;
  };

  function delayRow(device) {
    const current = delayOf(device.id);
    const toggleLabel = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = current.on;
    box.disabled = state.busy;
    toggleLabel.append(box, ` ${t('delay')}`);

    const input = document.createElement('input');
    Object.assign(input, { type: 'text', inputMode: 'decimal', className: 'delay-input', dir: 'ltr', value: String(current.seconds) });
    input.setAttribute('aria-label', `${t('delay')} (${t('seconds')}) ${device.name}`);
    input.disabled = !current.on || state.busy;

    const unit = document.createElement('span');
    unit.textContent = `${t('seconds')} (0–${MAX_DELAY})`;

    const store = (seconds) => {
      state.delays[device.id] = { on: box.checked, seconds };
      save('delays', state.delays);
    };
    box.addEventListener('change', () => {
      const { seconds } = delayOf(device.id);
      store(seconds);
      input.disabled = !box.checked;
      if (seconds > 0) applyDelay(device);
    });
    // Applied on Enter or when the field loses focus.
    input.addEventListener('change', () => {
      const previous = delayOf(device.id).seconds;
      const seconds = parseSeconds(input.value) ?? previous;
      input.value = String(seconds);
      if (seconds === previous) return;
      store(seconds);
      applyDelay(device);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
    });
    return row(toggleLabel, input, unit);
  }

  function card(device) {
    const el = document.createElement('div');
    el.className = 'device' + (isOn(device) ? ' selected' : '') + (device.muted && !device.isDefault ? ' muted' : '');
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
    const text = document.createElement('bdi');
    text.textContent = device.name;
    name.append(text);
    head.append(box, name);
    for (const [show, text] of [[device.bluetooth, 'Bluetooth'], [device.isDefault, t('defaultOut')]]) {
      if (!show) continue;
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = text;
      head.append(badge);
    }
    // Outside the label, so pressing it does not toggle the checkbox.
    const top = document.createElement('div');
    top.className = 'top';
    top.append(head);
    if (!device.isDefault) top.append(muteButton(device));
    el.append(top);
    // The default output on Windows is controlled by Windows itself.
    if (!device.isDefault) {
      el.append(volumeRow(device), delayRow(device));
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
    const dark = state.theme === 'dark';
    $('theme').innerHTML = window.ICONS[dark ? 'sun' : 'moon'];
    $('theme').title = t(dark ? 'light' : 'dark');
    $('theme').setAttribute('aria-label', $('theme').title);
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
    renderUpdate();
    renderControls();
  }

  function renderUpdate() {
    $('update').hidden = !state.update;
    if (state.update) $('updateText').textContent = t('update').replace('{v}', state.update);
  }

  function showError(err) {
    const code = Object.keys(window.I18N.en).find((k) => /^[A-Z_]+$/.test(k) && err.message.includes(k));
    state.error = code ? t(code) : `${t('failed')}: ${err.message}`;
    renderControls();
  }

  let signature = '';
  async function refresh(force = false) {
    if (state.busy || (!force && editing())) return;
    try {
      let devices;
      let active = state.active;
      if (isWindows) devices = await windowsDevices();
      else ({ devices, active } = await window.api.list());
      // A drag or typing may have started while the list was loading.
      if (!force && editing()) return;
      const next = JSON.stringify([active, devices.map((d) => [d.id, d.name, d.volume, d.muted, d.isDefault, d.bluetooth])]);
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
        if (isWindows) await window.Mirror.start(chosen().filter((d) => !d.isDefault)
          .map((d) => ({ ...d, delay: effectiveDelay(d.id) })));
        else await window.api.start(chosen().map((d) => d.id), delaysFor(chosen()));
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

  $('devices').addEventListener('pointerdown', (e) => {
    if (e.target.type === 'range') dragging = true;
  });
  for (const type of ['pointerup', 'pointercancel', 'blur']) {
    window.addEventListener(type, () => { dragging = false; });
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

  // Follow the system accent colour; the stylesheet colour is the fallback.
  async function applyAccent() {
    const color = await window.api.accent().catch(() => null);
    const root = document.documentElement.style;
    if (!color) {
      root.removeProperty('--primary');
      root.removeProperty('--on-primary');
      return;
    }
    // Pick black or white text, whichever contrasts more with the accent.
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(color.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    root.setProperty('--primary', color);
    root.setProperty('--on-primary', 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? '#000' : '#fff');
  }
  applyAccent();
  // Picks up changes made while the app is open.
  window.addEventListener('focus', applyAccent);
  setInterval(applyAccent, 5000);

  $('github').addEventListener('click', () => window.api.open('repo'));
  $('download').addEventListener('click', () => window.api.open('releases'));
  $('version').textContent = `v${await window.api.version()}`;
  // Not awaited, so a slow network never delays the device list.
  window.api.checkUpdate().then((version) => {
    state.update = version;
    renderUpdate();
  });

  render();
  await rescan();
  if (!isWindows) setInterval(refresh, 3000);
})();
