// Production-Ready Studio Background Removal Engine

document.addEventListener("DOMContentLoaded", () => {
  // Element Hooks
  const fileInput = document.getElementById('fileInput');
  const dropzone = document.getElementById('dropzone');
  const fileName = document.getElementById('fileName');
  const removeBtn = document.getElementById('removeBtn');
  const resetBtn = document.getElementById('resetBtn');
  const downloadBtn = document.getElementById('downloadBtn');

  const imagePreview = document.getElementById('imagePreview');
  const videoPreview = document.getElementById('videoPreview');
  const videoCanvas = document.getElementById('videoCanvas');
  const emptyState = document.getElementById('emptyState');

  const statusTitle = document.getElementById('statusTitle');
  const statusText = document.getElementById('statusText');
  const progressWrap = document.getElementById('progressWrap');
  const progressBar = document.getElementById('progressBar');
  const progressPct = document.getElementById('progressPct');

  const colorPanel = document.getElementById('colorPanel');
  const colorInput = document.getElementById('colorInput');

  let currentFile = null;
  let currentMode = 'image';
  let processedResultUrl = null;
  let isProcessing = false;
  let activeBgMode = 'transparent';

  // 1. File Upload Triggers (Label, Dropzone, FileInput)
  dropzone.addEventListener('click', (e) => {
    e.preventDefault();
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    loadSelectedFile(file);
  });

  // Drag and Drop
  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.style.borderColor = '#3b82f6';
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.style.borderColor = '';
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      loadSelectedFile(file);
    }
  });

  function loadSelectedFile(file) {
    currentFile = file;
    fileName.innerText = file.name;
    const fileUrl = URL.createObjectURL(file);

    emptyState.style.display = 'none';
    downloadBtn.disabled = true;

    if (currentMode === 'image') {
      imagePreview.src = fileUrl;
      imagePreview.style.display = 'block';
      videoPreview.style.display = 'none';
      videoCanvas.style.display = 'none';
    } else {
      videoPreview.src = fileUrl;
      videoPreview.style.display = 'block';
      imagePreview.style.display = 'none';
      videoCanvas.style.display = 'none';
      videoPreview.load();
    }

    removeBtn.disabled = false;
    statusTitle.innerText = "File Ready";
    statusText.innerText = "Click 'Remove background' to run AI analysis.";
  }

  // 2. Tab Switcher
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      currentMode = target.dataset.mode;

      resetWorkspace();

      if (currentMode === 'video') {
        fileInput.accept = 'video/mp4,video/webm,video/quicktime';
        document.getElementById('uploadHeading').innerText = 'Upload video';
        document.getElementById('uploadSub').innerText = 'MP4, WEBM, MOV';
      } else {
        fileInput.accept = 'image/*';
        document.getElementById('uploadHeading').innerText = 'Upload image';
        document.getElementById('uploadSub').innerText = 'PNG, JPG, WEBP';
      }
    });
  });

  // Background Mode (Transparent vs Solid Color)
  document.querySelectorAll('.bg-mode').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.bg-mode').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      activeBgMode = e.currentTarget.dataset.bgmode;
      if (activeBgMode === 'color') {
        colorPanel.classList.remove('hidden');
      } else {
        colorPanel.classList.add('hidden');
      }
    });
  });

  // Base64 Converter
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = err => reject(err);
    });
  }

  // Hugging Face API Request (/api/remove)
  async function requestHFCutout(base64Data) {
    const res = await fetch('/api/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64Data })
    });
    if (!res.ok) throw new Error(`Hugging Face API returned error status: ${res.status}`);
    return await res.blob();
  }

  // Anti-Flicker Temporal Alpha Filter
  function applySmoothAlphaFilter(targetCtx, maskBitmap, width, height, prevAlphaArray, factor = 0.82) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.drawImage(maskBitmap, 0, 0, width, height);

    const frameData = tCtx.getImageData(0, 0, width, height);
    const pixels = frameData.data;
    const currentAlpha = new Uint8ClampedArray(pixels.length / 4);

    for (let i = 0, j = 3; j < pixels.length; i++, j += 4) {
      let alpha = pixels[j];
      if (prevAlphaArray) {
        // Temporal blending: stabilizes edge flutter across frames
        alpha = Math.round((prevAlphaArray[i] * factor) + (alpha * (1 - factor)));
      }
      pixels[j] = alpha;
      currentAlpha[i] = alpha;
    }

    tCtx.putImageData(frameData, 0, 0);

    targetCtx.clearRect(0, 0, width, height);
    if (activeBgMode === 'color') {
      targetCtx.fillStyle = colorInput.value;
      targetCtx.fillRect(0, 0, width, height);
    }
    targetCtx.drawImage(tempCanvas, 0, 0, width, height);

    return currentAlpha;
  }

  // 3. Smooth Video Processing Pipeline
  async function executeSmoothVideoMatting(video) {
    const canvas = videoCanvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 360;

    const fps = 24;
    const duration = video.duration || 3;
    const totalFrames = Math.min(Math.floor(duration * fps), 96); // 4 seconds high-fidelity range
    const frameInterval = 1 / fps;

    progressWrap.classList.remove('hidden');
    videoPreview.style.display = 'none';
    canvas.style.display = 'block';

    // Stream Capture for High-Definition MP4/WebM Playback
    const stream = canvas.captureStream(fps);
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 6000000 // 6 Mbps studio quality
    });

    const recordedChunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.start();

    let prevAlpha = null;
    const tempCapCanvas = document.createElement('canvas');
    tempCapCanvas.width = canvas.width;
    tempCapCanvas.height = canvas.height;
    const tempCapCtx = tempCapCanvas.getContext('2d');

    for (let f = 0; f < totalFrames; f++) {
      video.currentTime = f * frameInterval;
      await new Promise(r => video.onseeked = r);

      tempCapCtx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frameBlob = await new Promise(r => tempCapCanvas.toBlob(r, 'image/jpeg', 0.92));
      const frameBase64 = await blobToBase64(frameBlob);

      // AI Analysis on current frame
      const maskBlob = await requestHFCutout(frameBase64);
      const maskImg = await createImageBitmap(maskBlob);

      // Apply Anti-Jitter Edge Blend
      prevAlpha = applySmoothAlphaFilter(ctx, maskImg, canvas.width, canvas.height, prevAlpha, 0.82);

      const percent = Math.round(((f + 1) / totalFrames) * 100);
      progressBar.style.width = `${percent}%`;
      progressPct.innerText = `${percent}%`;
      statusText.innerText = `Analyzing & smoothing frame ${f + 1} of ${totalFrames}...`;
    }

    mediaRecorder.stop();
    await new Promise(r => mediaRecorder.onstop = r);

    const finalVideoBlob = new Blob(recordedChunks, { type: 'video/webm' });
    processedResultUrl = URL.createObjectURL(finalVideoBlob);

    videoPreview.src = processedResultUrl;
    videoPreview.style.display = 'block';
    canvas.style.display = 'none';
    videoPreview.play();

    setupDownload(processedResultUrl, `smooth_cut_${currentFile.name.split('.')[0]}.webm`);
  }

  // 4. Single Image Processing Pipeline
  async function executeImageMatting(file) {
    progressWrap.classList.remove('hidden');
    progressBar.style.width = "40%";
    progressPct.innerText = "40%";
    statusText.innerText = "Processing image contours...";

    const base64Data = await blobToBase64(file);
    progressBar.style.width = "70%";
    progressPct.innerText = "70%";

    const resultBlob = await requestHFCutout(base64Data);
    processedResultUrl = URL.createObjectURL(resultBlob);

    imagePreview.src = processedResultUrl;
    progressBar.style.width = "100%";
    progressPct.innerText = "100%";

    setupDownload(processedResultUrl, `cutout_${file.name.split('.')[0]}.png`);
  }

  function setupDownload(url, filename) {
    downloadBtn.disabled = false;
    downloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
    statusTitle.innerText = "Completed Successfully!";
    statusText.innerText = "Background removed cleanly with smooth borders.";
    setTimeout(() => progressWrap.classList.add('hidden'), 600);
  }

  // Main Action Trigger
  removeBtn.addEventListener('click', async () => {
    if (!currentFile || isProcessing) return;
    isProcessing = true;
    removeBtn.disabled = true;

    try {
      if (currentMode === 'image') {
        await executeImageMatting(currentFile);
      } else {
        await executeSmoothVideoMatting(videoPreview);
      }
    } catch (err) {
      console.error(err);
      statusTitle.innerText = "Processing Error";
      statusText.innerText = "Error analyzing file. Please check file format and try again.";
      progressWrap.classList.add('hidden');
    } finally {
      isProcessing = false;
      removeBtn.disabled = false;
    }
  });

  // Workspace Reset
  function resetWorkspace() {
    currentFile = null;
    processedResultUrl = null;
    fileInput.value = '';
    fileName.innerText = "No file selected";
    imagePreview.src = '';
    videoPreview.src = '';
    imagePreview.style.display = 'none';
    videoPreview.style.display = 'none';
    videoCanvas.style.display = 'none';
    emptyState.style.display = 'block';

    removeBtn.disabled = true;
    downloadBtn.disabled = true;
    progressWrap.classList.add('hidden');
    progressBar.style.width = '0%';
    progressPct.innerText = '0%';
    statusTitle.innerText = "Ready to start";
    statusText.innerText = "Upload an image or video.";
  }

  resetBtn.addEventListener('click', resetWorkspace);
});
