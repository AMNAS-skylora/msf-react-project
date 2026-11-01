import { useRef, useState } from 'react';
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
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const img = await loadImage(src);
      const canvas = document.createElement('canvas'); canvas.width = 700; canvas.height = 900;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(700 / img.width, 900 / img.height) * zoom;
      const w = img.width * scale, h = img.height * scale;
      const dx = (700 - w) * x / 100, dy = (900 - h) * y / 100;
      ctx.drawImage(img, dx, dy, w, h);
      onSave(canvas.toDataURL('image/png'));
    } catch { alert('Unable to crop this photo.'); }
    finally { setBusy(false); }
  }
  return <div className="crop-overlay" role="dialog" aria-modal="true" aria-label="Crop portrait">
    <div className="crop-dialog"><h2>Crop portrait</h2>
      <div className="crop-preview"><img src={src} alt="Crop preview" style={{transform:`scale(${zoom})`,objectPosition:`${x}% ${y}%`}} /></div>
      <label>Zoom <input type="range" min="1" max="3" step=".05" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label>
      <label>Horizontal position <input type="range" min="0" max="100" value={x} onChange={e=>setX(Number(e.target.value))}/></label>
      <label>Vertical position <input type="range" min="0" max="100" value={y} onChange={e=>setY(Number(e.target.value))}/></label>
      <div className="actions"><button onClick={onClose}>Cancel</button><button disabled={busy} onClick={save}>{busy?'Cropping…':'Apply crop'}</button></div>
    </div>
  </div>;
}
export default function App() {
  const [people,setPeople] = useState(INITIAL.map(({role,member})=>({role,name:member?.name||'',photo:member?imageUrl(member):'',cutout:false})));
  const [crop,setCrop] = useState(null);
  const [busy,setBusy] = useState(-1);
  const [message,setMessage] = useState('');
  const uploads=useRef([]);
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
      <aside className="editor-panel"><h1>Leadership photos</h1><p>Upload, crop and remove backgrounds for the three office bearers. Changes preview instantly on the frame.</p>
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
