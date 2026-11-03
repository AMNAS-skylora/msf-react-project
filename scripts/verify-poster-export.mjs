// Browser regression: the 1080 x 1350 exported PNG must look like the
// same poster rendered at 1080 CSS pixels, even with a transformed photo.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';

const URL='http://127.0.0.1:4173';
const server=spawn('npm',['run','dev','--','--host','127.0.0.1','--port','4173','--strictPort'],{
  stdio:'pipe',env:process.env,
});
let stderr='';
server.stderr.on('data',chunk=>{stderr+=String(chunk);});
async function waitForServer(){
  for(let i=0;i<50;i++){
    try{const r=await fetch(URL);if(r.ok)return;}catch{}
    await delay(300);
  }
  throw new Error('Vite dev server did not start: '+stderr);
}
async function makeExport(page,width=1080){
  const data=await page.evaluate(async outWidth=>{
    const {makeReliablePosterBlob}=await import('/src/reliablePosterExport.js');
    const frame=document.querySelector('.workspace .frame');
    const blob=await makeReliablePosterBlob(frame,{
      width:outWidth,height:outWidth*5/4,mime:'image/png',quality:1,
    });
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=()=>reject(reader.error);
      reader.readAsDataURL(blob);
    });
  },width);
  return PNG.sync.read(Buffer.from(String(data).split(',')[1],'base64'));
}
function compareImages(reference,exported,region){
  assert.equal(reference.width,exported.width);
  // Browsers sometimes round a 4:5 CSS bounding box up by one physical
  // pixel in a screenshot. Ignore only that outermost edge when comparing.
  assert(Math.abs(reference.height-exported.height)<=1,
    'Preview screenshot height differs from PNG export.');
  const x0=region?.x??0,y0=region?.y??0;
  const x1=region?.right??reference.width;
  const y1=Math.min(region?.bottom??reference.height,exported.height);
  let diffSum=0,significant=0,pixels=0;
  for(let y=y0;y<y1;y+=2){
    for(let x=x0;x<x1;x+=2){
      const i=(y*reference.width+x)*4;
      const d=(Math.abs(reference.data[i]-exported.data[i])+
        Math.abs(reference.data[i+1]-exported.data[i+1])+
        Math.abs(reference.data[i+2]-exported.data[i+2]))/3;
      diffSum+=d;
      if(d>40)significant++;
      pixels++;
    }
  }
  return {averageRGBDiff:diffSum/pixels,significantRatio:significant/pixels};
}

