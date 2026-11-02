import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Camera, Crop, Download, Pencil, WandSparkles } from 'lucide-react';
import { MEMBERS, imageUrl } from './data/committee.js';
import { toBlob } from 'html-to-image';
import ReferencePoster from './ReferencePoster.jsx';
import './styles.css';
import './reference-poster.css';

const splitMalayalamHeading = value => {
  const text=String(value||'').trim();
  if(text.includes('\n')) {
    const [first,...rest]=text.split('\n');
    return [first.trim(),rest.join(' ').trim()];
  }
  const words=text.split(/\s+/).filter(Boolean);
  if(words.length<2)return [text,''];
  let split=1,difference=Infinity;
  for(let i=1;i<words.length;i++){
    const delta=Math.abs(words.slice(0,i).join(' ').length-words.slice(i).join(' ').length);
    if(delta<difference){difference=delta;split=i;}
  }
  return [words.slice(0,split).join(' '),words.slice(split).join(' ')];
};
const INITIAL = ['President', 'General Secretary', 'Treasurer'].map(role=>({role}));
const EXECUTIVE_FIRST_PAGE_SIZE = 8;
const EXECUTIVE_PAGE_SIZE = 16;
const COMMITTEE_LIMIT = 4;
const loadImage = src => new Promise((resolve, reject) => {
  const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src;
});
const toDataURL = file => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
});

const splitName = value => {
  const name=String(value||'').trim().replace(/\s+/g,' ');
  if(name.length<=15||!name.includes(' '))return [name,''];
  const words=name.split(' ');
  let best=1,score=Infinity;
  for(let i=1;i<words.length;i++){
    const top=words.slice(0,i).join(' '),bottom=words.slice(i).join(' ');
    const current=Math.max(top.length,bottom.length)*2+Math.abs(top.length-bottom.length);
    if(current<score){score=current;best=i;}
  }
  return [words.slice(0,best).join(' '),words.slice(best).join(' ')];
};
const nameLines = p => p.nameLayout==='manual' ? [p.line1||'',p.line2||''] : splitName(p.name);
function fitText(ctx,text,maxWidth,baseSize,weight){
  let size=baseSize;
  do {ctx.font=`${weight} ${size}px Arial`;if(ctx.measureText(text).width<=maxWidth)break;size--;}while(size>12);
  return size;
}

