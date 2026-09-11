'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  whipCrack: () => ipcRenderer.send('whip-crack'),
  handPat: () => ipcRenderer.send('hand-pat'),
  hideOverlay: () => ipcRenderer.send('hide-overlay'),
  modeChanged: (mode) => ipcRenderer.send('mode-changed', mode),

  onSpawnWhip: (fn) => ipcRenderer.on('spawn-whip', (_e, opts) => fn(opts)),
  onSpawnHand: (fn) => ipcRenderer.on('spawn-hand', () => fn()),
  onDropWhip: (fn) => ipcRenderer.on('drop-whip', () => fn()),
  onCrackPhrase: (fn) => ipcRenderer.on('crack-phrase', (_e, text, kind) => fn(text, kind)),
});
