// Export exactly at 1080 x 1350 without relying on SVG foreignObject to
// rasterize portraits. iOS Safari can omit <img> content from SVG snapshots:
// capture the poster artwork, then paint every loaded image onto the real
// canvas using the same rect, object-fit and arch clipping as the preview.
import { toBlob } from 'html-to-image';

const WIDTH=1080;
const HEIGHT=1350;
const HIDDEN_CLASSES=new Set(['photo-toolbar','photo-selection-handle','joint-crop-button','ref-camera-placeholder','ref-photo-selection-ring']);

function rectRelative(rect,frame,scaleX,scaleY){
  return {x:(rect.left-frame.left)*scaleX,y:(rect.top-frame.top)*scaleY,w:rect.width*scaleX,h:rect.height*scaleY};
}

function loadBlobImage(blob){
  const url=URL.createObjectURL(blob);
  return new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve({image,dispose:()=>URL.revokeObjectURL(url)});
    image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Could not decode poster artwork'));};
    image.src=url;
  });
}

async function waitForImage(image){
  if(!image.complete){
    await new Promise((resolve,reject)=>{
      const onLoad=()=>{cleanup();resolve();};
      const onError=()=>{cleanup();reject(new Error('Photo failed to load'));};
      const cleanup=()=>{image.removeEventListener('load',onLoad);image.removeEventListener('error',onError);};
      image.addEventListener('load',onLoad,{once:true});
      image.addEventListener('error',onError,{once:true});
    });
  }
  if(!image.naturalWidth||!image.naturalHeight)throw new Error('A poster photo has not loaded; try again after it finishes loading.');
  if(typeof image.decode==='function'){
    try{await image.decode();}catch{
      if(!image.complete||!image.naturalWidth)throw new Error('A poster photo could not be decoded.');
    }
  }
}

function clipArch(ctx,rect){
  const {x,y,w,h}=rect;
  const rx=w*.49,ry=h*.39,k=.55228474983;
  ctx.beginPath();
  ctx.moveTo(x,y+h);
  ctx.lineTo(x,y+ry);
  ctx.bezierCurveTo(x,y+ry*(1-k),x+rx*(1-k),y,x+rx,y);
  ctx.lineTo(x+w-rx,y);
  ctx.bezierCurveTo(x+w-rx*(1-k),y,x+w,y+ry*(1-k),x+w,y+ry);
  ctx.lineTo(x+w,y+h);
  ctx.closePath();
  ctx.clip();
}

function imageFitPosition(value){
  const tokens=(value||'center center').trim().split(/\s+/);
  function read(v,axis){
    if(v==='left'||v==='top')return 0;
    if(v==='right'||v==='bottom')return 1;
    if(v==='center')return .5;
    if(/%$/.test(v))return Math.max(0,Math.min(1,(parseFloat(v)||0)/100));
    return .5;
  }
  if(tokens.length===1){
    if(tokens[0]==='top'||tokens[0]==='bottom')return {x:.5,y:read(tokens[0])};
    return {x:read(tokens[0]),y:.5};
  }
  return {x:read(tokens[0]),y:read(tokens[1])};
}

function drawFittedImage(ctx,image,dest,css){
  const nw=image.naturalWidth,nh=image.naturalHeight;
  if(!nw||!nh||dest.w<=0||dest.h<=0)return;
  const fit=css.objectFit||'fill';
  const pos=imageFitPosition(css.objectPosition);
  if(fit==='contain'||fit==='scale-down'){
    const scale=Math.min(dest.w/nw,dest.h/nh);
    const w=nw*scale,h=nh*scale;
    ctx.drawImage(image,dest.x+(dest.w-w)*pos.x,dest.y+(dest.h-h)*pos.y,w,h);
  }else if(fit==='cover'){
    const scale=Math.max(dest.w/nw,dest.h/nh);
    const sw=dest.w/scale,sh=dest.h/scale;
    const sx=(nw-sw)*pos.x,sy=(nh-sh)*pos.y;
    ctx.drawImage(image,sx,sy,sw,sh,dest.x,dest.y,dest.w,dest.h);
  }else{
    ctx.drawImage(image,dest.x,dest.y,dest.w,dest.h);
  }
}

