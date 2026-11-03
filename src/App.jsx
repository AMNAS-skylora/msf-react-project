import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Camera, Crop, Download, Minus, Pencil, Plus, WandSparkles } from 'lucide-react';
import { MEMBERS, imageUrl } from './data/committee.js';
import { toBlob } from 'html-to-image';
import ReferencePoster from './ReferencePoster.jsx';
import { removePortraitBackgroundFast, warmPortraitSegmenter } from './fastPortraitBackground.js';
import { removePortraitBackgroundQuality } from './qualityPortraitBackground.js';
import './styles.css';
import './reference-poster.css';
import './portrait-frames.css';
import './inline-portrait-editor.css';

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
  useEffect(()=>{setPhotoEdit(null);},[posterPage]);
  const updateJoint=(i,patch)=>setJoint(current=>current.map((p,j)=>i===j?{...p,...patch}:p));
  async function uploadJoint(i,e) {
    const file=e.target.files?.[0];e.target.value='';
    if(!file)return;
    if(!file.type.startsWith('image/')||file.size>15*1024*1024){
      setMessage('Choose an image under 15 MB.');return;
    }
    try {
      const src=await toDataURL(file);
      // Upload is immediate. Crop remains an optional action in Adjust photo.
      updateJoint(i,await prepareUploadedPortrait(src));
      setPhotoEdit({role:jointRole,index:i});
      if(autoRemoveUpload)warmPortraitSegmenter();
    }catch {setMessage('Unable to read photo.');}
  }
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

  const [photoEdit,setPhotoEdit] = useState(null);
  const [autoRemoveUpload,setAutoRemoveUpload]=useState(()=>{try{return localStorage.getItem('msf-auto-remove-bg')==='true';}catch{return false;}});
  useEffect(()=>{try{localStorage.setItem('msf-auto-remove-bg',String(autoRemoveUpload));}catch{}},[autoRemoveUpload]);
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
    try {
      const src=await toDataURL(file);
      // Keep the entire image; do not force a crop step on upload.
      update(i,await prepareUploadedPortrait(src));
      setPhotoEdit({role:'leader',index:i});
      if(autoRemoveUpload)warmPortraitSegmenter();
    } catch {setMessage('Unable to read photo.');}
  }
  async function removeBackgroundSource(source) {
    return removePortraitBackgroundQuality(source);
  }
  async function removeBg(i) {
    const member=people[i];
    if(!member?.photo||busy!==-1)return;
    const original=member.originalPhoto||(!member.cutout?member.photo:null);
    const source=original||member.photo;
    setBusy(i);
    setMessage('Removing background…');
    try {
      const transparent=await removeBackgroundSource(source);
      update(i,{photo:transparent,...(original?{originalPhoto:original}:{}),cutout:true,photoMode:'popout',photoZoom:1,photoX:0,photoY:0});
      setMessage('Background removed.');
    }catch(error){
      setMessage('Background removal failed: '+(error?.message||'Please try again.'));
    }finally{setBusy(-1);}
  }
  async function removeJointBg(i) {
    const member=joint[i];
    if(!member?.photo||busy!==-1)return;
    const original=member.originalPhoto||(!member.cutout?member.photo:null);
    const source=original||member.photo;
    setBusy('joint-'+i);
    setMessage('Removing background…');
    try{
      const transparent=await removeBackgroundSource(source);
      updateJoint(i,{photo:transparent,...(original?{originalPhoto:original}:{}),cutout:true,photoMode:'popout',photoZoom:1,photoX:0,photoY:0});
      setMessage('Background removed.');
    }catch(error){
      setMessage('Background removal failed: '+(error?.message||'Please try again.'));
    }finally{setBusy(-1);}
  }
  // Keep the original crop even if client-side AI removal is unavailable.
  async function prepareUploadedPortrait(src) {
    const transparent=await imageHasTransparency(src);
    const original={
      photo:src,
      originalPhoto:src,
      originalCutout:transparent,
      cutout:transparent,
      photoMode:'inside',
      photoZoom:1,photoX:0,photoY:0
    };
    if(transparent||!autoRemoveUpload)return original;
    setBusy('auto-bg');
    setMessage('Removing background…');
    try{
      const photo=await removeBackgroundSource(src);
      setMessage('Background removed.');
      return {...original,photo,cutout:true,photoMode:'popout'};
    }catch(error){
      setMessage('Original photo saved. Background removal was unavailable.');
      return original;
    }finally{setBusy(-1);}
  }
  const portraitGesture=useRef({
    role:null,index:-1,pointers:new Map(),image:null,
    draft:null,moved:false,pinchDistance:0,pinchZoom:1,lastCenter:null
  });
  // iOS Safari can scroll the body during a touch gesture even when the
  // portrait itself has touch-action:none. Freeze the document while a
  // photo is selected, preserving its original scroll offset.
  useEffect(()=>{
    if(!photoEdit)return;
    const html=document.documentElement;
    const body=document.body;
    const scrollX=window.scrollX;
    const scrollY=window.scrollY;
    const original={
      htmlOverflow:html.style.overflow,
      bodyOverflow:body.style.overflow,
      bodyPosition:body.style.position,
      bodyTop:body.style.top,
      bodyLeft:body.style.left,
      bodyRight:body.style.right,
      bodyWidth:body.style.width,
      bodyTouchAction:body.style.touchAction
    };
    html.classList.add('msf-portrait-editing');
    body.classList.add('msf-portrait-editing');
    html.style.overflow='hidden';
    body.style.overflow='hidden';
    body.style.position='fixed';
    body.style.top=`-${scrollY}px`;
    body.style.left='0';
    body.style.right='0';
    body.style.width='100%';
    body.style.touchAction='none';
    const preventPageTouchScroll=event=>{
      // The fixed toolbar can still scroll sideways to reveal its buttons.
      if(event.target?.closest?.('.inline-photo-toolbar-buttons'))return;
      if(event.cancelable)event.preventDefault();
    };
    document.addEventListener('touchmove',preventPageTouchScroll,{passive:false,capture:true});
    // Safari also dispatches legacy gesture events during a two-finger pinch.
    // Block browser-level scaling while the selected photo handles that pinch.
    const preventBrowserPinch=event=>{if(event.cancelable)event.preventDefault();};
    document.addEventListener('gesturestart',preventBrowserPinch,{passive:false});
    document.addEventListener('gesturechange',preventBrowserPinch,{passive:false});
    return()=>{
      document.removeEventListener('touchmove',preventPageTouchScroll,true);
      document.removeEventListener('gesturestart',preventBrowserPinch);
      document.removeEventListener('gesturechange',preventBrowserPinch);
      html.classList.remove('msf-portrait-editing');
      body.classList.remove('msf-portrait-editing');
      html.style.overflow=original.htmlOverflow;
      body.style.overflow=original.bodyOverflow;
      body.style.position=original.bodyPosition;
      body.style.top=original.bodyTop;
      body.style.left=original.bodyLeft;
      body.style.right=original.bodyRight;
      body.style.width=original.bodyWidth;
      body.style.touchAction=original.bodyTouchAction;
      window.scrollTo(scrollX,scrollY);
    };
  },[!!photoEdit]);
  const memberForEdit=(role,index)=>role==='leader'
    ? people[index]
    : (role===jointRole?joint:(jointGroups[role]||[]))[index];
  const patchPortrait=(role,index,patch)=>{
    if(role==='leader')update(index,patch);
    else if(role===jointRole)updateJoint(index,patch);
    else setJointGroups(groups=>({
      ...groups,[role]:(groups[role]||[]).map((person,i)=>i===index?{...person,...patch}:person)
    }));
  };
  // Native touch tracking is necessary on iOS Safari: a second finger may
  // start outside the small portrait button, so pointer capture on the button
  // alone cannot reliably detect two-finger zoom.
  const directTouch=useRef({active:false,cleanup:null});
  function posterTouchStart(event) {
    if(directTouch.current.active)return;
    const button=event.target.closest?.('.ref-portrait');
    const role=button?.dataset?.portraitRole;
    const index=Number(button?.dataset?.portraitIndex);
    if(!role||!Number.isInteger(index))return;
    const member=memberForEdit(role,index);
    const img=button.querySelector('img');
    if(!member?.photo||!img)return;
    const draft={
      x:Number(member.photoX)||0,
      y:Number(member.photoY)||0,
      zoom:Math.max(.25,Math.min(4.5,Number(member.photoZoom)||1))
    };
    const gesture={
      active:true,role,index,button,img,draft,moved:false,
      lastCenter:null,lastDistance:0,cleanup:null
    };
    directTouch.current=gesture;
    setPhotoEdit(current=>current?.role===role&&current?.index===index?current:{role,index});
    const getTouches=ev=>Array.from(ev.touches||[]).slice(0,2);
    const centerOf=touches=>({
      x:touches.reduce((sum,t)=>sum+t.clientX,0)/touches.length,
      y:touches.reduce((sum,t)=>sum+t.clientY,0)/touches.length
    });
    function rebase(ev) {
      const touches=getTouches(ev);
      gesture.lastCenter=touches.length?centerOf(touches):null;
      gesture.lastDistance=touches.length===2
        ?Math.max(1,Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY))
        :0;
    }
    function touchMove(ev) {
      if(!gesture.active)return;
      if(ev.cancelable)ev.preventDefault();
      const touches=getTouches(ev);
      if(!touches.length)return;
      const center=centerOf(touches);
      const bounds=button.getBoundingClientRect();
      if(gesture.lastCenter) {
        const dx=center.x-gesture.lastCenter.x;
        const dy=center.y-gesture.lastCenter.y;
        gesture.draft.x=Math.max(-80,Math.min(80,gesture.draft.x+dx/Math.max(1,bounds.width)*100));
        gesture.draft.y=Math.max(-80,Math.min(80,gesture.draft.y+dy/Math.max(1,bounds.height)*100));
        if(dx||dy)gesture.moved=true;
      }
      if(touches.length===2) {
        const distance=Math.max(1,Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY));
        if(gesture.lastDistance>0){
          const nextZoom=Math.max(.25,Math.min(4.5,gesture.draft.zoom*distance/gesture.lastDistance));
          if(nextZoom!==gesture.draft.zoom)gesture.moved=true;
          gesture.draft.zoom=nextZoom;
        }
        gesture.lastDistance=distance;
      }else {
        gesture.lastDistance=0;
      }
      gesture.lastCenter=center;
      img.style.transform=`translate(${gesture.draft.x}%, ${gesture.draft.y}%) scale(${gesture.draft.zoom})`;
    }
    function touchEnd(ev) {
      if(!gesture.active)return;
      rebase(ev);
      if((ev.touches||[]).length)return;
      gesture.cleanup?.();
      gesture.active=false;
      directTouch.current={active:false,cleanup:null};
      if(gesture.moved)patchPortrait(role,index,{
        photoX:gesture.draft.x,photoY:gesture.draft.y,photoZoom:gesture.draft.zoom
      });
    }
    const opts={capture:true,passive:false};
    document.addEventListener('touchstart',rebase,opts);
    document.addEventListener('touchmove',touchMove,opts);
    document.addEventListener('touchend',touchEnd,opts);
    document.addEventListener('touchcancel',touchEnd,opts);
    gesture.cleanup=()=>{
      document.removeEventListener('touchstart',rebase,true);
      document.removeEventListener('touchmove',touchMove,true);
      document.removeEventListener('touchend',touchEnd,true);
      document.removeEventListener('touchcancel',touchEnd,true);
    };
    rebase(event.nativeEvent);
  }
  function portraitPointerDown(event,role,index) {
    // Native touch handling below supports two fingers even when the second
    // touch starts beside the frame. Pointer gestures remain for mouse/pen.
    if(event.pointerType==='touch')return;
    const member=memberForEdit(role,index);
    if(!member?.photo)return;
    event.preventDefault();
    const gesture=portraitGesture.current;
    // Select before modifying, but never open another editor or navigate.
    if(gesture.role!==role||gesture.index!==index||!gesture.draft){
      gesture.pointers.clear();
      gesture.role=role;
      gesture.index=index;
      gesture.draft={
        zoom:Math.max(.25,Math.min(4.5,Number(member.photoZoom)||1)),
        x:Number(member.photoX)||0,
        y:Number(member.photoY)||0
      };
      gesture.image=event.currentTarget.querySelector('img');
      gesture.moved=false;
      gesture.pinchDistance=0;
      gesture.lastCenter=null;
    }
    try{event.currentTarget.setPointerCapture(event.pointerId);}catch{}
    gesture.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(gesture.pointers.size===2){
      const [a,b]=[...gesture.pointers.values()];
      gesture.pinchDistance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
      gesture.pinchZoom=gesture.draft.zoom;
      gesture.lastCenter={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    }
    setPhotoEdit(current=>current?.role===role&&current?.index===index?current:{role,index});
  }
  function portraitPointerMove(event) {
    if(event.pointerType==='touch')return;
    const gesture=portraitGesture.current;
    const previous=gesture.pointers.get(event.pointerId);
    if(!previous||!gesture.draft)return;
    event.preventDefault();
    const next={x:event.clientX,y:event.clientY};
    gesture.pointers.set(event.pointerId,next);
    const bounds=event.currentTarget.getBoundingClientRect();
    const width=Math.max(1,bounds.width);
    const height=Math.max(1,bounds.height);
    const move=(dx,dy)=>{
      gesture.draft.x=Math.max(-65,Math.min(65,gesture.draft.x+dx/width*100));
      gesture.draft.y=Math.max(-65,Math.min(65,gesture.draft.y+dy/height*100));
    };
    if(gesture.pointers.size>=2){
      const [a,b]=[...gesture.pointers.values()];
      const distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
      const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      if(gesture.pinchDistance){
        gesture.draft.zoom=Math.max(.25,Math.min(4.5,gesture.pinchZoom*distance/gesture.pinchDistance));
      }
      if(gesture.lastCenter){
        move(center.x-gesture.lastCenter.x,center.y-gesture.lastCenter.y);
      }
      gesture.lastCenter=center;
      gesture.moved=true;
    }else{
      const dx=next.x-previous.x;
      const dy=next.y-previous.y;
      if(dx||dy){
        move(dx,dy);
        gesture.moved=true;
      }
    }
    // Change only this image during the gesture. Persist a single state
    // update on pointer release instead of re-saving large photos each frame.
    if(gesture.image){
      const {x,y,zoom}=gesture.draft;
      gesture.image.style.transform=`translate(${x}%, ${y}%) scale(${zoom})`;
    }
  }
  function portraitPointerUp(event) {
    if(event.pointerType==='touch')return;
    const gesture=portraitGesture.current;
    if(!gesture.pointers.has(event.pointerId))return;
    gesture.pointers.delete(event.pointerId);
    if(gesture.pointers.size===1){
      // One remaining finger continues dragging from the last position.
      gesture.pinchDistance=0;
      gesture.lastCenter=null;
      return;
    }
    if(gesture.pointers.size>1)return;
    if(gesture.moved&&gesture.draft){
      const {zoom,x,y}=gesture.draft;
      patchPortrait(gesture.role,gesture.index,{photoZoom:zoom,photoX:x,photoY:y});
    }
    gesture.role=null;
    gesture.index=-1;
    gesture.image=null;
    gesture.draft=null;
    gesture.moved=false;
    gesture.pinchDistance=0;
    gesture.lastCenter=null;
  }
  // One-tap zoom for small photo frames where two-finger pinch is awkward.
  // Work on the photo only; the green arched shape stays at its original size.
  function zoomSelectedPortrait(role,index,direction) {
    const member=memberForEdit(role,index);
    if(!member?.photo)return;
    const current=Math.max(.25,Math.min(4.5,Number(member.photoZoom)||1));
    const next=Math.max(.25,Math.min(4.5,Math.round((current+direction*.15)*100)/100));
    patchPortrait(role,index,{photoZoom:next});
  }
  async function removeSelectedPortraitBackground() {
    if(!photoEdit||busy!==-1)return;
    const {role,index}=photoEdit;
    const member=memberForEdit(role,index);
    if(!member?.photo)return;
    const original=member.originalPhoto||(!member.cutout?member.photo:null);
    const source=original||member.photo;
    setBusy('inline-bg');
    setMessage('Removing background…');
    try{
      const transparent=await removeBackgroundSource(source);
      patchPortrait(role,index,{
        photo:transparent,...(original?{originalPhoto:original}:{}),
        cutout:true,photoMode:'popout',photoZoom:1,photoX:0,photoY:0
      });
      setMessage('');
    }catch(error){
      setMessage('Background removal failed: '+(error?.message||'Please try again.'));
    }finally{setBusy(-1);}
  }
  function resetSelectedPortrait(role,index){
    const member=memberForEdit(role,index);
    if(!member?.photo)return;
    const original=member.originalPhoto||(!member.cutout?member.photo:null);
    if(!original){
      setMessage('Original photo unavailable for this older cutout. Re-upload the photo to enable Reset.');
      return;
    }
    patchPortrait(role,index,{
      photo:original,
      originalPhoto:original,
      cutout:member.originalCutout??false,
      photoMode:'inside',
      photoZoom:1,photoX:0,photoY:0,
    });
    setMessage('');
  }
  function cropSelectedPortrait() {
    if(!photoEdit)return;
    const {role,index}=photoEdit;
    const person=memberForEdit(role,index);
    if(!person?.photo)return;
    if(role==='leader')setCrop({i:index,src:person.photo,fromExisting:true});
    else setCrop({role,index,src:person.photo,square:true,fromExisting:true});
  }
  function savePortraitChanges(role,index,patch) {
    if(role==='leader')update(index,patch);
    else if(role===jointRole)updateJoint(index,patch);
    else setJointGroups(group=>({...group,[role]:(group[role]||[]).map((p,i)=>i===index?{...p,...patch}:p)}));
    setPhotoEdit(null);
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
      filter:element=>!element.classList || !['photo-toolbar','photo-selection-handle','joint-crop-button','ref-camera-placeholder','ref-photo-selection-ring'].some(cls=>element.classList.contains(cls)),
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
      <div className="poster-edit-stage">
      <section className="frame" ref={frameRef} onTouchStart={posterTouchStart} aria-label="MSF poster preview">
        <ReferencePoster
          people={people}
          unitName={unitName}
          page={posterPage}
          pageCount={posterPageCount}
          membersFor={posterMembersFor}
          onLeaderClick={(index,person)=>person.photo?setPhotoEdit({role:'leader',index}):uploads.current[index]?.click()}
          editingPhoto={photoEdit}
          onPortraitPointerDown={portraitPointerDown}
          onPortraitPointerMove={portraitPointerMove}
          onPortraitPointerUp={portraitPointerUp}
          onMemberClick={(role,index)=>{
            const members=role===jointRole?joint:(jointGroups[role]||[]);
            if(members[index]?.photo){
              setPhotoEdit({role,index});
            }else{
              if(role!==jointRole)changeGroup(role);
              setJointSelected(index);
              setMessage('Use Upload in '+role+' to add this member photo.');
              document.querySelector('.joint-editor')?.scrollIntoView({behavior:'smooth',block:'start'});
            }
          }}
        />
      </section>
      </div>
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
            <button type="button" disabled={!p.photo} onClick={()=>setPhotoEdit({role:'leader',index:i})}><Crop size={16}/> Adjust / Zoom</button>
            <button onClick={()=>removeBg(i)} disabled={!p.photo||busy!==-1}><WandSparkles size={16}/>{busy===i?'Processing…':'Remove BG'}</button>
          </div>
          <label className="cutout-fit-toggle"><input type="checkbox" checked={!!p.cutout} onChange={e=>update(i,{cutout:e.target.checked})}/> Fit transparent photo inside green frame</label>
          <input ref={el=>uploads.current[i]=el} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>upload(i,e)}/>
        </section>)}
        <section className="auto-removal-setting"><label><input type="checkbox" checked={autoRemoveUpload} onChange={event=>setAutoRemoveUpload(event.target.checked)}/> <span>Auto Remove BG on Upload</span></label></section>
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
            <div className="actions"><button type="button" onClick={()=>jointUploads.current[i]?.click()}><Camera size={15}/> Upload</button><button type="button" disabled={!p.photo} onClick={()=>setPhotoEdit({role:jointRole,index:i})}><Crop size={15}/> Adjust / Zoom</button><button type="button" disabled={!p.photo||busy!==-1} onClick={()=>removeJointBg(i)}><WandSparkles size={15}/>{busy==='joint-'+i?'Processing…':'Remove BG'}</button></div>
            <label className="cutout-fit-toggle"><input type="checkbox" checked={!!p.cutout} onChange={e=>updateJoint(i,{cutout:e.target.checked})}/> Fit transparent photo inside green frame</label>
            <input type="file" accept="image/*" hidden ref={el=>jointUploads.current[i]=el} onChange={e=>uploadJoint(i,e)}/>
          </div>)}
        </section>
        {Object.entries(jointGroups).filter(([role,members])=>role!=='Executive Members'&&members.length>COMMITTEE_LIMIT).map(([role,members])=><p className="limit-message" key={role} role="status">{role} has {members.length} saved members. Remove extras to fit the 4-member limit before export.</p>)}
        {jointRole!=='Executive Members'&&joint.length>COMMITTEE_LIMIT&&<p className="limit-message" role="status">{jointRole} has {joint.length} saved members. Remove extras to fit the 4-member limit before export.</p>}
        {message&&<p role="status" className="message">{message}</p>}
      </aside>
    </div>
    {photoEdit&&!crop&&(()=>{
      const {role,index}=photoEdit;
      const person=memberForEdit(role,index);
      if(!person?.photo)return null;
      return <div className="inline-photo-toolbar" role="toolbar" aria-label="Photo position controls">
        <div className="inline-photo-toolbar-heading">
          <span>{person.name||role} <small>· Drag / pinch photo</small></span>
          <button type="button" className="inline-photo-done" onClick={()=>setPhotoEdit(null)}>Done</button>
        </div>
        <div className="inline-photo-zoom" role="group" aria-label="Change photo size">
          <button type="button" onClick={()=>zoomSelectedPortrait(role,index,-1)}
            disabled={(Number(person.photoZoom)||1)<=.25} aria-label="Make photo smaller">
            <Minus size={19}/> <span>Smaller</span>
          </button>
          <strong aria-live="polite">{Math.round((Number(person.photoZoom)||1)*100)}%</strong>
          <button type="button" onClick={()=>zoomSelectedPortrait(role,index,1)}
            disabled={(Number(person.photoZoom)||1)>=4.5} aria-label="Make photo bigger">
            <Plus size={19}/> <span>Bigger</span>
          </button>
        </div>
        <div className="inline-photo-toolbar-buttons">
          <button type="button" className={person.photoMode!=='popout'?'is-active':''}
            onClick={()=>patchPortrait(role,index,{photoMode:'inside'})}>Inside</button>
          <button type="button" disabled={!person.cutout} className={person.photoMode==='popout'?'is-active':''}
            onClick={()=>patchPortrait(role,index,{photoMode:'popout'})}>Pop out</button>
          <button type="button" onClick={cropSelectedPortrait}>Crop</button>
          <button type="button" disabled={busy!==-1} onClick={removeSelectedPortraitBackground}>{busy==='inline-bg'?'Removing…':'Remove BG'}</button>
          <button type="button" onClick={()=>resetSelectedPortrait(role,index)} title="Restore the original uploaded photo, background and position">Reset photo</button>
        </div>
      </div>;
    })()}
    {crop&&<CropDialog
      src={crop.src}
      square={!!crop.square}
      onClose={()=>setCrop(null)}
      onSave={async src=>{
        const currentCrop=crop;
        setCrop(null);
        const patch=currentCrop.fromExisting
          ? {
              photo:src,
              cutout:await imageHasTransparency(src),
              photoMode:'inside',photoZoom:1,photoX:0,photoY:0
            }
          : await prepareUploadedPortrait(src);
        if(currentCrop.role){
          if(currentCrop.role===jointRole)updateJoint(currentCrop.index,patch);
          else setJointGroups(g=>({...g,[currentCrop.role]:(g[currentCrop.role]||[]).map((p,i)=>i===currentCrop.index?{...p,...patch}:p)}));
          setPhotoEdit({role:currentCrop.role,index:currentCrop.index});
        }else if(Number.isInteger(currentCrop.joint)){
          updateJoint(currentCrop.joint,patch);
          setPhotoEdit({role:jointRole,index:currentCrop.joint});
        }else{
          update(currentCrop.i,patch);
          setPhotoEdit({role:'leader',index:currentCrop.i});
        }
      }}
    />}
  </main>;
}
