// High-quality local portrait cutouts for MSF poster photos.
// Prefer IMG.LY ISNet FP16 for detailed hair and clothing edges; keep
// lightweight MediaPipe only as a fallback on memory-constrained devices.
import { removePortraitBackgroundFast } from './fastPortraitBackground.js';

const processedCache=new Map();
const MAX_CACHE_ENTRIES=2;

function readImage(src) {
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('Unable to read the image'));
    img.src=src;
  });
}
function readBlob(blob) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(new Error('Could not read the transparent photo'));
    reader.readAsDataURL(blob);
  });
}
async function verifyTransparency(src) {
  const image=await readImage(src);
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.min(64,image.naturalWidth));
  canvas.height=Math.max(1,Math.min(64,image.naturalHeight));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw new Error('Canvas is unavailable');
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
  let transparent=0;
  let opaque=0;
  for(let i=3;i<data.length;i+=4) {
    if(data[i]<245)transparent++;
    if(data[i]>90)opaque++;
  }
  // Reject images that are fully opaque or nearly entirely transparent.
  if(transparent<data.length/4*.001||opaque<data.length/4*.003){
    throw new Error('The model did not create a valid transparent cutout');
  }
  return src;
}

export async function removePortraitBackgroundQuality(originalSource) {
  const source=String(originalSource||'');
  if(!source)throw new Error('Upload a portrait first');
  const cached=processedCache.get(source);
  if(cached)return cached;
  let result;
  let fastError;
  try {
    // MediaPipe loads a small model once and reuses it for subsequent portraits.
    result = await verifyTransparency(await removePortraitBackgroundFast(source));
  } catch (error) {
    fastError = error;
    try {
    const library=await import('@imgly/background-removal');
    const removeBackground=library.default||library.removeBackground;
    if(typeof removeBackground!=='function')throw new Error('Background remover not available');
    const blob=await removeBackground(source,{
      device:'cpu',
      model:'isnet_fp16',
      output:{format:'image/png',quality:1,type:'foreground'},
    });
    if(!(blob instanceof Blob)||!blob.size)throw new Error('No transparent PNG returned');
    result=await verifyTransparency(await readBlob(blob));
    } catch (qualityError) {
      throw new Error('Could not remove background on this device. ' +
        (qualityError?.message || fastError?.message || 'Try another portrait photo.'));
    }
  }
  if(processedCache.size>=MAX_CACHE_ENTRIES){
    processedCache.delete(processedCache.keys().next().value);
  }
  processedCache.set(source,result);
  return result;
}
