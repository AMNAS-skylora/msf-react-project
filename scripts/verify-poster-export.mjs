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

  // The removed STRENGTH artwork must not appear in the poster.
  assert.equal(await page.locator('.ref-strength-wordmark').count(),0,
    'Removed STRENGTH wordmark is still present.');
  assert.equal(await page.locator('.ref-brand-strength-logo').count(),1,
    'MSF committee logo is missing.');

  // Premium MSF geometry: verify the generated sections still fit inside
  // the fixed poster artboard and the original member order/slots survive.
  const geometry=await page.evaluate(()=>{
    const poster=document.querySelector('.ref-poster.ref-first-page');
    if(!poster)throw new Error('Main MSF poster was not rendered');
    const root=poster.getBoundingClientRect();
    const sel=(selector)=>{
      const element=poster.querySelector(selector);
      if(!element)throw new Error('Missing poster section: '+selector);
      const rect=element.getBoundingClientRect();
      return {left:rect.left-root.left,right:rect.right-root.left,
        top:rect.top-root.top,bottom:rect.bottom-root.top,
        width:rect.width,height:rect.height};
    };
    const frameBounds=[...poster.querySelectorAll('.ref-portrait')].map(e=>{
      const r=e.getBoundingClientRect();
      return {x:r.left-root.left,y:r.top-root.top,
        right:r.right-root.left,bottom:r.bottom-root.top};
    });
    const leaderFrames=[...poster.querySelectorAll('.ref-primary-leadership .ref-portrait')]
      .map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}));
    const officerGroups=[...poster.querySelectorAll('.ref-officer-four')]
      .map(e=>({name:e.querySelector('h2')?.textContent,
        members:e.querySelectorAll('.ref-profile-committee').length}));
    const executiveRows=[...poster.querySelectorAll('.ref-executive-row')].map(row=>{
      const r=row.getBoundingClientRect(),cards=[...row.querySelectorAll('.ref-profile-executive')];
      const first=cards[0]?.getBoundingClientRect();
      const last=cards[cards.length-1]?.getBoundingClientRect();
      return {count:cards.length,leftGap:first?first.left-r.left:0,
        rightGap:last?r.right-last.right:0,
        widths:cards.map(c=>c.getBoundingClientRect().width)};
    });
    return {title:sel('.ref-title'),logo:sel('.ref-brand'),
      chokkad:sel('.ref-unit-corner-image'),
      leaders:sel('.ref-primary-leadership'),
      officers:sel('.ref-officer-eight'),executives:sel('.ref-main-executives'),
      footer:sel('.ref-footer'),
      chokkadSource:poster.querySelector('.ref-unit-corner-image')?.getAttribute('src'),
      chokkadLoaded:(()=>{
        const image=poster.querySelector('.ref-unit-corner-image');
        return !!image && image.complete && image.naturalWidth>0;
      })(),
      logoLoaded:(()=>{
        const image=poster.querySelector('.ref-brand-strength-logo');
        return !!image && image.complete && image.naturalWidth>0;
      })(),
      removedWordmark:poster.querySelector('.ref-strength-wordmark')===null,
      background:getComputedStyle(poster).backgroundImage,
      mainTitle:poster.querySelector('.ref-title h1')?.textContent,
      committee:poster.querySelector('.ref-title p')?.textContent,
      leaderFrames,officerGroups,executiveRows,frameBounds,
      posterWidth:root.width,posterHeight:root.height,
      topRightTextRemoved:poster.querySelector('.ref-unit-corner-label')===null,
      footerArtwork:poster.querySelector('.ref-footer-artwork')?.getAttribute('src'),
      footerArtworkLoaded:(()=>{
        const image=poster.querySelector('.ref-footer-artwork');
        return !!image && image.complete && image.naturalWidth>0;
      })(),
      footerText:poster.querySelector('.ref-footer')?.textContent.trim(),
      titleColor:getComputedStyle(poster.querySelector('.ref-title h1')).color
    };
  });
  console.log('Premium MSF geometry:',JSON.stringify({
    title:geometry.title,leaders:geometry.leaders,officers:geometry.officers,
    executives:geometry.executives,footer:geometry.footer,
    officerGroups:geometry.officerGroups,executiveRows:geometry.executiveRows,
    portraitCount:geometry.frameBounds.length,
  }));
  assert(geometry.removedWordmark,'Removed STRENGTH wordmark reappeared');
  assert(geometry.background.includes('msf_background.png'),'Original meeting photo removed');
  assert(geometry.background.includes('linear-gradient'),'Cinematic gradient was not applied');
  assert(geometry.logoLoaded,'MSF logo failed to load');
  assert(geometry.logo.width>=323 && geometry.logo.width<=325,
    'Right-side MSF logo should be 30% of the 1080px poster width');
  assert(Math.abs(geometry.posterWidth-geometry.logo.right-19.44)<1,
    'MSF logo is not aligned to the top-right margin');
  assert(Math.abs(geometry.logo.top-8.64)<1,'MSF logo top margin changed');
  assert(geometry.logo.left>geometry.posterWidth/2,'MSF logo is not on the right');
  assert(geometry.logo.bottom<=geometry.title.top+1,
    'MSF logo overlaps the main heading');
  assert.equal(geometry.chokkadSource,'/background/chokkad.png',
    'Chokkad image source missing or changed');
  assert(geometry.chokkadLoaded,'Chokkad artwork failed to load');
  assert(geometry.chokkad.width>=226 && geometry.chokkad.width<=228,
    'Chokkad artwork should be 21% of the 1080px poster width');
  assert(Math.abs(geometry.chokkad.left-19.44)<1,
    'Chokkad artwork is not aligned to the top-left margin');
  assert(Math.abs(geometry.chokkad.top-8.64)<1,'Chokkad artwork top margin changed');
  assert(geometry.chokkad.right<geometry.posterWidth/2,
    'Chokkad artwork is not on the left');
  assert(geometry.chokkad.bottom<=geometry.title.top+1,
    'Chokkad artwork overlaps the main heading');
  assert(geometry.mainTitle?.includes('ഇനി ഇവർ'),'Malayalam title missing');
  assert(geometry.committee?.includes('യൂണിറ്റ് കമ്മിറ്റി'),'Unit committee title missing');
  assert(geometry.topRightTextRemoved,'Old top-right text remains');
  assert.equal(geometry.footerArtwork,'/background/congratulations.png','Congratulations image path changed');
  assert(geometry.footerArtworkLoaded,'Congratulations PNG failed to load');
  assert.equal(geometry.footerText,'','Old greeting or Instagram footer text remains');
  assert.equal(geometry.titleColor,'rgb(244, 207, 56)');
  assert(geometry.title.bottom<=geometry.leaders.top+1,'Main title overlaps the primary leaders');
  assert(geometry.leaders.bottom<=geometry.officers.top+1,'Primary leaders overlap vice/joint section');
  assert(geometry.officers.bottom<=geometry.executives.top+1,'Vice/joint officers overlap executives');
  assert(geometry.executives.bottom<=geometry.footer.top+1,'Executive rows overlap congratulations artwork');
  assert(geometry.leaderFrames.length===3,'Three primary leaders must remain');
  assert(Math.max(...geometry.leaderFrames.map(r=>r.width))-
    Math.min(...geometry.leaderFrames.map(r=>r.width))<1,
    'Leadership portrait widths are inconsistent');
  assert(geometry.officerGroups.map(g=>g.name).join('|')==='Vice Presidents|Joint Secretaries',
    'Officer group names/order changed');
  for(const row of geometry.executiveRows){
    assert(Math.abs(row.leftGap-row.rightGap)<3,
      'Executive row is not centered');
    assert(Math.max(...row.widths)-Math.min(...row.widths)<1,
      'Executive frame widths differ within a row');
  }
  for(const p of geometry.frameBounds){
    assert(p.x>=-1 && p.y>=-1 && p.right<=geometry.posterWidth+1 &&
      p.bottom<=geometry.posterHeight+1,
      'A portrait frame extends outside the poster');
  }
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
  // Populated-committee regression: fresh sessions start with empty officer
  // groups, which cannot expose real 4+4+28-member layout problems.
  // Seed a TEST-ONLY IndexedDB draft, reload, then inspect the real React
  // components with a three-row executive committee.
  await page.evaluate(()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('msf-poster-editor',1);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains('draft'))request.result.createObjectStore('draft');
    };
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result;
      const member=(role,i)=>({role,name:role+' Member '+String(i+1).padStart(2,'0'),
        photo:'',cutout:false,photoZoom:1,photoX:0,photoY:0});
      const groups={
        'Vice Presidents':Array.from({length:4},(_,i)=>member('Vice President',i)),
        'Joint Secretaries':Array.from({length:4},(_,i)=>member('Joint Secretary',i)),
        'Executive Members':Array.from({length:28},(_,i)=>member('Executive',i)),
      };
      const tx=db.transaction('draft','readwrite');
      tx.objectStore('draft').put({groups},'committees');
      tx.oncomplete=()=>{db.close();resolve();};
      tx.onerror=()=>{db.close();reject(tx.error);};
    };
  }));
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(()=>
    document.querySelectorAll('.ref-profile-executive').length===28,{
      timeout:12000,
    });
  const populated=await page.evaluate(()=>{
    const poster=document.querySelector('.ref-poster.ref-first-page');
    const pr=poster.getBoundingClientRect();
    const bounds=element=>{const r=element.getBoundingClientRect();return{
      left:r.left-pr.left,right:r.right-pr.left,top:r.top-pr.top,
      bottom:r.bottom-pr.top,width:r.width,height:r.height};};
    const groups=[...poster.querySelectorAll('.ref-officer-four')]
      .map(group=>({names:[...group.querySelectorAll('.ref-profile-name')]
        .map(e=>e.textContent),frames:[...group.querySelectorAll('.ref-portrait')].map(bounds)}));
    const rows=[...poster.querySelectorAll('.ref-executive-row')]
      .map(row=>({row:bounds(row),frames:[...row.querySelectorAll('.ref-portrait')].map(bounds),
        cards:[...row.querySelectorAll('.ref-profile-executive')].map(bounds),
        names:[...row.querySelectorAll('.ref-profile-name')].map(e=>e.textContent)}));
    return {groups,rows,poster:{width:pr.width,height:pr.height}};
  });
  console.log('Populated-committee regression:',JSON.stringify({
    officerCounts:populated.groups.map(g=>g.frames.length),
    executiveRowSizes:populated.rows.map(r=>r.frames.length),
    lastExecutiveName:populated.rows.at(-1)?.names.at(-1),
  }));
  assert.deepEqual(populated.groups.map(g=>g.frames.length),[4,4]);
  assert.deepEqual(populated.rows.map(r=>r.frames.length),[10,10,8]);
  // The portrait renderer deliberately splits long names into multiple
  // <span> lines; textContent joins those spans without a space.
  const normalizedName=value=>value.replace(/\s+/g,'');
  assert(normalizedName(populated.groups[0].names[0])==='VicePresidentMember01',
    'Vice President member 1 was renamed or reordered.');
  assert(normalizedName(populated.rows[2].names[7])==='ExecutiveMember28',
    'Executive member 28 was renamed or reordered.');
  for(const g of populated.groups){
    const widths=g.frames.map(f=>f.width),heights=g.frames.map(f=>f.height);
    assert(Math.max(...widths)-Math.min(...widths)<1,'Officer frame widths differ');
    assert(Math.max(...heights)-Math.min(...heights)<1,'Officer frame heights differ');
  }
  for(const row of populated.rows){
    const first=row.cards[0],last=row.cards.at(-1);
    assert(Math.abs((first.left-row.row.left)-(row.row.right-last.right))<3,
      'Incomplete executive row is not centered');
    for(const rect of row.frames){
      assert(rect.left>=-1 && rect.right<=populated.poster.width+1 &&
        rect.top>=-1 && rect.bottom<=populated.poster.height+1,
        'Populated executive portrait was clipped outside the poster');
    }
  }
  const populatedExport=await makeExport(page);
  assert.equal(populatedExport.width,1080);
  assert.equal(populatedExport.height,1350);
  console.log('Poster preview/export smoke test passed (empty + populated committees)');
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
