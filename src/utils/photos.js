// Compress uploads for browser-only editing while retaining transparency when possible.
export function fileToOptimizedDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Choose an image file.'));
    if (file.size > 8 * 1024 * 1024) return reject(new Error('Photo must be under 8 MB.'));
    const image = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read that photo.'));
    reader.onload = () => { image.src = String(reader.result); };
    image.onerror = () => reject(new Error('Unable to open that photo.'));
    image.onload = () => {
      const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      const transparent = /png|webp/i.test(file.type);
      resolve(canvas.toDataURL(transparent ? 'image/png' : 'image/jpeg', .85));
    };
    reader.readAsDataURL(file);
  });
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Unable to process image.'));
    reader.readAsDataURL(blob);
  });
}

export function downloadPhoto(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}