// The MSF design intentionally has large white areas, so color sampling
// cannot reliably distinguish a correct render from a missing render.
// Verify that the SVG capture decodes; missing photos are composited below.

async function artworkSnapshot(frame,rect){
  const scale=WIDTH/rect.width;
  let lastError;
  for(let attempt=0;attempt<2;attempt++){
    try{
      const blob=await toBlob(frame,{
        pixelRatio:scale,
        width:rect.width,
        height:rect.height,
        backgroundColor:'#ffffff',
        cacheBust:false,
        filter:node=>{
          if(node.tagName?.toLowerCase()==='img')return false;
          if(node.classList&&[...HIDDEN_CLASSES].some(cls=>node.classList.contains(cls)))return false;
          return true;
        },
        style:{boxShadow:'none'},
      });
      if(!blob)throw new Error('The poster artwork was not rendered.');
      const {image,dispose}=await loadBlobImage(blob);
      try{
        const test=document.createElement('canvas');
        test.width=WIDTH;test.height=HEIGHT;
        const context=test.getContext('2d',{willReadFrequently:true});
        context.drawImage(image,0,0,WIDTH,HEIGHT);
        // Valid white artboards must never be rejected by a color heuristic.
        return test;
      }finally{dispose();}
    }catch(error){lastError=error;}
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  }
  throw lastError||new Error('Could not render poster background.');
}

export async function makeReliablePosterBlob(frame){
  if(!frame)throw new Error('Poster preview is not available.');
  if(document.fonts?.ready)await document.fonts.ready;
  const images=[...frame.querySelectorAll('img')];
  await Promise.all(images.map(waitForImage));
  // Force a proper layout before reading coordinates and painting.
  const bounds=frame.getBoundingClientRect();
  if(bounds.width<=0||bounds.height<=0)throw new Error('Poster has an invalid size.');
  const scaleX=WIDTH/bounds.width,scaleY=HEIGHT/bounds.height;
  const artwork=await artworkSnapshot(frame,bounds);
  const canvas=document.createElement('canvas');
  canvas.width=WIDTH;canvas.height=HEIGHT;
  const context=canvas.getContext('2d',{alpha:false});
  if(!context)throw new Error('Your browser cannot export a PNG image.');
  context.drawImage(artwork,0,0,WIDTH,HEIGHT);

  // Restore the real photos as native canvas pixels. Transparent removed-BG
  // cutouts retain their alpha and sit on top of the green arch background.
  for(const image of images){
    const css=getComputedStyle(image);
    if(css.display==='none'||css.visibility==='hidden'||Number(css.opacity)===0)continue;
    const photoFrame=image.closest('.ref-portrait');
    const sourceRect=image.getBoundingClientRect();
    const dest=rectRelative(sourceRect,bounds,scaleX,scaleY);
    context.save();
    if(photoFrame){
      const frameRect=rectRelative(photoFrame.getBoundingClientRect(),bounds,scaleX,scaleY);
      if(photoFrame.classList.contains('ref-portrait-popout')){
        context.beginPath();
        context.rect(frameRect.x,frameRect.y-frameRect.h*.42,frameRect.w,frameRect.h*1.42);
        context.clip();
      }else{
        clipArch(context,frameRect);
      }
    }
    try{
      drawFittedImage(context,image,dest,css);
    }catch(error){
      context.restore();
      throw new Error('Could not draw an uploaded poster photo: '+(error?.message||'Unknown error'));
    }
    context.restore();
  }

  const result=await new Promise((resolve,reject)=>{
    canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG encoding failed')),'image/png');
  });
  if(!result.size)throw new Error('Exported image was empty.');
  return result;
}
