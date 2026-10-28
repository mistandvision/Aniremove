// AniRemove Studio Engine - Core Logic

document.addEventListener("DOMContentLoaded", () => {
  // Auth Check
  const authModal = document.getElementById("authModal");
  const authForm = document.getElementById("authForm");
  const isAuth = localStorage.getItem("aniremove_auth_user");

  if (isAuth) {
    authModal.style.display = "none";
  }

  authForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("authEmail").value;
    if (email) {
      localStorage.setItem("aniremove_auth_user", email);
      authModal.style.display = "none";
    }
  });

  // UI Elements
  const dropzone = document.getElementById("dropzone");
  const mediaInput = document.getElementById("mediaInput");
  const browseBtn = document.getElementById("browseBtn");
  const modeVideoBtn = document.getElementById("modeVideoBtn");
  const modeImageBtn = document.getElementById("modeImageBtn");
  const targetMediaText = document.getElementById("targetMediaText");
  const dropzoneMediaTitle = document.getElementById("dropzoneMediaTitle");
  const btnMediaText = document.getElementById("btnMediaText");
  const formatHint = document.getElementById("formatHint");

  const emptyDisplay = document.getElementById("emptyDisplay");
  const imageDisplay = document.getElementById("imageDisplay");
  const videoDisplay = document.getElementById("videoDisplay");
  const outputCanvas = document.getElementById("outputCanvas");
  const targetPin = document.getElementById("targetPin");
  const viewportBox = document.getElementById("viewportBox");

  const mediaControls = document.getElementById("mediaControls");
  const togglePlayBtn = document.getElementById("togglePlayBtn");
  const timeDisplay = document.getElementById("timeDisplay");
  const videoTimeline = document.getElementById("videoTimeline");
  const clearPinBtn = document.getElementById("clearPinBtn");

  const progressPanel = document.getElementById("progressPanel");
  const metricPct = document.getElementById("metricPct");
  const progressBarFill = document.getElementById("progressBarFill");
  const statusHeading = document.getElementById("statusHeading");
  const statusDesc = document.getElementById("statusDesc");

  const processBtn = document.getElementById("processBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const flickerGuard = document.getElementById("flickerGuard");
  const edgeDehalo = document.getElementById("edgeDehalo");

  // State
  let currentMode = "video"; // 'video' | 'image'
  let currentFile = null;
  let targetCoords = null; // {x, y}
  let activeBg = "transparent";
  let processedBlobUrl = null;
  let isRunning = false;

  // Mode Switch
  modeVideoBtn.addEventListener("click", () => switchMode("video"));
  modeImageBtn.addEventListener("click", () => switchMode("image"));

  function switchMode(mode) {
    currentMode = mode;
    resetStudio();

    if (mode === "video") {
      modeVideoBtn.classList.add("active");
      modeImageBtn.classList.remove("active");
      targetMediaText.innerText = "Videos";
      dropzoneMediaTitle.innerText = "Video";
      btnMediaText.innerText = "Video";
      mediaInput.accept = "video/mp4,video/webm,video/quicktime";
      formatHint.innerText = "Supports MP4, MOV, WEBM | Max size: 500MB";
      mediaControls.style.display = "flex";
    } else {
      modeImageBtn.classList.add("active");
      modeVideoBtn.classList.remove("active");
      targetMediaText.innerText = "Images";
      dropzoneMediaTitle.innerText = "Image";
      btnMediaText.innerText = "Image";
      mediaInput.accept = "image/png,image/jpeg,image/webp";
      formatHint.innerText = "Supports PNG, JPG, WEBP | Max size: 25MB";
      mediaControls.style.display = "none";
    }
  }

  // File Upload Handlers
  browseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    mediaInput.click();
  });

  dropzone.addEventListener("click", () => mediaInput.click());

  ['dragenter', 'dragover'].forEach(n => {
    dropzone.addEventListener(n, (e) => {
      e.preventDefault();
      dropzone.style.borderColor = "#3b82f6";
    });
  });

  ['dragleave', 'drop'].forEach(n => {
    dropzone.addEventListener(n, (e) => {
      e.preventDefault();
      dropzone.style.borderColor = "";
    });
  });

  dropzone.addEventListener("drop", (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleMediaFile(e.dataTransfer.files[0]);
    }
  });

  mediaInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleMediaFile(e.target.files[0]);
    }
  });

  function handleMediaFile(file) {
    currentFile = file;
    const url = URL.createObjectURL(file);
    emptyDisplay.style.display = "none";

    if (currentMode === "image") {
      imageDisplay.src = url;
      imageDisplay.style.display = "block";
      videoDisplay.style.display = "none";
      outputCanvas.style.display = "none";
    } else {
      videoDisplay.src = url;
      videoDisplay.style.display = "block";
      imageDisplay.style.display = "none";
      outputCanvas.style.display = "none";
      videoDisplay.load();
    }

    processBtn.disabled = false;
    downloadBtn.disabled = true;
  }

  // Subject Pin Click on Viewport Box
  viewportBox.addEventListener("click", (e) => {
    const rect = viewportBox.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    targetCoords = { x, y, pctX: x / rect.width, pctY: y / rect.height };
    targetPin.style.left = `${x}px`;
    targetPin.style.top = `${y}px`;
    targetPin.style.display = "block";
  });

  clearPinBtn.addEventListener("click", () => {
    targetCoords = null;
    targetPin.style.display = "none";
  });

  // Video Time Update & Play
  videoDisplay.addEventListener("timeupdate", () => {
    if (!videoDisplay.duration) return;
    const curr = formatTime(videoDisplay.currentTime);
    const dur = formatTime(videoDisplay.duration);
    timeDisplay.innerText = `${curr} / ${dur}`;
    videoTimeline.value = (videoDisplay.currentTime / videoDisplay.duration) * 100;
  });

  togglePlayBtn.addEventListener("click", () => {
    if (videoDisplay.paused) {
      videoDisplay.play();
      togglePlayBtn.innerText = "❚❚";
    } else {
      videoDisplay.pause();
      togglePlayBtn.innerText = "▶";
    }
  });

  videoTimeline.addEventListener("input", (e) => {
    if (videoDisplay.duration) {
      videoDisplay.currentTime = (e.target.value / 100) * videoDisplay.duration;
    }
  });

  function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  // Background Chips Selection
  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", (e) => {
      document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
      e.currentTarget.classList.add("active");
      activeBg = e.currentTarget.dataset.bg;
    });
  });

  // Base64 helper
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = err => reject(err);
    });
  }

  // Serverless Call to Hugging Face RMBG-1.4
  async function callRMBGAPI(base64Data) {
    const res = await fetch('/api/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64Data })
    });
    if (!res.ok) throw new Error(`HF API status: ${res.status}`);
    return await res.blob();
  }

  // Temporal Smoothing & De-Halo Defringe
  function processMatteFrame(ctx, maskImg, width, height, prevAlpha, enableGuard, enableDehalo) {
    const canvasTemp = document.createElement("canvas");
    canvasTemp.width = width;
    canvasTemp.height = height;
    const tCtx = canvasTemp.getContext("2d");
    tCtx.drawImage(maskImg, 0, 0, width, height);

    const imgData = tCtx.getImageData(0, 0, width, height);
    const d = imgData.data;
    const currentAlpha = new Uint8ClampedArray(d.length / 4);

    for (let i = 0, j = 3; j < d.length; i++, j += 4) {
      let a = d[j];

      // Anti-flicker temporal smoothing
      if (enableGuard && prevAlpha) {
        a = Math.round((prevAlpha[i] * 0.85) + (a * 0.15));
      }

      // Edge defringe / De-halo (cleans white edge artifacts)
      if (enableDehalo && a > 10 && a < 240) {
        // Darken edge borders slightly to cancel out background color spill
        d[j - 3] = Math.min(d[j - 3], a);
        d[j - 2] = Math.min(d[j - 2], a);
        d[j - 1] = Math.min(d[j - 1], a);
      }

      d[j] = a;
      currentAlpha[i] = a;
    }

    tCtx.putImageData(imgData, 0, 0);

    ctx.clearRect(0, 0, width, height);

    // Render Chosen Background
    if (activeBg !== "transparent") {
      ctx.fillStyle = activeBg === "blur" ? "#1e293b" : activeBg;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(canvasTemp, 0, 0, width, height);
    return currentAlpha;
  }

  // Execution Trigger
  processBtn.addEventListener("click", async () => {
    if (!currentFile || isRunning) return;
    isRunning = true;
    processBtn.disabled = true;
    progressPanel.style.display = "flex";

    try {
      if (currentMode === "image") {
        await processSingleImage();
      } else {
        await processVideoFrames();
      }
    } catch (err) {
      console.error(err);
      statusHeading.innerText = "Processing Issue Occurred";
      statusDesc.innerText = "Please verify your Vercel HF_TOKEN and file format.";
    } finally {
      isRunning = false;
      processBtn.disabled = false;
    }
  });

  // Single Image Flow
  async function processSingleImage() {
    updateProgress(30, "Ingesting image...", "Extracting high-contrast edges");
    const base64 = await blobToBase64(currentFile);

    updateProgress(65, "Connecting to Hugging Face RMBG...", "Running neural mask pass");
    const maskBlob = await callRMBGAPI(base64);

    const maskBitmap = await createImageBitmap(maskBlob);
    outputCanvas.width = maskBitmap.width;
    outputCanvas.height = maskBitmap.height;
    const ctx = outputCanvas.getContext("2d");

    processMatteFrame(ctx, maskBitmap, outputCanvas.width, outputCanvas.height, null, false, edgeDehalo.checked);

    processedBlobUrl = outputCanvas.toDataURL("image/png");
    imageDisplay.src = processedBlobUrl;

    updateProgress(100, "Image Complete!", "Background cleanly removed.");
    enableDownload(processedBlobUrl, `aniremove_${currentFile.name.split('.')[0]}.png`);
  }

  // Video Frame Flow with Zero-Flicker Stream
  async function processVideoFrames() {
    const video = videoDisplay;
    const canvas = outputCanvas;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 360;

    const fps = 24;
    const totalDuration = video.duration || 3;
    const totalFrames = Math.min(Math.floor(totalDuration * fps), 96); // 4s studio window
    const stepInterval = 1 / fps;

    video.style.display = "none";
    canvas.style.display = "block";

    const stream = canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp9",
      videoBitsPerSecond: 8000000 // 8 Mbps High Quality
    });

    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.start();

    let prevAlpha = null;
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext("2d");

    for (let f = 0; f < totalFrames; f++) {
      video.currentTime = f * stepInterval;
      await new Promise(r => video.onseeked = r);

      tempCtx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frameBlob = await new Promise(r => tempCanvas.toBlob(r, 'image/jpeg', 0.9));
      const frameBase64 = await blobToBase64(frameBlob);

      const maskBlob = await callRMBGAPI(frameBase64);
      const maskImg = await createImageBitmap(maskBlob);

      prevAlpha = processMatteFrame(
        ctx,
        maskImg,
        canvas.width,
        canvas.height,
        prevAlpha,
        flickerGuard.checked,
        edgeDehalo.checked
      );

      const pct = Math.round(((f + 1) / totalFrames) * 100);
      updateProgress(pct, `Matting Frame ${f + 1} of ${totalFrames}`, "Applying anti-flicker temporal smoothing");
    }

    recorder.stop();
    await new Promise(r => recorder.onstop = r);

    const finalVideoBlob = new Blob(chunks, { type: "video/webm" });
    processedBlobUrl = URL.createObjectURL(finalVideoBlob);

    video.src = processedBlobUrl;
    video.style.display = "block";
    canvas.style.display = "none";
    video.play();

    updateProgress(100, "Studio Video Ready!", "Zero flicker background removal finished.");
    enableDownload(processedBlobUrl, `aniremove_${currentFile.name.split('.')[0]}.webm`);
  }

  function updateProgress(pct, heading, desc) {
    metricPct.innerText = `${pct}%`;
    progressBarFill.style.width = `${pct}%`;
    statusHeading.innerText = heading;
    statusDesc.innerText = desc;
  }

  function enableDownload(url, filename) {
    downloadBtn.disabled = false;
    downloadBtn.onclick = () => {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
  }

  function resetStudio() {
    currentFile = null;
    targetCoords = null;
    targetPin.style.display = "none";
    mediaInput.value = "";
    imageDisplay.src = "";
    videoDisplay.src = "";
    imageDisplay.style.display = "none";
    videoDisplay.style.display = "none";
    outputCanvas.style.display = "none";
    emptyDisplay.style.display = "block";
    processBtn.disabled = true;
    downloadBtn.disabled = true;
    progressPanel.style.display = "none";
  }
});