let browser;
let testFailure=null;
try{
  console.log('Starting browser comparison');
  await waitForServer();
  browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1920,height:1800},deviceScaleFactor:1});
  page.on('console',msg=>{if(msg.type()==='warning'||msg.type()==='error')
    console.log('Browser:',msg.type(),msg.text().slice(0,500));});
  await page.goto(URL,{waitUntil:'networkidle'});
  await page.evaluate(async()=>{
    const stage=document.querySelector('.workspace .poster-edit-stage');
    const workspace=document.querySelector('.workspace');
    assertFrame(stage,workspace);
    function assertFrame(s,w){
      if(!s||!w)throw Error('Poster preview is missing.');
      w.style.setProperty('max-width','2000px','important');
      s.style.setProperty('width','1080px','important');
      s.style.setProperty('max-width','1080px','important');
    }
    const photo=document.querySelector('.ref-primary-leadership .ref-portrait');
    if(!photo)throw Error('Leadership photo frame is missing.');
    const temp=document.createElement('canvas');
    temp.width=320;temp.height=360;
    const ctx=temp.getContext('2d');
    const grad=ctx.createLinearGradient(0,0,320,360);
    grad.addColorStop(0,'#e8b464');
    grad.addColorStop(.45,'#7869ac');
    grad.addColorStop(1,'#1c6579');
    ctx.fillStyle=grad;ctx.fillRect(0,0,320,360);
    ctx.fillStyle='#fbe4c1';ctx.beginPath();ctx.arc(160,120,60,0,Math.PI*2);ctx.fill();
    const img=new Image();
    img.src=temp.toDataURL('image/png');
    img.style.transform='translate(10%, -6%) scale(1.18)';
    photo.appendChild(img);
    await img.decode();
    await document.fonts.ready;
  });
  const frame=page.locator('.workspace .frame');
  const bounds=await frame.boundingBox();
  assert(bounds,'Frame not visible');
  assert(Math.abs(bounds.width-1080)<1,'Preview is not 1080px wide: '+bounds.width);
  assert(Math.abs(bounds.height-1350)<1,'Preview is not 1350px high: '+bounds.height);

  // Logo position is specified in poster coordinates, not device pixels.
  const logo=page.locator('.ref-brand-strength-logo');
  const logoBounds=await logo.boundingBox();
  assert(logoBounds,'MSF logo missing from the poster.');
  const brand=await page.locator('.ref-brand').boundingBox();
  assert(brand,'MSF logo container missing.');
  const relTop=brand.y-bounds.y;
  const relRight=bounds.x+bounds.width-(brand.x+brand.width);
  console.log('MSF logo artboard position:',{top:relTop,right:relRight,width:brand.width,height:logoBounds.height});
  assert(Math.abs(relTop-15)<1,'Logo should be 15px from the top.');
  assert(Math.abs(relRight-15)<1,'Logo should be 15px from the right.');
  assert(Math.abs(brand.width-175)<1,'Logo container should be 175px wide.');
  assert(logoBounds.x>=bounds.x&&logoBounds.y>=bounds.y&&
    logoBounds.x+logoBounds.width<=bounds.x+bounds.width+1&&
    logoBounds.y+logoBounds.height<=bounds.y+bounds.height+1,
    'Logo is clipped by poster boundary.');

  const logoPng=PNG.sync.read(readFileSync('public/background/logo.png'));
  const pixelCount=logoPng.width*logoPng.height;
  let transparent=0;
  let minX=logoPng.width,minY=logoPng.height,maxX=-1,maxY=-1;
  for(let y=0;y<logoPng.height;y++){
    for(let x=0;x<logoPng.width;x++){
      const alpha=logoPng.data[(y*logoPng.width+x)*4+3];
      if(alpha<8){transparent++;continue;}
      minX=Math.min(minX,x);minY=Math.min(minY,y);
      maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    }
  }
  console.log('Logo alpha bounding box:',{
    sourceWidth:logoPng.width,sourceHeight:logoPng.height,
    transparentRatio:transparent/pixelCount,
    visibleWidth:maxX-minX+1,visibleHeight:maxY-minY+1,
    trim:{left:minX,top:minY,right:logoPng.width-maxX-1,bottom:logoPng.height-maxY-1},
  });

  // Report quantized top/bottom text colors without changing the logo asset.
  const paletteParts=[new Map(),new Map()];
  for(let y=0;y<logoPng.height;y+=3){
    const half=y<logoPng.height*.46?0:1;
    for(let x=0;x<logoPng.width;x+=3){
      const i=(y*logoPng.width+x)*4;
      if(logoPng.data[i+3]<220)continue;
      const k=[0,1,2].map(j=>(Math.round(logoPng.data[i+j]/24)*24).toString(16).padStart(2,'0')).join('');
      const table=paletteParts[half];
      table.set(k,(table.get(k)||0)+1);
    }
  }
  console.log('Logo content color palettes (top, bottom):',
    paletteParts.map(map=>[...map].sort((a,b)=>b[1]-a[1]).slice(0,7)));
  console.log('Capturing preview screenshot');
  const screenshot=PNG.sync.read(await frame.screenshot({animations:'disabled'}));
  console.log('Rendering 1080x1350 PNG export');
  const exported=await makeExport(page);
  assert.equal(exported.width,1080);
  assert.equal(exported.height,1350);
  const overall=compareImages(screenshot,exported);
  const photoBounds=await page.locator('.ref-primary-leadership .ref-portrait').first().boundingBox();
  const photoRegion={
    x:Math.max(0,Math.floor(photoBounds.x-bounds.x)),
    y:Math.max(0,Math.floor(photoBounds.y-bounds.y)),
    right:Math.min(1080,Math.ceil(photoBounds.x-bounds.x+photoBounds.width)),
    bottom:Math.min(1350,Math.ceil(photoBounds.y-bounds.y+photoBounds.height)),
  };
  const portrait=compareImages(screenshot,exported,photoRegion);
  console.log('Preview/export 1080x1350:',{overall,portrait});
  assert(overall.averageRGBDiff<22,'The exported poster does not match preview colors.');
  assert(portrait.averageRGBDiff<32,'The exported photo crop differs from preview.');

  // Verify mobile preview is still 4:5 without changing the export artboard.
  await page.setViewportSize({width:420,height:900});
  await page.evaluate(()=>{
    const stage=document.querySelector('.workspace .poster-edit-stage');
    stage.style.removeProperty('width');stage.style.removeProperty('max-width');
    document.querySelector('.workspace').style.removeProperty('max-width');
  });
  const mobile=await frame.boundingBox();
  console.log('Mobile preview:',mobile.width,mobile.height);
  assert(mobile.width<420&&mobile.width>250,'Mobile preview size invalid.');
  assert(Math.abs(mobile.width/mobile.height-.8)<.005,'Mobile preview lost its 4:5 ratio.');
  console.log('Rendering 1080x1350 PNG export from mobile preview');
  const mobileExport=await makeExport(page);
  assert.equal(mobileExport.width,1080);
  assert.equal(mobileExport.height,1350);
  console.log('Poster preview/export smoke test passed');
}catch(error){
  testFailure=error;
  console.error('Preview/export regression failed:',error);
}finally{
  await browser?.close();
  // `npm run dev` spawns Vite as a child. Close inherited stdout/stderr
  // streams and exit explicitly so the GitHub runner cannot hang forever.
  server.kill('SIGTERM');
  server.stdout.destroy();
  server.stderr.destroy();
  await delay(100);
  process.exit(testFailure?1:0);
}
