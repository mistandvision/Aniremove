// Base64 helper
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
  });
}

// Main AI processing function (Calls Vercel API with HF_TOKEN)
async function processWithHuggingFace(file) {
  const statusText = document.getElementById('status-text');
  if (statusText) statusText.innerText = "Uploading to AI server... Please wait.";

  try {
    const base64Data = await fileToBase64(file);

    const res = await fetch('/api/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64Data })
    });

    if (!res.ok) {
      throw new Error(`AI processing failed with status ${res.status}`);
    }

    const blob = await res.blob();
    const resultUrl = URL.createObjectURL(blob);

    // Update image preview if present
    const previewImg = document.getElementById('output-image');
    if (previewImg) previewImg.src = resultUrl;

    if (statusText) statusText.innerText = "Background successfully removed!";
    return resultUrl;
  } catch (err) {
    console.error("AI Error:", err);
    if (statusText) statusText.innerText = "Processing error. Please try again.";
  }
}

// Auto wire file upload inputs on page load
document.addEventListener("DOMContentLoaded", () => {
  const fileInputs = document.querySelectorAll('input[type="file"]');
  fileInputs.forEach(input => {
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        processWithHuggingFace(file);
      }
    });
  });
});
