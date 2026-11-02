// Fast portrait background removal (person segmentation).
// Reuses one MediaPipe ImageSegmenter instance across all edits.
// Model runs locally in the browser; original image is not uploaded.
const VISION_VERSION = '1.2.0';
const VISION_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + VISION_VERSION;
const SELFIE_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite';

let selfieSegmenterPromise = null;
const outputCache = new Map();
const MAX_CACHE = 3;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to open this photo'));
    image.src = src;
  });
}

function getSegmenter() {
  if (!selfieSegmenterPromise) {
    selfieSegmenterPromise = (async () => {
      const { FilesetResolver, ImageSegmenter } = await import(
        /* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/+esm'
      );
      const runtime = await FilesetResolver.forVisionTasks(VISION_CDN + '/wasm');
      return ImageSegmenter.createFromOptions(runtime, {
        baseOptions: { modelAssetPath: SELFIE_MODEL, delegate: 'CPU' },
        runningMode: 'IMAGE',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
    })().catch(error => {
      selfieSegmenterPromise = null; // retry if a first-time download failed
      throw error;
    });
  }
  return selfieSegmenterPromise;
}

export function warmPortraitSegmenter() {
  return getSegmenter().catch(() => null);
}

function toDataUrl(canvas) {
  return canvas.toDataURL('image/png');
}

export async function removePortraitBackgroundFast(source) {
  const cached = outputCache.get(source);
  if (cached) return cached;
  const [image, segmenter] = await Promise.all([loadImage(source), getSegmenter()]);

  // Keep full-resolution pixels for poster clarity, but bound memory on iPhone.
  const maxSize = 1100;
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceCtx) throw new Error('Canvas is not available');
  sourceCtx.drawImage(image, 0, 0, width, height);

  // MediaPipe returns a low-resolution person mask (index 1); smooth it to
  // the canvas resolution and keep antialiased hair/shoulder edges.
  const result = segmenter.segment(sourceCanvas);
  try {
    const masks = result.confidenceMasks || [];
    // Some MediaPipe selfie models expose only a single foreground mask.
    const mask = masks.length > 1 ? masks[1] : masks[0];
    if (!mask) throw new Error('The photo does not contain a recognizable person');
    const values = mask.getAsFloat32Array();
    const mw = mask.width;
    const mh = mask.height;
    if (!values || !mw || !mh || values.length !== mw * mh) {
      throw new Error('Invalid portrait mask');
    }
    const foregroundPixels = values.reduce((sum,value)=>sum+(value>.5?1:0),0);
    if(foregroundPixels < values.length * .002) {
      throw new Error('No portrait subject was detected');
    }
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = mw;
    maskCanvas.height = mh;
    const maskCtx = maskCanvas.getContext('2d');
    const pixels = maskCtx.createImageData(mw, mh);
    for (let i = 0; i < values.length; i++) {
      const j = i * 4;
      const probability = Math.min(1, Math.max(0, (values[i] - 0.12) / 0.68));
      pixels.data[j] = 255;
      pixels.data[j + 1] = 255;
      pixels.data[j + 2] = 255;
      pixels.data[j + 3] = Math.round(probability * 255);
    }
    maskCtx.putImageData(pixels, 0, 0);

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = width;
    outputCanvas.height = height;
    const ctx = outputCanvas.getContext('2d');
    ctx.drawImage(sourceCanvas, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(maskCanvas, 0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    const dataUrl = toDataUrl(outputCanvas);
    if (outputCache.size >= MAX_CACHE) outputCache.delete(outputCache.keys().next().value);
    outputCache.set(source, dataUrl);
    return dataUrl;
  } finally {
    result.close?.();
  }
}
