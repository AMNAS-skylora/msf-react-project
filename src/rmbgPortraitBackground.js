// Browser-side Hugging Face Transformers.js + BRIA RMBG-1.4 background removal.
// RMBG weights are licensed for NON-COMMERCIAL use. Commercial deployment
// requires an agreement with BRIA: https://huggingface.co/briaai/RMBG-1.4
//
// The pinned ESM CDN import intentionally avoids adding a dependency to this
// project's existing (out-of-sync) npm lockfile. It is loaded only after a user
// clicks Remove BG. Model weights are cached by Transformers.js in the browser.
const MODEL_ID = 'briaai/RMBG-1.4';
const MAX_IMAGE_EDGE = 1400;
let removerPromise = null;

function openImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Cannot open the selected photo'));
    image.src = src;
  });
}

function createImageCanvas(image) {
  // Keep source-photo detail for the 1080px poster, while avoiding huge iPhone
  // allocations when users upload full-resolution camera photographs.
  const longest = Math.max(image.naturalWidth, image.naturalHeight);
  if (!longest) throw new Error('The selected photo is empty');
  const scale = Math.min(1, MAX_IMAGE_EDGE / longest);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available on this device');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function getRemover() {
  if (!removerPromise) {
    removerPromise = (async () => {
      // Vite supports this remote URL when explicitly excluded from bundling.
      // Pinned version keeps the app's npm dependencies and build unchanged.
      const { pipeline, env } = await import(
        /* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm'
      );
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      // Quantized ONNX RMBG-1.4 is ~44 MB. WASM works without WebGPU.
      return pipeline('background-removal', MODEL_ID, {
        device: 'wasm',
        dtype: 'q8',
      });
    })().catch(error => {
      // Permit a later retry after an offline, CDN or model-download error.
      removerPromise = null;
      throw error;
    });
  }
  return removerPromise;
}

export async function removePortraitBackgroundRMBG(source) {
  if (!source) throw new Error('Upload a portrait before removing its background');

  const original = await openImage(source);
  const resized = createImageCanvas(original);
  const remover = await getRemover();
  // RMBG operates on local image data. No uploaded photo is sent to a server.
  const output = await remover(resized.toDataURL('image/png'));
  const cutout = Array.isArray(output) ? output[0] : output;

  // The Transformers.js background-removal task returns an RGBA RawImage.
  // Never treat a grayscale prediction as a completed transparent PNG.
  if (!cutout || cutout.channels !== 4 ||
      !Number.isFinite(cutout.width) || !Number.isFinite(cutout.height) ||
      cutout.width <= 0 || cutout.height <= 0 ||
      !cutout.data || cutout.data.length !== cutout.width * cutout.height * 4) {
    throw new Error('The RMBG model did not return a transparent RGBA image');
  }

  const canvas = document.createElement('canvas');
  canvas.width = cutout.width;
  canvas.height = cutout.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available on this device');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(cutout.data), cutout.width, cutout.height), 0, 0);
  return canvas.toDataURL('image/png');
}
