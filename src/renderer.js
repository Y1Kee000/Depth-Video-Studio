const state = {
  inputPath: null,
  outputDirectory: null,
  isProcessing: false,
  jobId: null
};

const fileName = (filePath) => filePath ? filePath.split(/[\\/]/).pop() : '';

function updateInput(path) {
  state.inputPath = path;
  document.querySelector('#video-name').textContent = path ? fileName(path) : '拖入一个视频文件';
  document.querySelector('#video-path').textContent = path || 'MP4, MOV, MKV, AVI, WEBM';
  document.querySelector('#start-button').disabled = !path || state.isProcessing;
}

function updateOutput(path) {
  state.outputDirectory = path;
  document.querySelector('#output-path').textContent = path || '默认保存到源视频所在目录';
}

async function chooseVideo() {
  const path = await window.depthStudio.selectVideo();
  if (path) updateInput(path);
}

async function chooseOutput() {
  const path = await window.depthStudio.selectOutputDirectory();
  if (path) updateOutput(path);
}

function renderProgress(percent, label) {
  document.querySelector('#progress-fill').style.width = `${percent}%`;
  document.querySelector('#progress-label').textContent = label;
  document.querySelector('#progress-value').textContent = `${percent}%`;
}

function controls() {
  return {
    quality: document.querySelector('input[name="quality"]:checked').value,
    resolution: document.querySelector('#resolution').value,
    style: document.querySelector('#style').value
  };
}

async function startProcessing() {
  if (!state.inputPath || state.isProcessing) return;

  try {
    state.isProcessing = true;
    document.querySelector('#start-button').disabled = true;
    document.querySelector('#start-button').textContent = '正在准备模型…';
    renderProgress(0, '正在启动本地深度引擎');
    const job = await window.depthStudio.startJob({
      inputPath: state.inputPath,
      outputDirectory: state.outputDirectory,
      ...controls()
    });
    state.jobId = job.jobId;
    if (!state.outputDirectory) updateOutput(job.outputDirectory);
  } catch (error) {
    finishWithError(error.message);
  }
}

function finishWithError(message) {
  state.isProcessing = false;
  state.jobId = null;
  document.querySelector('#start-button').disabled = !state.inputPath;
  document.querySelector('#start-button').textContent = '生成深度视频 ↗';
  renderProgress(0, message);
}

function handleJobProgress(event) {
  if (event.jobId !== state.jobId) return;
  if (event.type === 'progress') renderProgress(event.percent, event.message);
  if (event.type === 'completed') {
    state.isProcessing = false;
    document.querySelector('#start-button').disabled = false;
    document.querySelector('#start-button').textContent = '再次生成深度视频 ↗';
    renderProgress(100, `已完成：${event.outputPath}`);
  }
  if (event.type === 'error') finishWithError(event.message);
}

async function probeEngine() {
  const status = document.querySelector('#engine-status');
  try {
    const probe = await window.depthStudio.probeEngine();
    if (!probe.ok) throw new Error(probe.message);
    status.classList.toggle('engine-error', !probe.cuda);
    status.lastChild.textContent = probe.cuda ? ` GPU READY / ${probe.gpuName}` : ' CPU FALLBACK';
  } catch (error) {
    status.classList.add('engine-error');
    status.lastChild.textContent = ' ENGINE UNAVAILABLE';
    renderProgress(0, error.message);
  }
}

document.querySelector('#choose-video').addEventListener('click', chooseVideo);
document.querySelector('#choose-output').addEventListener('click', chooseOutput);
document.querySelector('#start-button').addEventListener('click', startProcessing);
window.depthStudio.onJobProgress(handleJobProgress);
probeEngine();

document.querySelector('#drop-zone').addEventListener('dragover', (event) => {
  event.preventDefault();
  event.currentTarget.classList.add('is-dragging');
});

document.querySelector('#drop-zone').addEventListener('dragleave', (event) => {
  event.currentTarget.classList.remove('is-dragging');
});

document.querySelector('#drop-zone').addEventListener('drop', (event) => {
  event.preventDefault();
  event.currentTarget.classList.remove('is-dragging');
  const [file] = event.dataTransfer.files;
  if (file?.path) updateInput(file.path);
});
