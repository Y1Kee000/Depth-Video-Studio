const { contextBridge, ipcRenderer } = require('electron');

// Expose only the file-dialog operations required by the renderer.
contextBridge.exposeInMainWorld('depthStudio', {
  selectVideo: () => ipcRenderer.invoke('video:select'),
  selectOutputDirectory: () => ipcRenderer.invoke('output:select')
});
