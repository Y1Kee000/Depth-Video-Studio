const state = {
  inputPath: null,
  outputDirectory: null,
  isProcessing: false
};

const fileName = (filePath) => filePath ? filePath.split(/[\\/]/).pop() : '';

function updateInput(path) {
  state.inputPath = path;
  document.querySelector('#video-name').textContent = path ? fileName(path) : 'Drop a video here';
  document.querySelector('#video-path').textContent = path || 'MP4, MOV, MKV, AVI, WEBM';
  document.querySelector('#start-button').disabled = !path || state.isProcessing;
}

function updateOutput(path) {
  state.outputDirectory = path;
  document.querySelector('#output-path').textContent = path || 'Choose where depth videos are saved';
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

function startProcessing() {
  if (!state.inputPath || state.isProcessing) return;

  state.isProcessing = true;
  document.querySelector('#start-button').disabled = true;
  document.querySelector('#start-button').textContent = 'Processing pipeline pending';
  renderProgress(0, 'The inference engine will be connected in the next milestone');
}

document.querySelector('#choose-video').addEventListener('click', chooseVideo);
document.querySelector('#choose-output').addEventListener('click', chooseOutput);
document.querySelector('#start-button').addEventListener('click', startProcessing);

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
