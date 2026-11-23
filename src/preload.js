'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('native', {
  call: async (channel, arg) => {
    const r = await ipcRenderer.invoke('rpc', channel, arg);
    if (!r.ok) throw new Error(r.error);
    return r.data;
  },
  saveCsv: (name, content) => ipcRenderer.invoke('saveCsv', name, content),
});
