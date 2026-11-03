// Export crisp 4:5 posters at 1080, 2160 or 3240px wide.
// rasterize portraits. iOS Safari can omit <img> content from SVG snapshots:
// capture the poster artwork, then paint every loaded image onto the real
// canvas using the same rect, object-fit and arch clipping as the preview.
import { toBlob } from 'html-to-image';

const BASE_WIDTH=1080;
const BASE_HEIGHT=1350;
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

// Load the actual poster CSS background as a separate, full-resolution layer.
// A missing image must cause an explicit error instead of a blank exported PNG.
async function loadPosterBackground(frame){
  const poster=frame.querySelector('.ref-poster');
  if(!poster)throw new Error('Poster artwork was not found.');
  const css=getComputedStyle(poster).backgroundImage;
  const match=css.match(/url\(["']?([^"')]+)["']?\)/);
  const source=match?.[1] || '/background/msf_background.png';
  const image=new Image();
  image.decoding='async';
  // Same-origin /public image: never fetch an unrelated remote asset.
  return new Promise((resolve,reject)=>{
    image.onload=()=>image.naturalWidth && image.naturalHeight
      ? resolve(image)
      : reject(new Error('Poster background image is empty.'));
    image.onerror=()=>reject(new Error('Poster background did not load: '+source));
    image.src=source;
  });
}

// iOS Safari can refuse SVG foreignObject rasterization altogether.
// A native-canvas fallback still yields a usable, complete image with all
// leadership photographs, names, the poster grid and rounded green arches.
async function nativeArtworkSnapshot(frame,rect,dimensions){
  const {width:WIDTH,height:HEIGHT}=dimensions;
  const canvas=document.createElement('canvas');
  canvas.width=WIDTH;
  canvas.height=HEIGHT;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Canvas is unavailable in this browser.');
  const scaleX=WIDTH/rect.width;
  const scaleY=HEIGHT/rect.height;
  // Intentionally transparent. The original background image is drawn
  // behind this artwork after SVG capture or native fallback finishes.

  for(const button of frame.querySelectorAll('.ref-portrait')){
    const r=rectRelative(button.getBoundingClientRect(),rect,scaleX,scaleY);
    if(r.w<=0||r.h<=0)continue;
    ctx.save();
    clipArch(ctx,r);
    // In Safari's native-canvas fallback, match the visible poster palette.
    // All member groups use the same solid muted-olive arch fill.
    ctx.fillStyle='#A5AD70';
    ctx.fillRect(r.x,r.y,r.w,r.h);
    ctx.restore();
  }
  for(const heading of frame.querySelectorAll('.ref-officer-group-heading,.ref-executive-heading')){
    const r=rectRelative(heading.getBoundingClientRect(),rect,scaleX,scaleY);
    ctx.fillStyle='rgba(25,105,58,.25)';
    ctx.fillRect(r.x,r.y+r.h-1,r.w,1);
  }

  const selectors=[
    '.ref-title p','.ref-title h1',
    '.ref-officer-group-heading','.ref-executive-heading',
    '.ref-section-heading span',
    '.ref-extra-header small','.ref-extra-header h1','.ref-extra-header p',
    '.ref-profile-role','.ref-profile-name span',
    '.ref-footer-organization','.ref-footer-message'
  ];
  const visited=new Set();
  for(const element of frame.querySelectorAll(selectors.join(','))){
    if(visited.has(element))continue;
    visited.add(element);
    const css=getComputedStyle(element);
    if(css.display==='none'||css.visibility==='hidden')continue;
    const r=rectRelative(element.getBoundingClientRect(),rect,scaleX,scaleY);
    if(r.w<1||r.h<1)continue;
    const raw=element.textContent||'';
    if(!raw.trim())continue;
    const lines=raw.split(/\n/).map(line=>line.trim()).filter(Boolean);
    const fontSize=(parseFloat(css.fontSize)||12)*scaleX;
    const lineHeight=(parseFloat(css.lineHeight)||fontSize/scaleX*1.15)*scaleY;
    const weight=css.fontWeight||'700';
    ctx.save();
    ctx.fillStyle=css.color||'#173d29';
    ctx.font=`${weight} ${fontSize}px ${css.fontFamily||'sans-serif'}`;
    ctx.textAlign=css.textAlign==='center'?'center':css.textAlign==='right'?'right':'left';
    ctx.textBaseline='middle';
    const x=ctx.textAlign==='center'?r.x+r.w/2:ctx.textAlign==='right'?r.x+r.w:r.x;
    lines.forEach((line,index)=>{
      let size=fontSize;
      while(ctx.measureText(line).width>r.w && size>Math.max(8,fontSize*.57)){
        size-=1;
        ctx.font=`${weight} ${size}px ${css.fontFamily||'sans-serif'}`;
      }
      const y=r.y+Math.min(r.h/2,Math.max(lineHeight/2,8))+index*lineHeight;
      ctx.fillText(line,x,y,Math.max(r.w,1));
    });
    ctx.restore();
  }
  return canvas;
}

