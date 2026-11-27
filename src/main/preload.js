'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('api', {
  platform: call('platform'),
  accent: call('accent'),
  version: call('version'),
  checkUpdate: call('check-update'),
  open: call('open'),
  list: call('list'),
  start: call('start'),
  stop: call('stop'),
  volume: call('volume'),
  mute: call('mute'),
  bluetoothNames: call('bluetooth-names'),
});
