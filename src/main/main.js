'use strict';
const { app, BrowserWindow, ipcMain, session, desktopCapturer, Menu, net, shell, systemPreferences } = require('electron');
const path = require('node:path');
const { createBackend } = require('./linux');
const { bluetoothNames } = require('./windows');
const { checkForUpdate, REPO_URL, RELEASES_URL } = require('./update');
const { accentColor } = require('./accent');

const linux = process.platform === 'linux' ? createBackend() : null;
let win = null;

// Linux calls run one at a time so a refresh never sees a half-built sink.
let queue = Promise.resolve();
const serial = (fn) => {
  const next = queue.then(fn);
  queue = next.catch(() => {});
  return next;
};

function createWindow() {
  win = new BrowserWindow({
    width: 560,
    height: 720,
    minWidth: 420,
    minHeight: 520,
    title: 'MultiAudio',
    icon: path.join(__dirname, '..', 'renderer', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Keeps Windows mirroring running while the window is minimised.
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

function registerIpc() {
  ipcMain.handle('platform', () => process.platform);
  ipcMain.handle('accent', () => accentColor(process.platform, systemPreferences));
  ipcMain.handle('version', () => app.getVersion());
  ipcMain.handle('check-update', () => (net.isOnline() ? checkForUpdate(app.getVersion(), net.fetch) : null));
  // Only these two fixed addresses can be opened.
  ipcMain.handle('open', (_e, page) => shell.openExternal(page === 'releases' ? RELEASES_URL : REPO_URL));
  if (linux) {
    ipcMain.handle('list', () => serial(async () => ({ devices: await linux.list(), active: await linux.active() })));
    ipcMain.handle('start', (_e, ids) => serial(() => linux.start(ids)));
    ipcMain.handle('stop', () => serial(() => linux.stop()));
    ipcMain.handle('mute', (_e, id, muted) => serial(() => linux.setMute(id, muted)));
    ipcMain.handle('volume', (_e, id, value) => serial(() => linux.setVolume(id, value)));
  } else {
    ipcMain.handle('bluetooth-names', () => bluetoothNames());
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    // Needed to read output device names and to capture system audio on Windows.
    const allowed = (permission) => ['media', 'speaker-selection', 'display-capture'].includes(permission);
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed(permission));
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed(permission)));
    if (process.platform === 'win32') {
      session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
        desktopCapturer.getSources({ types: ['screen'] })
          .then(([screen]) => callback({ video: screen, audio: 'loopback' }))
          .catch(() => callback({}));
      });
    }
    registerIpc();
    // Remove a combined sink left behind by a crash.
    if (linux) await serial(() => linux.stop()).catch(() => {});
    createWindow();
  });

  let cleaned = false;
  app.on('before-quit', (e) => {
    if (!linux || cleaned) return;
    e.preventDefault();
    serial(() => linux.stop()).catch(() => {}).finally(() => {
      cleaned = true;
      app.quit();
    });
  });

  app.on('window-all-closed', () => app.quit());
}
