const { contextBridge, ipcRenderer } = require('electron');

// Expose only the file-dialog operations required by the renderer.
contextBridge.exposeInMainWorld('depthStudio', {
  selectVideo: () => ipcRenderer.invoke('video:select'),
  selectOutputDirectory: () => ipcRenderer.invoke('output:select'),
  probeEngine: () => ipcRenderer.invoke('engine:probe'),
  startJob: (options) => ipcRenderer.invoke('job:start', options),
  cancelJob: (jobId) => ipcRenderer.invoke('job:cancel', jobId),
  onJobProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('job:progress', listener);
    return () => ipcRenderer.removeListener('job:progress', listener);
  }
});
