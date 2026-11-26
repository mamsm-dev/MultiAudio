'use strict';
// Windows has no command for combining outputs, so mirroring happens in the renderer.
// This file only finds out which audio endpoints belong to Bluetooth devices.
const { execFile } = require('node:child_process');

const SCRIPT = [
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
  "Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -like 'BTHENUM*' -or $_.InstanceId -like 'BTHLE*' } |",
  'Select-Object -ExpandProperty FriendlyName | ConvertTo-Json -Compress',
].join('\n');

function bluetoothNames() {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT],
      { timeout: 10000, windowsHide: true }, (err, stdout) => {
        if (err || !stdout.trim()) return resolve([]);
        try {
          resolve([].concat(JSON.parse(stdout)).filter(Boolean));
        } catch {
          resolve([]);
        }
      });
  });
}

module.exports = { bluetoothNames };
