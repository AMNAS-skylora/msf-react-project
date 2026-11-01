import { useEffect, useRef, useState } from 'react';
import { Camera, Download, Scissors, WandSparkles } from 'lucide-react';
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
function CropDialog({ src, onSave, onClose }) {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const [box, setBox] = useState({ x: 15, y: 10, w: 70, h: 80 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({x:0,y:0});
  const [busy, setBusy] = useState(false);
  const [mode,setMode] = useState('move');
  function pointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const rect=e.currentTarget.getBoundingClientRect();
    const px=(e.clientX-rect.left)/rect.width*100,py=(e.clientY-rect.top)/rect.height*100;
    const threshold=7;
    const edgeX=Math.abs(px-box.x)<threshold?'left':Math.abs(px-box.x-box.w)<threshold?'right':null;
    const edgeY=Math.abs(py-box.y)<threshold?'top':Math.abs(py-box.y-box.h)<threshold?'bottom':null;
    gesture.current={startX:e.clientX,startY:e.clientY,box:{...box},offset:{...offset},zoom,edgeX,edgeY,mode:edgeX||edgeY?'resize':'move'};
  }
  function pointerMove(e) {
    if(!pointers.current.has(e.pointerId)||!gesture.current)return;
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const rect=e.currentTarget.getBoundingClientRect();
    const g=gesture.current;
    if(pointers.current.size===2){
      const pts=[...pointers.current.values()];
      const distance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
      if(!g.pinchDistance){g.pinchDistance=distance;g.pinchZoom=zoom;}
      setZoom(Math.max(1,Math.min(4,g.pinchZoom*distance/g.pinchDistance)));
      return;
    }
    const dx=(e.clientX-g.startX)/rect.width*100,dy=(e.clientY-g.startY)/rect.height*100;
    if(g.mode==='resize'){
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
      const width=stage.clientWidth,height=stage.clientHeight;
      const output=document.createElement('canvas');
      output.width=700;output.height=Math.round(700*(box.h*height)/(box.w*width));
      const ctx=output.getContext('2d');
      const base=Math.max(width/img.width,height/img.height)*zoom;
      const iw=img.width*base,ih=img.height*base;
      const left=(width-iw)/2+offset.x*width/100,top=(height-ih)/2+offset.y*height/100;
      const cropX=box.x*width/100,cropY=box.y*height/100;
      const scale=output.width/(box.w*width/100);
      ctx.drawImage(img,(left-cropX)*scale,(top-cropY)*scale,iw*scale,ih*scale);
      onSave(output.toDataURL('image/png'));
    }catch{alert('Unable to crop this image.');}finally{setBusy(false);}
  }
  return <div className="crop-overlay" role="dialog" aria-modal="true" aria-label="Crop portrait">
    <div className="crop-dialog"><h2>Crop portrait</h2><p>Drag photo to move. Drag crop edges or corners to resize. Pinch to zoom.</p>
      <div className="touch-crop" ref={canvasRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
        <img src={src} draggable={false} alt="Photo to crop" style={{transform:`translate(${offset.x}%,${offset.y}%) scale(${zoom})`}} />
        <div className="crop-selection" style={{left:box.x+'%',top:box.y+'%',width:box.w+'%',height:box.h+'%'}}>
          <div className="crop-grid"/>{['tl','tr','bl','br'].map(k=><span key={k} className={'crop-handle '+k}/>)}
        </div>
      </div>
      <label>Zoom <input type="range" min="1" max="4" step=".05" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label>
      <div className="actions"><button onClick={onClose}>Cancel</button><button disabled={busy} onClick={save}>{busy?'Cropping…':'Apply crop'}</button></div>
    </div>
  </div>;
}
export default function App() {
  const [people,setPeople] = useState(INITIAL.map(({role,member})=>({role,name:member?.name||'',photo:member?imageUrl(member):'',cutout:false})));
  const [ready,setReady]=useState(false);
  const [crop,setCrop] = useState(null);
  const [busy,setBusy] = useState(-1);
  const [message,setMessage] = useState('');
  const uploads=useRef([]);
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
  function resetAll(){
    if(!window.confirm('Reset all names and photos to the original values?'))return;
    setPeople(INITIAL.map(({role,member})=>({role,name:member?.name||'',photo:member?imageUrl(member):'',cutout:false})));
    setMessage('All changes reset.');
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
        const p=people[i], x=90+i*305, y=930;
        try {
          const img=await loadImage(p.photo);
          const scale=Math.min(280/img.width,420/img.height);
          const w=img.width*scale,h=img.height*scale;
          ctx.drawImage(img,x+(280-w)/2,y+420-h,w,h);
        }catch{}
        ctx.fillStyle='#08763c';ctx.fillRect(x-8,1350,296,88);
        ctx.textAlign='center';ctx.fillStyle='white';
        ctx.font='bold 21px Arial';ctx.fillText(p.role.toUpperCase(),x+140,1380);
        ctx.font='bold 32px Arial';ctx.fillText(p.name.toUpperCase(),x+140,1417,280);
      }
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw new Error('Export failed');
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download='msf-leadership-poster.png';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(error){setMessage(error.message||'Could not export PNG.');}
  }
  return <main className="app-shell">
    <div className="editor-bar"><div><strong>MSF Poster Creator</strong><span>Step 1 · Leadership portraits</span></div><button onClick={download}><Download size={17}/> Download PNG</button></div>
    <div className="workspace">
      <section className="frame" aria-label="MSF poster frame">
        <img className="frame-bg" src={`${import.meta.env.BASE_URL}assets/msf-stage-background.svg`} alt="MSF green poster frame with flag"/>
        <div className="portrait-row">{people.map((p,i)=><div className="poster-person" key={p.role}>
          <div className="poster-photo">{p.photo&&<img src={p.photo} alt={p.name}/>}</div>
          <div className="poster-name"><small>{p.role.toUpperCase()}</small><strong>{p.name.toUpperCase()}</strong></div>
        </div>)}</div>
      </section>
      <aside className="editor-panel"><h1>Leadership photos</h1><button type="button" onClick={resetAll}>Reset all edits</button><p>Upload, crop and remove backgrounds for the three office bearers. Changes preview instantly on the frame.</p>
        {people.map((p,i)=><section className="person-editor" key={p.role}>
          <h2>{p.role}</h2>
          <label>Name<input value={p.name} onChange={e=>update(i,{name:e.target.value})} maxLength={40}/></label>
          <div className="actions">
            <button onClick={()=>uploads.current[i]?.click()}><Camera size={16}/> Upload</button>
            <button onClick={()=>setCrop({i,src:p.photo})} disabled={!p.photo}><Scissors size={16}/> Crop</button>
            <button onClick={()=>removeBg(i)} disabled={!p.photo||busy!==-1}><WandSparkles size={16}/>{busy===i?'Processing…':'Remove BG'}</button>
          </div>
          <input ref={el=>uploads.current[i]=el} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>upload(i,e)}/>
        </section>)}
        {message&&<p role="status" className="message">{message}</p>}
      </aside>
    </div>
    {crop&&<CropDialog src={crop.src} onClose={()=>setCrop(null)} onSave={src=>{update(crop.i,{photo:src,cutout:false});setCrop(null);}}/>}
  </main>;
}
