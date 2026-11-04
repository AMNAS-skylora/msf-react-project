// MSF poster photo background removal: BRIA RMBG-1.4 via Transformers.js first.
// Keep existing MediaPipe and IMG.LY implementations as device/network fallbacks.
// RMBG-1.4 model weights are for non-commercial use unless licensed by BRIA.
import { removePortraitBackgroundRMBG } from './rmbgPortraitBackground.js';
import { removePortraitBackgroundFast } from './fastPortraitBackground.js';

const processedCache = new Map();
const MAX_CACHE_ENTRIES = 2;

function readImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to read the image'));
    img.src = src;
  });
}

function readBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the transparent photo'));
    reader.readAsDataURL(blob);
  });
}

async function verifyTransparency(src) {
  const image = await readImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.min(64, image.naturalWidth));
  canvas.height = Math.max(1, Math.min(64, image.naturalHeight));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is unavailable');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let transparent = 0;
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 245) transparent++;
    if (data[i] > 90) opaque++;
  }
  const totalPixels = data.length / 4;
  if (transparent < totalPixels * .001 || opaque < totalPixels * .003) {
    throw new Error('The model did not create a valid transparent cutout');
  }
  return src;
}

async function removeWithImgly(source) {
  const library = await import('@imgly/background-removal');
  const removeBackground = library.default || library.removeBackground;
  if (typeof removeBackground !== 'function') {
    throw new Error('IMG.LY background remover unavailable');
  }
  const blob = await removeBackground(source, {
    device: 'cpu',
    model: 'isnet_fp16',
    output: { format: 'image/png', quality: 1, type: 'foreground' },
  });
  if (!(blob instanceof Blob) || !blob.size) {
    throw new Error('No transparent PNG returned');
  }
  return readBlob(blob);
}

export async function removePortraitBackgroundQuality(originalSource, onStatus) {
  const source = String(originalSource || '');
  if (!source) throw new Error('Upload a portrait first');
  const cached = processedCache.get(source);
  if (cached) return cached;

  const methods = [
    {
      label: 'RMBG AI',
      status: 'Loading RMBG AI… First use downloads the model. Your photo stays on your device.',
      run: removePortraitBackgroundRMBG,
    },
    {
      label: 'MediaPipe',
      status: 'RMBG unavailable. Trying the lightweight device model…',
      run: removePortraitBackgroundFast,
    },
    {
      label: 'IMG.LY',
      status: 'Trying the alternative background remover…',
      run: removeWithImgly,
    },
  ];

  const errors = [];
  for (const method of methods) {
    try {
      onStatus?.(method.status);
      const result = await verifyTransparency(await method.run(source));
      if (processedCache.size >= MAX_CACHE_ENTRIES) {
        processedCache.delete(processedCache.keys().next().value);
      }
      processedCache.set(source, result);
      return result;
    } catch (error) {
      errors.push(method.label + ': ' + (error?.message || 'unavailable'));
      console.warn(method.label + ' background removal unavailable:', error);
    }
  }

  throw new Error('Could not remove the background on this device. ' +
    errors[errors.length - 1]);
}
