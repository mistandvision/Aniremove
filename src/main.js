// Complete UI & Processing Engine

document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const fileInput = document.getElementById('fileInput');
  const dropzone = document.getElementById('dropzone');
  const fileName = document.getElementById('fileName');
  const removeBtn = document.getElementById('removeBtn');
  const resetBtn = document.getElementById('resetBtn');
  const playBtn = document.getElementById('playBtn');
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

  let currentFile = null;
  let currentMode = 'image';
  let processedResultUrl = null;

  // 1. Dropzone click se seedhe file input trigger karna
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => {
      fileInput.click();
    });
  }

  // 2. Tab switching (Image vs Video)
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      tabs.forEach(t => t.classList.remove('active'));
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

  // 3. File Selection Handle
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      currentFile = file;
      if (fileName) fileName.innerText = file.name;

      const fileUrl = URL.createObjectURL(file);

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

      if (emptyState) emptyState.style.display = 'none';
      if (removeBtn) removeBtn.disabled = false;
      if (statusTitle) statusTitle.innerText = "File loaded";
      if (statusText) statusText.innerText = "Click 'Remove background' to begin.";
    });
  }

  // Drag and Drop support
  if (dropzone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      }, false);
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files.length && fileInput) {
        fileInput.files = files;
        fileInput.dispatchEvent(new Event('change'));
      }
    });
  }

  // Helper: File to Base64
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = (err) => reject(err);
    });
  }

  // Process Button Click
  if (removeBtn) {
    removeBtn.addEventListener('click', async () => {
      if (!currentFile) return;

      removeBtn.disabled = true;
      if (progressWrap) progressWrap.classList.remove('hidden');
      if (progressBar) progressBar.style.width = '30%';
      if (progressPct) progressPct.innerText = '30%';
      if (statusTitle) statusTitle.innerText = "Processing...";
      if (statusText) statusText.innerText = "Sending file to server...";

      try {
        const base64Data = await fileToBase64(currentFile);

        if (progressBar) progressBar.style.width = '60%';
        if (progressPct) progressPct.innerText = '60%';
        if (statusText) statusText.innerText = "AI removing background...";

        const response = await fetch('/api/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64Data })
        });

        if (!response.ok) {
          throw new Error(`Server returned status: ${response.status}`);
        }

        const blob = await response.blob();
        processedResultUrl = URL.createObjectURL(blob);

        if (progressBar) progressBar.style.width = '100%';
        if (progressPct) progressPct.innerText = '100%';

        if (currentMode === 'image') {
          imagePreview.src = processedResultUrl;
        } else {
          videoPreview.src = processedResultUrl;
          videoPreview.play();
        }

        if (statusTitle) statusTitle.innerText = "Success!";
        if (statusText) statusText.innerText = "Background removed cleanly.";

        if (downloadBtn) {
          downloadBtn.disabled = false;
          downloadBtn.onclick = () => {
            const a = document.createElement('a');
            a.href = processedResultUrl;
            a.download = `removed_${currentFile.name}`;
            a.click();
          };
        }
      } catch (err) {
        console.error(err);
        if (statusTitle) statusTitle.innerText = "Error";
        if (statusText) statusText.innerText = "Processing me dikat aayi. Dobara koshish karein.";
      } finally {
        removeBtn.disabled = false;
        setTimeout(() => {
          if (progressWrap) progressWrap.classList.add('hidden');
        }, 1000);
      }
    });
  }

  // Reset Function
  function resetWorkspace() {
    currentFile = null;
    processedResultUrl = null;
    if (fileInput) fileInput.value = '';
    if (fileName) fileName.innerText = "No file selected";
    if (imagePreview) {
      imagePreview.src = '';
      imagePreview.style.display = 'none';
    }
    if (videoPreview) {
      videoPreview.src = '';
      videoPreview.style.display = 'none';
    }
    if (videoCanvas) videoCanvas.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';

    if (removeBtn) removeBtn.disabled = true;
    if (downloadBtn) downloadBtn.disabled = true;
    if (progressWrap) progressWrap.classList.add('hidden');
    if (statusTitle) statusTitle.innerText = "Ready to start";
    if (statusText) statusText.innerText = "Upload an image or video.";
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', resetWorkspace);
  }
});
