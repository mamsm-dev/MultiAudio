'use strict';
// Reads the operating system accent colour. Resolves to "#rrggbb", or null if there is none.
const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const hex = (channels) =>
  channels.length === 3 && channels.every((c) => Number.isInteger(c) && c >= 0 && c <= 255)
    ? `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`
    : null;

// XDG desktop portal reply: {"type":"v","data":[{"type":"(ddd)","data":[r,g,b]}]}, channels 0..1.
// Values outside that range mean "no preference".
function parsePortal(text) {
  try {
    const rgb = JSON.parse(text).data[0].data;
    if (!rgb.every((c) => c >= 0 && c <= 1)) return null;
    return hex(rgb.map((c) => Math.round(c * 255)));
  } catch {
    return null;
  }
}

// KDE: a custom accent is in [General]; otherwise the colour scheme's selection colour is used.
function parseKdeGlobals(text) {
  const found = {};
  let group = '';
  for (const line of text.split('\n')) {
    const header = /^\[(.+)\]\s*$/.exec(line);
    if (header) {
      group = header[1];
      continue;
    }
    const entry = /^(AccentColor|BackgroundNormal)=(\d+),(\d+),(\d+)/.exec(line);
    if (entry) found[`${group}/${entry[1]}`] = hex(entry.slice(2).map(Number));
  }
  return found['General/AccentColor'] || found['Colors:Selection/BackgroundNormal'] || null;
}

const portal = () =>
  new Promise((resolve) => {
    execFile('busctl', ['--user', '--json=short', 'call', 'org.freedesktop.portal.Desktop',
      '/org/freedesktop/portal/desktop', 'org.freedesktop.portal.Settings', 'ReadOne', 'ss',
      'org.freedesktop.appearance', 'accent-color'], { timeout: 3000 },
    (err, stdout) => resolve(err ? null : parsePortal(stdout)));
  });

async function kde() {
  const dir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  try {
    return parseKdeGlobals(await fs.readFile(path.join(dir, 'kdeglobals'), 'utf8'));
  } catch {
    return null;
  }
}

async function accentColor(platform, systemPreferences) {
  if (platform === 'linux') return (await portal()) || kde();
  try {
    // Windows returns "rrggbbaa".
    const value = systemPreferences.getAccentColor();
    return /^[0-9a-f]{8}$/i.test(value) ? `#${value.slice(0, 6).toLowerCase()}` : null;
  } catch {
    return null;
  }
}

module.exports = { accentColor, parsePortal, parseKdeGlobals };
