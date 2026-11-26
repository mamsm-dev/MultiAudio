'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('api', {
  platform: call('platform'),
  list: call('list'),
  start: call('start'),
  stop: call('stop'),
  volume: call('volume'),
  bluetoothNames: call('bluetooth-names'),
});
