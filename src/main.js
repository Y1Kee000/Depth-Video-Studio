const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const videoFilters = [
  { name: 'Video files', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'] }
];
let activeJob = null;

function workerPath() {
  return path.join(__dirname, 'worker', 'depth_worker.py');
}

function pythonCommand() {
  return process.env.DEPTH_VIDEO_PYTHON || 'python';
}

function runWorker(args, onMessage) {
  const worker = spawn(pythonCommand(), [workerPath(), ...args], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
  });
  let stderr = '';
  let buffered = '';

  worker.stdout.setEncoding('utf8');
  worker.stdout.on('data', (chunk) => {
    buffered += chunk;
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop();
    for (const line of lines) {
      try {
        onMessage(JSON.parse(line));
      } catch {
        // Worker diagnostics are kept out of the renderer event protocol.
      }
    }
  });
  worker.stderr.setEncoding('utf8');
  worker.stderr.on('data', (chunk) => { stderr += chunk; });
  return { worker, getStderr: () => stderr };
}

function assertVideoPath(filePath) {
  if (typeof filePath !== 'string' || !fs.existsSync(filePath)) {
    throw new Error('找不到输入视频。请重新选择文件。');
  }
  if (!videoFilters[0].extensions.includes(path.extname(filePath).slice(1).toLowerCase())) {
    throw new Error('输入文件不是支持的视频格式。');
  }
}

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

  ipcMain.handle('engine:probe', async () => new Promise((resolve) => {
    const messages = [];
    const { worker, getStderr } = runWorker(['--probe'], (message) => messages.push(message));
    worker.on('error', (error) => resolve({ ok: false, message: `无法启动 Python：${error.message}` }));
    worker.on('close', (code) => {
      const result = messages.find((message) => message.type === 'probe');
      resolve(result || { ok: false, message: getStderr() || `环境检查失败（退出码 ${code}）` });
    });
  }));

  ipcMain.handle('job:start', (event, options) => {
    if (activeJob) throw new Error('已有一个视频正在处理。');
    assertVideoPath(options?.inputPath);

    const outputDirectory = typeof options.outputDirectory === 'string' && options.outputDirectory
      ? options.outputDirectory
      : path.dirname(options.inputPath);
    if (!fs.existsSync(outputDirectory)) throw new Error('输出目录不存在。');

    const jobId = crypto.randomUUID();
    const config = JSON.stringify({
      inputPath: options.inputPath,
      outputDirectory,
      quality: ['fast', 'standard', 'quality'].includes(options.quality) ? options.quality : 'standard',
      resolution: ['source', '1080p', '720p'].includes(options.resolution) ? options.resolution : 'source',
      style: ['grayscale', 'false-color', 'inverse'].includes(options.style) ? options.style : 'grayscale'
    });
    const sender = event.sender;
    const { worker, getStderr } = runWorker(['--config', config], (message) => {
      sender.send('job:progress', { jobId, ...message });
    });
    activeJob = { jobId, worker };

    worker.on('error', (error) => {
      sender.send('job:progress', { jobId, type: 'error', message: `无法启动处理进程：${error.message}` });
    });
    worker.on('close', (code) => {
      if (activeJob?.jobId === jobId) activeJob = null;
      if (code !== 0) {
        sender.send('job:progress', {
          jobId,
          type: 'error',
          message: getStderr().trim() || `处理进程意外退出（退出码 ${code}）。`
        });
      }
    });
    return { jobId, outputDirectory };
  });

  ipcMain.handle('job:cancel', (_event, jobId) => {
    if (activeJob?.jobId !== jobId) return false;
    activeJob.worker.kill();
    activeJob = null;
    return true;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  activeJob?.worker.kill();
  if (process.platform !== 'darwin') app.quit();
});
