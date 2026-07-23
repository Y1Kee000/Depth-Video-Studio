const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');

const videoFilters = [
  { name: 'Video files', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'] }
];

function createWindow() {
  const window = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#08110f',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  window.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  ipcMain.handle('video:select', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select a video',
      properties: ['openFile'],
      filters: videoFilters
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('output:select', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select an export folder',
      properties: ['openDirectory', 'createDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
