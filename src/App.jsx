import { useEffect, useRef, useState } from 'react';
import { Camera, Crop, Download, Pencil, WandSparkles } from 'lucide-react';
import { MEMBERS, imageUrl } from './data/committee.js';
import './styles.css';

const INITIAL = [
  { role: 'President', member: MEMBERS.find(m => m.role === 'President') },
  { role: 'Secretary', member: MEMBERS.find(m => m.role === 'Secretary') },
  { role: 'Treasurer', member: MEMBERS.find(m => m.role === 'Treasurer') },
];
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
  const [people,setPeople] = useState(INITIAL.map(({role,member})=>({role,name:member?.name||'',photo:member?imageUrl(member):'',cutout:false,x:8+INITIAL.findIndex(v=>v.role===role)*30,y:63,w:27})));
  const [ready,setReady]=useState(false);
  const [joint,setJoint]=useState([]);
  const [jointRole,setJointRole]=useState('Joint Secretaries');
  const jointUploads=useRef([]);
  const moveJoint=(from,to)=>setJoint(current=>{if(to<0||to>=current.length)return current;const next=[...current];const [item]=next.splice(from,1);next.splice(to,0,item);return next;});
  const [jointSelected,setJointSelected]=useState(null);
  const jointRows=n=>Array.from({length:Math.ceil(n/5)},(_,i)=>Math.min(5,n-i*5));
  const updateJoint=(i,patch)=>setJoint(current=>current.map((p,j)=>i===j?{...p,...patch}:p));
  async function uploadJoint(i,e){const file=e.target.files?.[0];e.target.value='';if(!file)return;if(!file.type.startsWith('image/')||file.size>15*1024*1024){setMessage('Choose an image under 15 MB.');return;}try{setCrop({joint:i,src:await toDataURL(file),square:true});}catch{setMessage('Unable to read photo.');}}

  const [selected,setSelected]=useState(null);
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
      get.onsuccess=()=>{if(active&&Array.isArray(get.result)&&get.result.length===3)setPeople(get.result);if(active)setReady(true);db.close();};
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
  useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem('msf-joint-members')||'null');if(saved){setJoint(Array.isArray(saved.members)?saved.members:[]);setJointRole(saved.role||'Joint Secretaries');}}catch{}},[]);
  useEffect(()=>{try{localStorage.setItem('msf-joint-members',JSON.stringify({members:joint,role:jointRole}));}catch{}},[joint,jointRole]);
  function resetAll(){
    if(!window.confirm('Reset all names and photos to the original values?'))return;
    setPeople(INITIAL.map(({role,member})=>({role,name:member?.name||'',photo:member?imageUrl(member):'',cutout:false,x:8+INITIAL.findIndex(v=>v.role===role)*30,y:63,w:27})));
    setJoint([]);setJointRole('Joint Secretaries');setMessage('All changes reset.');
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
  async function download() {
    try {
      await document.fonts.ready;
      const canvas=document.createElement('canvas');canvas.width=1050;canvas.height=1472;
      const ctx=canvas.getContext('2d');
      const bg=await loadImage(`${import.meta.env.BASE_URL}assets/msf-stage-background.svg`);
      ctx.drawImage(bg,0,0,1050,1472);
      for(let i=0;i<3;i++){
        const p=people[i],pos=position(p,i);
        try{
          const img=await loadImage(p.photo);
          const w=pos.w*10.5,h=w*img.height/img.width;
          ctx.drawImage(img,pos.x*10.5,pos.y*14.72,w,h);
        }catch{}
        const x=90+i*305;
        ctx.fillStyle='#08763c';ctx.fillRect(x-8,1350,296,88);
        ctx.textAlign='center';ctx.fillStyle='white';
        ctx.font='bold 16px Arial';ctx.fillText(p.role.toUpperCase(),x+140,1375);
        const lines=nameLines(p).filter(Boolean);
        const bold=p.boldLine||'both';
        const lineY=lines.length===2?[1400,1426]:[1413];
        for(let j=0;j<lines.length;j++){
          const weight=bold==='both'||bold===(j===0?'top':'bottom')?'bold':'normal';
          fitText(ctx,lines[j].toUpperCase(),276,lines.length===2?30:38,weight);
          ctx.fillText(lines[j].toUpperCase(),x+140,lineY[j]);
        }
      }
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw new Error('Export failed');
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download='msf-leadership-poster.png';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(error){setMessage(error.message||'Could not export PNG.');}
  }
  return <main className="app-shell">
    <div className="editor-bar"><div><strong>MSF Poster Creator</strong></div><button onClick={download}><Download size={17}/> Download PNG</button></div>
    <div className="workspace">
      <section className="frame" ref={frameRef} aria-label="MSF poster frame">
        <img className="frame-bg" src={`${import.meta.env.BASE_URL}assets/msf-stage-background.svg`} alt="MSF green poster frame with flag"/>
        {people.map((p,i)=>{const pos=position(p,i);return p.photo&&<div key={p.role} className={'canvas-photo'+(selected===i?' active':'')}
          style={{left:pos.x+'%',top:pos.y+'%',width:pos.w+'%',zIndex:selected===i?8:2}}
          onPointerDown={e=>dragStart(e,i)} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd} onWheel={e=>zoomPhoto(e,i)}>
          <img src={p.photo} alt={p.name} draggable={false}/>
          {selected===i&&<>
            <div className="photo-toolbar" onPointerDown={e=>e.stopPropagation()} onPointerMove={e=>e.stopPropagation()}>
              <button type="button" onClick={e=>{e.stopPropagation();setCrop({i,src:p.photo})}} aria-label="Crop photo" title="Crop"><Crop size={17}/></button>
              <button type="button" onClick={e=>{e.stopPropagation();editName(i)}} aria-label="Edit name" title="Edit name"><Pencil size={17}/></button>
              <button type="button" aria-label="Close photo tools" onClick={e=>{e.stopPropagation();setSelected(null)}}>×</button>
            </div>
            <span className="photo-selection-handle" data-resize="true" aria-label="Resize photo"/>
          </>}
        </div>})}
        <div className="canvas-labels">{people.map(p=><div className="canvas-label" key={p.role}><small>{p.role.toUpperCase()}</small><div className="name-lines">{nameLines(p).filter(Boolean).map((line,j)=><span key={j} className={(p.boldLine||'both')==='both'||(p.boldLine||'both')===(j===0?'top':'bottom')?'is-bold':'is-regular'}>{line.toUpperCase()}</span>)}</div></div>)}</div>
        {joint.length>0&&<div className="joint-poster-section">
          <h2>{jointRole.toUpperCase()}</h2>
          {(()=>{let start=0;return jointRows(joint.length).map((count,row)=>{const members=joint.slice(start,start+count);start+=count;return <div className="joint-poster-row" key={row}>{members.map((p,k)=><div className="joint-poster-member" key={row+'-'+k}>
            <button type="button" className="joint-square" onClick={()=>setJointSelected(joint.indexOf(p))} aria-label={'Select '+(p.name||'member')}>{p.photo?<img src={p.photo} alt={p.name}/>:<Camera size={18}/>}</button>
            {jointSelected===joint.indexOf(p)&&<button type="button" className="joint-crop-button" onClick={()=>p.photo?setCrop({joint:joint.indexOf(p),src:p.photo,square:true}):jointUploads.current[joint.indexOf(p)]?.click()}><Crop size={13}/> Crop</button>}
            <div className="joint-member-name">{nameLines(p).filter(Boolean).map((line,i)=><span key={i} style={{fontWeight:(p.boldLine||'both')==='both'||p.boldLine===(i===0?'top':'bottom')?800:400}}>{line.toUpperCase()}</span>)}</div>
          </div>)}</div>})})()}
        </div>}
      </section>
      <aside className="editor-panel"><h1>Leadership photos</h1><button type="button" onClick={resetAll}>Reset all edits</button>
        {people.map((p,i)=><section className="person-editor" key={p.role}>
          <h2>{p.role}</h2>
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
          <input ref={el=>uploads.current[i]=el} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>upload(i,e)}/>
        </section>)}
        <section className="joint-editor"><h2>Joint Committee</h2>
          <label>Heading<select value={jointRole} onChange={e=>setJointRole(e.target.value)}><option>Joint Secretaries</option><option>Joint Presidents</option></select></label>
          <p>{joint.length} members</p>
          <button type="button" onClick={()=>setJoint(v=>[...v,{name:'',photo:'',nameLayout:'auto',boldLine:'both'}])}>+ Add Member</button>
          {joint.map((p,i)=><div className="joint-editor-member" key={i}>
            <div className="joint-editor-heading"><strong>Member {i+1}</strong><div className="joint-order-actions"><button type="button" disabled={i===0} onClick={()=>moveJoint(i,i-1)} aria-label="Move member left">←</button><button type="button" disabled={i===joint.length-1} onClick={()=>moveJoint(i,i+1)} aria-label="Move member right">→</button><button type="button" onClick={()=>{setJoint(v=>v.filter((_,j)=>j!==i));setJointSelected(null)}}>Remove</button></div>
            <label>Name<input value={p.name} maxLength={60} onChange={e=>updateJoint(i,{name:e.target.value,nameLayout:'auto'})}/></label>
            <label>Lines<select value={p.nameLayout==='manual'?'manual':'auto'} onChange={e=>{if(e.target.value==='manual'){const [line1,line2]=nameLines(p);updateJoint(i,{nameLayout:'manual',line1,line2});}else updateJoint(i,{nameLayout:'auto'})}}><option value="auto">Auto (max 2 lines)</option><option value="manual">Custom 2 lines</option></select></label>
            {p.nameLayout==='manual'&&<><label>Top<input value={p.line1||''} onChange={e=>updateJoint(i,{line1:e.target.value})}/></label><label>Bottom<input value={p.line2||''} onChange={e=>updateJoint(i,{line2:e.target.value})}/></label></>}
            <label>Bold<select value={p.boldLine||'both'} onChange={e=>updateJoint(i,{boldLine:e.target.value})}><option value="both">Both</option><option value="top">Top</option><option value="bottom">Bottom</option></select></label>
            <div className="actions"><button type="button" onClick={()=>jointUploads.current[i]?.click()}><Camera size={15}/> Upload</button><button type="button" disabled={!p.photo} onClick={()=>setCrop({joint:i,src:p.photo,square:true})}><Crop size={15}/> Crop</button></div>
            <input type="file" accept="image/*" hidden ref={el=>jointUploads.current[i]=el} onChange={e=>uploadJoint(i,e)}/>
          </div>)}
        </section>
        {message&&<p role="status" className="message">{message}</p>}
      </aside>
    </div>
    {crop&&<CropDialog src={crop.src} square={!!crop.square} onClose={()=>setCrop(null)} onSave={src=>{if(Number.isInteger(crop.joint))updateJoint(crop.joint,{photo:src});else update(crop.i,{photo:src,cutout:false});setCrop(null);}}/>}
  </main>;
}
