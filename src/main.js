// Function: AI Background Removal using in-browser WebAssembly/GPU
async function removeBackgroundAI(imageSource) {
  const statusText = document.getElementById('status-text'); // aapke UI ka status element
  if (statusText) statusText.innerText = "AI processing image... Please wait.";

  try {
    // Ye direct browser ke andar AI model chala kar background remove karega
    const blob = await window.imglyRemoveBackground(imageSource, {
      progress: (key, current, total) => {
        const percent = Math.round((current / total) * 100);
        if (statusText) statusText.innerText = `Loading AI Engine: ${percent}%`;
      }
    });

    // Output transparent PNG image ka URL
    const resultUrl = URL.createObjectURL(blob);
    
    // Result image preview me dikhana
    const previewImg = document.getElementById('output-image'); // aapke UI ka preview ID
    if (previewImg) {
      previewImg.src = resultUrl;
    }
    
    if (statusText) statusText.innerText = "Background successfully removed!";
    return resultUrl;
  } catch (error) {
    console.error("AI Removal Error:", error);
    if (statusText) statusText.innerText = "Error removing background. Try another image.";
  }
}