// Probe a real on-poster frame instead of random white-background points.
// SVG rasterization sometimes succeeds but returns a blank white bitmap on
// iOS Safari. The green arch remains visible after images are filtered out.
function snapshotContainsArtwork(context,frame,rect,dimensions){
  const {width:WIDTH,height:HEIGHT}=dimensions;
  const sx=WIDTH/rect.width,sy=HEIGHT/rect.height;
  const targets=[...frame.querySelectorAll('.ref-portrait')].slice(0,8);
  if(!targets.length)return true;
  for(const target of targets){
    const r=rectRelative(target.getBoundingClientRect(),rect,sx,sy);
    if(r.w<4||r.h<4)continue;
    const x=Math.max(0,Math.min(WIDTH-1,Math.round(r.x+r.w*.5)));
    const y=Math.max(0,Math.min(HEIGHT-1,Math.round(r.y+r.h*.6)));
    const pixels=context.getImageData(x,y,1,1).data;
    if(pixels[3]>100 &&
       (Math.min(pixels[0],pixels[1],pixels[2])<218 ||
        Math.max(pixels[0],pixels[1],pixels[2])-Math.min(pixels[0],pixels[1],pixels[2])>35)){
      return true;
    }
  }
  return false;
}

async function artworkSnapshot(frame,rect,dimensions){
  const {width:WIDTH,height:HEIGHT}=dimensions;
  const scale=WIDTH/rect.width;
  let lastError;
  for(let attempt=0;attempt<2;attempt++){
    try{
      const blob=await toBlob(frame,{
        pixelRatio:scale,
        width:rect.width,
        height:rect.height,
        backgroundColor:'transparent',
        cacheBust:false,
        filter:node=>{
          if(node.tagName?.toLowerCase()==='img')return false;
          if(node.classList&&[...HIDDEN_CLASSES].some(cls=>node.classList.contains(cls)))return false;
          return true;
        },
        style:{boxShadow:'none',background:'transparent'},
      });
      if(!blob)throw new Error('The poster artwork was not rendered.');
      const {image,dispose}=await loadBlobImage(blob);
      try{
        const test=document.createElement('canvas');
        test.width=WIDTH;test.height=HEIGHT;
        const context=test.getContext('2d',{willReadFrequently:true});
        context.drawImage(image,0,0,WIDTH,HEIGHT);
        // A real arch must be painted; a white-only SVG snapshot is broken.
        // The check is anchored to known portrait positions, not random white
        // areas of the intentionally minimal poster layout.
        if(!snapshotContainsArtwork(context,frame,rect,dimensions)){
          throw new Error('Browser returned empty SVG poster artwork.');
        }
        // If Safari rasterizes an opaque white frame despite our CSS
        // overrides, it would cover the background we paint underneath.
        // Fall back to drawing artwork directly on a transparent canvas.
        const corners=[[0,0],[WIDTH-1,0],[0,HEIGHT-1],[WIDTH-1,HEIGHT-1]];
        if(corners.every(([x,y])=>context.getImageData(x,y,1,1).data[3]>250)){
          throw new Error('Browser returned opaque artwork instead of transparent artwork.');
        }
        return test;
      }finally{dispose();}
    }catch(error){lastError=error;}
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  }
  // Never block the user's download just because Safari cannot draw HTML
  // into an SVG. Keep every photo by using a native HTML5 canvas instead.
  console.warn('Using native poster export fallback:',lastError);
  return nativeArtworkSnapshot(frame,rect,dimensions);
}

export async function makeReliablePosterBlob(frame,options={}){
  if(!frame)throw new Error('Poster preview is not available.');
  const WIDTH=Number(options.width)||BASE_WIDTH;
  const HEIGHT=Number(options.height)||BASE_HEIGHT;
  const mime=options.mime==='image/jpeg'?'image/jpeg':'image/png';
  const quality=Math.max(.9,Math.min(.99,Number(options.quality)||.96));
  if(WIDTH<BASE_WIDTH || WIDTH>3240 || HEIGHT!==WIDTH*BASE_HEIGHT/BASE_WIDTH){
    throw new Error('Unsupported poster export dimensions.');
  }
  if(document.fonts?.ready)await document.fonts.ready;
  const images=[...frame.querySelectorAll('img')];
  await Promise.all(images.map(waitForImage));
  // Force a proper layout before reading coordinates and painting.
  const bounds=frame.getBoundingClientRect();
  if(bounds.width<=0||bounds.height<=0)throw new Error('Poster has an invalid size.');
  const scaleX=WIDTH/bounds.width,scaleY=HEIGHT/bounds.height;
  const backgroundImage=await loadPosterBackground(frame);
  // Keep the generated design, typography and portrait shapes above the
  // background, but NEVER let SVG-to-PNG decide whether to include the JPG/PNG
  // background. That image is always composited separately from its real asset.
  frame.classList.add('msf-export-transparent-background');
  let canvas;
  try{
    canvas=await artworkSnapshot(frame,bounds,{width:WIDTH,height:HEIGHT});
  }finally{
    frame.classList.remove('msf-export-transparent-background');
  }
  const context=canvas.getContext('2d');
  if(!context)throw new Error('Your browser cannot export an image.');
  context.imageSmoothingEnabled=true;
  context.imageSmoothingQuality='high';
  // Destination-over puts the original background behind every transparent
  // pixel of the text, green arches and headings. It does not cover photos.
  context.save();
  context.globalCompositeOperation='destination-over';
  context.drawImage(backgroundImage,0,0,WIDTH,HEIGHT);
  context.restore();

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
    canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Poster image encoding failed')),mime,quality);
  });
  if(!result.size)throw new Error('Exported image was empty.');
  if(result.type && result.type!==mime){
    throw new Error('This browser does not support the selected export format.');
  }
  return result;
}