function CropDialog({ src, onSave, onClose, square=false }) {
  const canvasRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const [box, setBox] = useState(square?{x:10,y:10,w:80,h:80}:{ x: 15, y: 10, w: 70, h: 80 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({x:0,y:0});
  const [busy, setBusy] = useState(false);
  function pointerDown(e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const rect=e.currentTarget.getBoundingClientRect();
    const px=(e.clientX-rect.left)/rect.width*100,py=(e.clientY-rect.top)/rect.height*100;
    const threshold=square?0:9;
    const edgeX=Math.abs(px-box.x)<threshold?'left':Math.abs(px-box.x-box.w)<threshold?'right':null;
    const edgeY=Math.abs(py-box.y)<threshold?'top':Math.abs(py-box.y-box.h)<threshold?'bottom':null;
    const inside=px>=box.x&&px<=box.x+box.w&&py>=box.y&&py<=box.y+box.h;
    gesture.current={startX:e.clientX,startY:e.clientY,box:{...box},offset:{...offset},zoom,edgeX,edgeY,mode:!square&&(edgeX||edgeY)?'resize':'move-photo'};
  }
  function pointerMove(e) {
    if(!pointers.current.has(e.pointerId)||!gesture.current)return;
    e.preventDefault();
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const rect=e.currentTarget.getBoundingClientRect();
    const g=gesture.current;
    if(pointers.current.size===2){
      const pts=[...pointers.current.values()];
      const distance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
      if(!g.pinchDistance){g.pinchDistance=distance;g.pinchZoom=zoom;}
      setZoom(Math.max(1,Math.min(5,g.pinchZoom*distance/g.pinchDistance)));
      return;
    }
    const dx=(e.clientX-g.startX)/rect.width*100,dy=(e.clientY-g.startY)/rect.height*100;
    if(g.mode==='resize'&&!square){
      let {x,y,w,h}=g.box;
      if(g.edgeX==='left'){const right=x+w;x=Math.max(0,Math.min(right-12,x+dx));w=right-x;}
      if(g.edgeX==='right')w=Math.max(12,Math.min(100-x,w+dx));
      if(g.edgeY==='top'){const bottom=y+h;y=Math.max(0,Math.min(bottom-12,y+dy));h=bottom-y;}
      if(g.edgeY==='bottom')h=Math.max(12,Math.min(100-y,h+dy));
      setBox({x,y,w,h});
    }else setOffset({x:g.offset.x+dx,y:g.offset.y+dy});
  }
  function pointerUp(e){pointers.current.delete(e.pointerId);if(!pointers.current.size)gesture.current=null;}
  async function save(){
    setBusy(true);
    try{
      const img=await loadImage(src);
      const stage=canvasRef.current;
      const {width,height}=stage.getBoundingClientRect();
      if(!width||!height)throw new Error("Crop preview unavailable");
      const output=document.createElement('canvas');
      output.width=900;output.height=Math.max(1,Math.round(900*(box.h*height)/(box.w*width)));
      const ctx=output.getContext('2d');
      const base=Math.max(width/img.width,height/img.height)*zoom;
      const iw=img.width*base,ih=img.height*base;
      const left=(width-iw)/2+offset.x*width/100,top=(height-ih)/2+offset.y*height/100;
      const cropX=box.x*width/100,cropY=box.y*height/100;
      const scale=output.width/(box.w*width/100);
      ctx.clearRect(0,0,output.width,output.height);
      ctx.drawImage(img,(left-cropX)*scale,(top-cropY)*scale,iw*scale,ih*scale);
      onSave(output.toDataURL('image/png'));
    }catch{alert('Unable to crop this image.');}finally{setBusy(false);}
  }
  return <div className="crop-overlay" role="dialog" aria-modal="true" aria-label="Crop portrait">
    <div className="crop-dialog"><div className="crop-topbar"><h2>Crop</h2><button type="button" aria-label="Close crop editor" onClick={onClose}>×</button></div>
      <div className={"touch-crop"+(square?" square-crop":"")} ref={canvasRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
        <img src={src} draggable={false} alt="Photo to crop" style={{transform:`translate(${offset.x}%,${offset.y}%) scale(${zoom})`}} />
        <div className="crop-selection" style={{left:box.x+'%',top:box.y+'%',width:box.w+'%',height:box.h+'%'}}>
          <div className="crop-grid"/>{!square&&['tl','tr','bl','br'].map(k=><span key={k} className={'crop-handle '+k}/>)}
        </div>
      </div>
      <div className="crop-actions"><button type="button" onClick={onClose}>Cancel</button><button type="button" className="crop-apply" disabled={busy} onClick={save}>{busy?'Cropping…' :'Done'}</button></div>
    </div>
  </div>;
}
export default function App() {
  const [people,setPeople] = useState(INITIAL.map(({role,member})=>({role,name:'',photo:'',cutout:false,x:8+INITIAL.findIndex(v=>v.role===role)*30,y:63,w:27})));
  // The poster headline stays fixed; only the local unit's place name is editable.
  const [unitName,setUnitName]=useState(()=>{try{return localStorage.getItem('msf-unit-place')??'ചോക്കാട്';}catch{return 'ചോക്കാട്';}});
  useEffect(()=>{try{localStorage.setItem('msf-unit-place',unitName)}catch{}},[unitName]);
  const [ready,setReady]=useState(false);
  const [joint,setJoint]=useState([]);
  const [jointGroups,setJointGroups]=useState({'Vice Presidents':[],'Joint Secretaries':[],'Executive Members':[]});
  const [jointReady,setJointReady]=useState(false);
  const [jointRole,setJointRole]=useState('Joint Secretaries');
  const groupNames=['Vice Presidents','Joint Secretaries','Executive Members'];
  const changeGroup=role=>{setJointGroups(g=>({...g,[jointRole]:joint}));setJointRole(role);setJoint(jointGroups[role]||[]);setJointSelected(null);setPosterPage(0);};
  const jointUploads=useRef([]);
  const moveJoint=(from,to)=>setJoint(current=>{if(to<0||to>=current.length)return current;const next=[...current];const [item]=next.splice(from,1);next.splice(to,0,item);return next;});
  const [jointSelected,setJointSelected]=useState(null);
  const [selected,setSelected]=useState(null);
  const [posterPage,setPosterPage]=useState(0);
  const jointRows=(n,columns=4)=>{const rowCount=Math.ceil(n/columns);if(!rowCount)return [];const base=Math.floor(n/rowCount),extra=n%rowCount;return Array.from({length:rowCount},(_,i)=>base+(i<extra?1:0));};
  const executiveMembers=jointRole==='Executive Members'?joint:(jointGroups['Executive Members']||[]);
  const posterPageCount=1+Math.ceil(Math.max(0,executiveMembers.length-EXECUTIVE_FIRST_PAGE_SIZE)/EXECUTIVE_PAGE_SIZE);
  const posterMembersFor=role=>{const all=role===jointRole?joint:(jointGroups[role]||[]);if(role==='Executive Members'){
    if(posterPage===0)return all.slice(0,EXECUTIVE_FIRST_PAGE_SIZE);
    const start=EXECUTIVE_FIRST_PAGE_SIZE+(posterPage-1)*EXECUTIVE_PAGE_SIZE;
    return all.slice(start,start+EXECUTIVE_PAGE_SIZE);
  }return all.slice(0,COMMITTEE_LIMIT);};
  useEffect(()=>{if(posterPage>=posterPageCount)setPosterPage(Math.max(0,posterPageCount-1));},[posterPage,posterPageCount]);
  const updateJoint=(i,patch)=>setJoint(current=>current.map((p,j)=>i===j?{...p,...patch}:p));
  async function uploadJoint(i,e){const file=e.target.files?.[0];e.target.value='';if(!file)return;if(!file.type.startsWith('image/')||file.size>15*1024*1024){setMessage('Choose an image under 15 MB.');return;}try{setCrop({joint:i,src:await toDataURL(file),square:true});}catch{setMessage('Unable to read photo.');}}
  const drag=useRef(null);
  const touches=useRef(new Map());
  const frameRef=useRef(null);
  const position=(p,i)=>({x:p.x??(8+i*30),y:p.y??63,w:p.w??27});
  function dragStart(e,i){
    if(!people[i].photo)return;
    e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
    setSelected(i);
    touches.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const pos=position(people[i],i);
    const resizing=e.target.closest('[data-resize]')!==null;
    drag.current={id:e.pointerId,i,startX:e.clientX,startY:e.clientY,...pos,resizing,pinchDistance:null};
  }
  function dragMove(e){
    if(!touches.current.has(e.pointerId))return;
    touches.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const d=drag.current;if(!d)return;
    const bounds=frameRef.current?.getBoundingClientRect();if(!bounds)return;
    if(touches.current.size===2){
      const points=[...touches.current.values()];
      const distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);
      if(!d.pinchDistance){d.pinchDistance=distance;d.pinchWidth=position(people[d.i],d.i).w;}
      update(d.i,{w:Math.max(8,Math.min(85,d.pinchWidth*distance/d.pinchDistance))});
      return;
    }
    if(d.id!==e.pointerId)return;
    const dx=(e.clientX-d.startX)/bounds.width*100,dy=(e.clientY-d.startY)/bounds.height*100;
    if(d.resizing)update(d.i,{w:Math.max(8,Math.min(85,d.w+dx))});
    else update(d.i,{x:Math.max(0,Math.min(100-d.w,d.x+dx)),y:Math.max(0,Math.min(90,d.y+dy))});
  }
  function dragEnd(e){touches.current.delete(e.pointerId);if(!touches.current.size)drag.current=null;}
  function zoomPhoto(e,i){
    if(selected!==i)return;
    e.preventDefault();
    const p=position(people[i],i);
    update(i,{w:Math.max(8,Math.min(85,p.w-(e.deltaY>0?2:-2)))});
  }
  function editName(i){nameInputs.current[i]?.scrollIntoView({behavior:'smooth',block:'center'});nameInputs.current[i]?.focus({preventScroll:true});}

  const [crop,setCrop] = useState(null);
  const [busy,setBusy] = useState(-1);
  const [message,setMessage] = useState('');
  const [template,setTemplate]=useState(()=>{try{return '1';}catch{return '1';}});
  useEffect(()=>{try{localStorage.setItem('msf-poster-template',template)}catch{}},[template]);
  const [exporting,setExporting]=useState(false);
  const [shareOpen,setShareOpen]=useState(false);
  const uploads=useRef([]);
  const nameInputs=useRef([]);
  useEffect(()=>{
    let active=true;
    const request=indexedDB.open('msf-poster-editor',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('draft');
    request.onsuccess=()=>{
      const db=request.result;
      const tx=db.transaction('draft','readonly');
      const get=tx.objectStore('draft').get('leadership');
      get.onsuccess=()=>{if(active&&Array.isArray(get.result)&&get.result.length===3)setPeople(get.result.map((p,i)=>{const demo=MEMBERS.find(m=>m.role===INITIAL[i].role);return {...p,role:INITIAL[i].role,name:p.name===demo?.name?'':p.name,photo:p.photo=== (demo?imageUrl(demo):null)?'':p.photo};}));if(active)setReady(true);db.close();};
      get.onerror=()=>{if(active)setReady(true);db.close();};
    };
    request.onerror=()=>{if(active)setReady(true);};
    return()=>{active=false;};
  },[]);
  useEffect(()=>{
    if(!ready)return;
    const request=indexedDB.open('msf-poster-editor',1);
    request.onsuccess=()=>{const db=request.result;const tx=db.transaction('draft','readwrite');tx.objectStore('draft').put(people,'leadership');tx.oncomplete=()=>db.close();};
  },[people,ready]);
  useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem('msf-joint-members')||'null');if(saved){const groups=saved.groups||{'Vice Presidents':[], 'Joint Secretaries':[], 'Executive Members':[]};if(Array.isArray(saved.members))groups[saved.role==='Joint Presidents'?'Vice Presidents':(saved.role||'Joint Secretaries')]=saved.members;setJointGroups(groups);setJoint(groups['Joint Secretaries']||[]);setJointRole('Joint Secretaries');}}catch{}setJointReady(true);},[]);
  useEffect(()=>{if(!jointReady)return;const groups={...jointGroups,[jointRole]:joint};try{localStorage.setItem('msf-joint-members',JSON.stringify({groups}));}catch{}},[joint,jointRole,jointGroups,jointReady]);
  function resetAll(){
    if(!window.confirm('Reset all names and photos to the original values?'))return;
    setPeople(INITIAL.map(({role,member})=>({role,name:member?.name||'',photo:member?imageUrl(member):'',cutout:false,x:8+INITIAL.findIndex(v=>v.role===role)*30,y:63,w:27})));
    setUnitName('ചോക്കാട്');
    setJoint([]);setJointGroups({'Vice Presidents':[],'Joint Secretaries':[],'Executive Members':[]});setJointRole('Joint Secretaries');setPosterPage(0);setMessage('All changes reset.');
  }
  const update=(i,patch)=>setPeople(current=>current.map((p,j)=>j===i?{...p,...patch}:p));
  async function upload(i,e) {
    const file=e.target.files?.[0]; e.target.value=''; if(!file)return;
    if(!file.type.startsWith('image/')){setMessage('Choose an image file.');return;}
    if(file.size>15*1024*1024){setMessage('Maximum photo size is 15 MB.');return;}
    try { setCrop({i,src:await toDataURL(file)}); } catch {setMessage('Unable to read photo.');}
  }
  async function removeBg(i) {
    setBusy(i);setMessage('Removing background. First run may download the AI model.');
    try {
      const {removeBackground}=await import('@imgly/background-removal');
      const response=await fetch(people[i].photo);
      if(!response.ok)throw new Error('Photo could not be loaded');
      const result=await removeBackground(await response.blob());
      update(i,{photo:await toDataURL(result),cutout:true});
      setMessage('Background removed. Transparent image ready.');
    }catch(error){setMessage('Background removal failed: '+(error?.message||'Try again online.'));}
    finally{setBusy(-1);}
  }
  async function removeJointBg(i) {
    const member=joint[i];
    if (!member?.photo || busy!==-1) return;
    setBusy('joint-'+i);
    setMessage('Removing member background. The AI model may need an internet connection.');
    try {
      const { removeBackground }=await import('@imgly/background-removal');
      const response=await fetch(member.photo);
      if(!response.ok)throw new Error('Could not load the member image');
      const result=await removeBackground(await response.blob());
      updateJoint(i,{photo:await toDataURL(result),cutout:true});
      setMessage('Background removed. The portrait now fits inside the green frame.');
    }catch(error){
      setMessage('Background removal failed: '+(error?.message||'Please try again.'));
    }finally{setBusy(-1);}
  }
  async function imageHasTransparency(src){
    try {
      const img=await loadImage(src);
      const probe=document.createElement('canvas');
      probe.width=48;probe.height=48;
      const context=probe.getContext('2d',{willReadFrequently:true});
      if(!context)return false;
      context.drawImage(img,0,0,48,48);
      const pixels=context.getImageData(0,0,48,48).data;
      for(let i=3;i<pixels.length;i+=4){if(pixels[i]<240)return true;}
    }catch{}
    return false;
  }
  async function makePosterBlob(){
    if(!frameRef.current)throw new Error('Poster preview is not ready.');
    await document.fonts.ready;
    const images=[...frameRef.current.querySelectorAll('img')];
    await Promise.all(images.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});})));
    const node=frameRef.current;
    const blob=await toBlob(node,{
      pixelRatio:1080/node.getBoundingClientRect().width,
      cacheBust:false,
      width:node.getBoundingClientRect().width,
      height:node.getBoundingClientRect().height,
      backgroundColor:'#ffffff',
      filter:element=>!element.classList || !['photo-toolbar','photo-selection-handle','joint-crop-button','ref-camera-placeholder'].some(cls=>element.classList.contains(cls)),
      style:{boxShadow:'none'}
    });
    if(!blob)throw new Error('Could not create poster image.');
    const previewUrl=URL.createObjectURL(blob);
    try{const exported=await loadImage(previewUrl);if(exported.naturalWidth!==1080||exported.naturalHeight!==1350)throw new Error(`PNG must be 1080 × 1350 px; received ${exported.naturalWidth} × ${exported.naturalHeight} px.`);}finally{URL.revokeObjectURL(previewUrl);}
    return blob;
  }
  function saveBlob(blob){
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;link.download='msf-poster.png';
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  const waitForPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const exportAllPages=async()=>{const original=posterPage;const blobs=[];try{for(let page=0;page<posterPageCount;page++){flushSync(()=>setPosterPage(page));await waitForPaint();blobs.push(await makePosterBlob());}return blobs;}finally{flushSync(()=>setPosterPage(Math.min(original,posterPageCount-1)));await waitForPaint();}};
  function validateCommitteeLimits(){
    const groups={...jointGroups,[jointRole]:joint};
    const exceeded=Object.entries(groups).filter(([role,members])=>role!=='Executive Members'&&members.length>COMMITTEE_LIMIT);
    if(!exceeded.length)return true;
    setMessage(`Please reduce ${exceeded.map(([role,members])=>`${role} (${members.length})`).join(', ')} to 4 members before exporting. Your saved member data is unchanged.`);
    return false;
  }
  async function download(){
    if(exporting||!validateCommitteeLimits())return;
    setExporting(true);setMessage('');
    try{const blobs=await exportAllPages();blobs.forEach((blob,i)=>{const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=blobs.length>1?`msf-poster-page-${String(i+1).padStart(2,'0')}.png`:'msf-poster.png';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);});if(blobs.length>1)setMessage(`${blobs.length} poster pages downloaded.`);}
    catch(error){flushSync(()=>setPosterPage(0));setMessage('Download failed: '+(error?.message||'Please try again.'));}
    finally{setExporting(false);}
  }
  async function sharePoster(){
    if(exporting||!validateCommitteeLimits())return;
    setExporting(true);setMessage('');
    try{
      const blobs=await exportAllPages();
      const files=blobs.map((blob,i)=>new File([blob],blobs.length>1?`msf-poster-page-${String(i+1).padStart(2,'0')}.png`:'msf-poster.png',{type:'image/png'}));
      if(navigator.share && navigator.canShare?.({files})){
        await navigator.share({files,title:'MSF Poster'});
      }else{
        files.forEach((file,i)=>saveBlob(blobs[i]));
        setMessage(blobs.length>1?`${blobs.length} poster pages downloaded. Attach the PNGs to share.`:'Image downloaded. Open WhatsApp or Facebook and attach the PNG to share.');
      }
    }catch(error){
      if(error?.name!=='AbortError')setMessage('Share failed: '+(error?.message||'Please try again.'));
    }finally{setExporting(false);setShareOpen(false);}
  }
  return <main className="app-shell">
    <div className="editor-bar"><div><strong>MSF Poster Creator</strong></div><div className="poster-export-actions"><button type="button" onClick={download} disabled={exporting}><Download size={17}/> {exporting?"Preparing…":"Download PNG"}</button><button type="button" onClick={sharePoster} disabled={exporting}>Share Poster</button></div></div>
    
    {posterPageCount>1&&<div className="poster-pagination" aria-label="Poster pages"><span>Poster page · {posterPage+1} of {posterPageCount}</span><div><button type="button" disabled={posterPage===0} onClick={()=>setPosterPage(v=>Math.max(0,v-1))}>Previous</button><button type="button" disabled={posterPage>=posterPageCount-1} onClick={()=>setPosterPage(v=>Math.min(posterPageCount-1,v+1))}>Next page</button></div></div>}
    <div className="workspace">
      <section className="frame" ref={frameRef} aria-label="MSF poster preview">
        <ReferencePoster
          people={people}
          unitName={unitName}
          page={posterPage}
          pageCount={posterPageCount}
          membersFor={posterMembersFor}
          onLeaderClick={(index,person)=>person.photo?setCrop({i:index,src:person.photo}):uploads.current[index]?.click()}
          onMemberClick={(role,index)=>{
            const members=role===jointRole?joint:(jointGroups[role]||[]);
            if(members[index]?.photo){
              setCrop({role,index,src:members[index].photo,square:true});
            }else{
              if(role!==jointRole)changeGroup(role);
              setJointSelected(index);
              setMessage('Use Upload in '+role+' to add this member photo.');
              document.querySelector('.joint-editor')?.scrollIntoView({behavior:'smooth',block:'start'});
            }
          }}
        />
      </section>
      <aside className="editor-panel"><section className="header-editor"><h2>Unit Name</h2><label htmlFor="msf-unit-place">സ്ഥലത്തിന്റെ പേര് മാത്രം<input id="msf-unit-place" type="text" maxLength={45} value={unitName} onChange={e=>setUnitName(e.target.value.replace(/[\r\n]/g,' ').replace(/\s{2,}/g,' '))} placeholder="ഉദാ: ചോക്കാട് / മഞ്ഞപ്പെട്ടി"/></label><p className="unit-heading-preview">MSF {(unitName.trim()||'ചോക്കാട്')} യൂണിറ്റ് കമ്മിറ്റി</p><p className="unit-heading-note">പോസ്റ്ററിൽ സ്ഥിരമായി കാണുന്നത്: ഇനി ഇവർ നയിക്കും</p></section><h1>Leadership photos</h1><button type="button" onClick={resetAll}>Reset all edits</button>
        {people.map((p,i)=><section className="person-editor" key={p.role}>
          <h2>{p.role}</h2>
          <div className="person-photo-preview">{p.photo&&<img src={p.photo} alt={p.role+" uploaded portrait"}/>}<span>{p.photo?"Uploaded photo":"No photo uploaded"}</span></div>
          <label>Name<input ref={el=>nameInputs.current[i]=el} value={p.name} onChange={e=>update(i,{name:e.target.value,nameLayout:'auto'})} maxLength={40}/></label>
          <div className="name-layout-settings">
            <label>Lines
              <select value={p.nameLayout==='manual'?'manual':'auto'} onChange={e=>{
                if(e.target.value==='manual'){const [line1,line2]=nameLines(p);update(i,{nameLayout:'manual',line1,line2});}
                else update(i,{nameLayout:'auto'});
              }}>
                <option value="auto">Auto (maximum 2 lines)</option>
                <option value="manual">Custom 2 lines</option>
              </select>
            </label>
            {p.nameLayout==='manual'&&<div className="name-line-inputs">
              <label>Top line<input value={p.line1||''} maxLength={40} onChange={e=>update(i,{line1:e.target.value})}/></label>
              <label>Bottom line<input value={p.line2||''} maxLength={40} onChange={e=>update(i,{line2:e.target.value})}/></label>
            </div>}
            <label>Bold line
              <select value={p.boldLine||'both'} onChange={e=>update(i,{boldLine:e.target.value})}>
                <option value="both">Both</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
              </select>
            </label>
          </div>
          <div className="actions">
            <button onClick={()=>uploads.current[i]?.click()}><Camera size={16}/> Upload Image</button>
            <button onClick={()=>removeBg(i)} disabled={!p.photo||busy!==-1}><WandSparkles size={16}/>{busy===i?'Processing…':'Remove BG'}</button>
          </div>
          <label className="cutout-fit-toggle"><input type="checkbox" checked={!!p.cutout} onChange={e=>update(i,{cutout:e.target.checked})}/> Fit transparent photo inside green frame</label>
          <input ref={el=>uploads.current[i]=el} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>upload(i,e)}/>
        </section>)}
        <section className="joint-editor"><h2>Committee Sections</h2>
          <div className="joint-group-tabs">{groupNames.map(role=><button type="button" key={role} className={jointRole===role?"active":""} onClick={()=>changeGroup(role)}>{role} ({(role===jointRole?joint:jointGroups[role]||[]).length})</button>)}</div>
          <h3>{jointRole}</h3>
          <p>{joint.length} members · Newest member appears first</p>
          <button type="button" className="add-member-button" disabled={jointRole!=='Executive Members'&&joint.length>=COMMITTEE_LIMIT} onClick={()=>{if(jointRole!=='Executive Members'&&joint.length>=COMMITTEE_LIMIT)return;setJoint(v=>[{name:'',photo:'',nameLayout:'auto',boldLine:'both'},...v]);}}>+ Add Member</button>
          {jointRole!=='Executive Members'&&joint.length>=COMMITTEE_LIMIT&&<p className="limit-message">Maximum 4 members reached for {jointRole}.</p>}
          {joint.map((p,i)=><div className="joint-editor-member" key={i}>
            <div className="joint-editor-heading"><strong>Member {i+1}</strong><div className="joint-order-actions"><button type="button" disabled={i===0} onClick={()=>moveJoint(i,i-1)} aria-label="Move member left">←</button><button type="button" disabled={i===joint.length-1} onClick={()=>moveJoint(i,i+1)} aria-label="Move member right">→</button><button type="button" onClick={()=>{setJoint(v=>v.filter((_,j)=>j!==i));setJointSelected(null);setMessage('Member removed.')}}>Remove</button></div></div>
            <div className="person-photo-preview">{p.photo&&<img src={p.photo} alt="Uploaded member portrait"/>}<span>{p.photo?"Uploaded photo":"No photo uploaded"}</span></div>
            <label>Name<input value={p.name} maxLength={60} onChange={e=>updateJoint(i,{name:e.target.value,nameLayout:'auto'})}/></label>
            <label>Lines<select value={p.nameLayout==='manual'?'manual':'auto'} onChange={e=>{if(e.target.value==='manual'){const [line1,line2]=nameLines(p);updateJoint(i,{nameLayout:'manual',line1,line2});}else updateJoint(i,{nameLayout:'auto'})}}><option value="auto">Auto (max 2 lines)</option><option value="manual">Custom 2 lines</option></select></label>
            {p.nameLayout==='manual'&&<><label>Top<input value={p.line1||''} onChange={e=>updateJoint(i,{line1:e.target.value})}/></label><label>Bottom<input value={p.line2||''} onChange={e=>updateJoint(i,{line2:e.target.value})}/></label></>}
            <label>Bold<select value={p.boldLine||'both'} onChange={e=>updateJoint(i,{boldLine:e.target.value})}><option value="both">Both</option><option value="top">Top</option><option value="bottom">Bottom</option></select></label>
            <div className="actions"><button type="button" onClick={()=>jointUploads.current[i]?.click()}><Camera size={15}/> Upload</button><button type="button" disabled={!p.photo} onClick={()=>setCrop({joint:i,src:p.photo,square:true})}><Crop size={15}/> Crop</button><button type="button" disabled={!p.photo||busy!==-1} onClick={()=>removeJointBg(i)}><WandSparkles size={15}/>{busy==='joint-'+i?'Processing…':'Remove BG'}</button></div>
            <label className="cutout-fit-toggle"><input type="checkbox" checked={!!p.cutout} onChange={e=>updateJoint(i,{cutout:e.target.checked})}/> Fit transparent photo inside green frame</label>
            <input type="file" accept="image/*" hidden ref={el=>jointUploads.current[i]=el} onChange={e=>uploadJoint(i,e)}/>
          </div>)}
        </section>
        {Object.entries(jointGroups).filter(([role,members])=>role!=='Executive Members'&&members.length>COMMITTEE_LIMIT).map(([role,members])=><p className="limit-message" key={role} role="status">{role} has {members.length} saved members. Remove extras to fit the 4-member limit before export.</p>)}
        {jointRole!=='Executive Members'&&joint.length>COMMITTEE_LIMIT&&<p className="limit-message" role="status">{jointRole} has {joint.length} saved members. Remove extras to fit the 4-member limit before export.</p>}
        {message&&<p role="status" className="message">{message}</p>}
      </aside>
    </div>
    {crop&&<CropDialog src={crop.src} square={!!crop.square} onClose={()=>setCrop(null)} onSave={async src=>{const cutout=await imageHasTransparency(src);if(crop.role){if(crop.role===jointRole)updateJoint(crop.index,{photo:src,cutout});else setJointGroups(g=>({...g,[crop.role]:(g[crop.role]||[]).map((p,i)=>i===crop.index?{...p,photo:src,cutout}:p)}));}else if(Number.isInteger(crop.joint))updateJoint(crop.joint,{photo:src,cutout});else update(crop.i,{photo:src,cutout});setCrop(null);}}/>}
  </main>;
}
