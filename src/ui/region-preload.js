const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('regionAPI', {
  sendSelection: (bounds) => ipcRenderer.send('region:selected', bounds),
  sendCancelled: () => ipcRenderer.send('region:cancelled'),
});