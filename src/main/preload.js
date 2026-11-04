'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('storyTracker', {
  status: () => ipcRenderer.invoke('app:status'),
});
