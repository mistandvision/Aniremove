# BGRemover AI — free browser-based prototype

A no-subscription, no-premium local web app for image background removal and video subject selection.

## Run it on Windows
1. Install Node.js LTS from https://nodejs.org/.
2. Extract this ZIP.
3. Open the extracted `BGRemover-AI` folder. Click the File Explorer address bar, type `cmd`, and press Enter.
4. Run `npm install` and wait for it to finish.
5. Run `npm run dev`.
6. Open the exact Local URL Vite prints, usually `http://localhost:5173/`.

Keep the terminal open while using the app. An internet connection is needed on first use to fetch the free AI model files and packages. Processing runs in the browser; media is not uploaded to a paid background-removal API.

## Current capabilities and limits
- Image mode uses `@imgly/background-removal` to create a transparent cutout.
- Video mode uses MediaPipe Interactive Segmenter (Magic Touch). Click a visible person or object in the preview to tell the model what to preserve; the mask is recalculated while the video plays.
- Background can be transparent, a solid color, or a custom image in the preview.
- Video export is WebM and is recorded in real time. Keep the tab open until the recording finishes.
- This is a prototype, not a guarantee of perfect segmentation. Complex edges, fast movement, occlusion, or multiple similar objects can cause mask errors. The interactive model can also behave differently across subjects. Video audio is not currently preserved in export.
- The app is free to use and has no premium tier or payment flow. Model downloads and processing use your device and internet/data allowance.
