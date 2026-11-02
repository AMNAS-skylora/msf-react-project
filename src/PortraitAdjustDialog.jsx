import { useRef, useState } from 'react';
import { Check, RotateCcw, Scissors, Sparkles, X } from 'lucide-react';

const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const defaults=person=>({
  zoom:clamp(Number(person.photoZoom)||1,.7,3.5),
  x:clamp(Number(person.photoX)||0,-65,65),
  y:clamp(Number(person.photoY)||0,-65,65),
});

export default function PortraitAdjustDialog({person,label,onClose,onSave,onRemoveBackground,onCrop}) {
  const [source,setSource]=useState(person.photo);
  const [cutout,setCutout]=useState(!!person.cutout);
  const [mode,setMode]=useState(person.cutout&&person.photoMode==='popout'?'popout':'inside');
  const [position,setPosition]=useState(()=>defaults(person));
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  const surface=useRef(null);
  const pointers=useRef(new Map());
  const previousDistance=useRef(0);

  function pointerDown(event){
    if(!source)return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.current.size===2){
      const [a,b]=[...pointers.current.values()];
      previousDistance.current=Math.hypot(b.x-a.x,b.y-a.y);
    }
  }
  function pointerMove(event){
    const before=pointers.current.get(event.pointerId);
    if(!before||!surface.current)return;
    event.preventDefault();
    const current={x:event.clientX,y:event.clientY};
    pointers.current.set(event.pointerId,current);
    if(pointers.current.size>=2){
      const [a,b]=[...pointers.current.values()];
      const distance=Math.hypot(b.x-a.x,b.y-a.y);
      if(previousDistance.current>0) {
        const scale=distance/previousDistance.current;
        setPosition(p=>({...p,zoom:clamp(p.zoom*scale,.7,3.5)}));
      }
      previousDistance.current=distance;
    }else{
      const rect=surface.current.getBoundingClientRect();
      const dx=(current.x-before.x)/Math.max(rect.width,1)*100;
      const dy=(current.y-before.y)/Math.max(rect.height,1)*100;
      setPosition(p=>({...p,x:clamp(p.x+dx,-65,65),y:clamp(p.y+dy,-65,65)}));
    }
  }
  function pointerUp(event){
    pointers.current.delete(event.pointerId);
    previousDistance.current=0;
  }
  async function removeBackground(){
    if(working||!source)return;
    setWorking(true);
    setError('');
    try {
      const photo=await onRemoveBackground(source);
      setSource(photo);
      setCutout(true);
      setMode('popout');
      setPosition({zoom:1,x:0,y:0});
    }catch(err){
      setError(err?.message||'Could not remove background. Please try again.');
    }finally{setWorking(false);}
  }
  function reset(){
    setSource(person.photo);
    setCutout(!!person.cutout);
    setMode(person.cutout&&person.photoMode==='popout'?'popout':'inside');
    setPosition(defaults(person));
    setError('');
  }
  function save(){
    onSave({photo:source,cutout,photoMode:cutout?mode:'inside',
      photoPopout:Number(person.photoPopout??15),
      photoZoom:position.zoom,photoX:position.x,photoY:position.y});
  }
  return <div className="portrait-adjust-overlay" role="presentation">
    <section className="portrait-adjust-dialog" role="dialog" aria-modal="true" aria-label={'Adjust photo: '+label}>
      <div className="portrait-adjust-heading">
        <div><strong>Adjust photo</strong><small>{label}</small></div>
        <button type="button" className="portrait-adjust-close" onClick={onClose} aria-label="Close"><X size={21}/></button>
      </div>
      <div className="portrait-adjust-preview" ref={surface} onPointerDown={pointerDown} onPointerMove={pointerMove}
        onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp}
        aria-label="Move photo by dragging; use two fingers to resize">
        <div className={'portrait-adjust-shape'+(cutout&&mode==='popout'?' portrait-adjust-popout':'')}
          style={{'--portrait-overhang':(person.photoPopout??15)+'%'}}>
          {source&&<img src={source} alt="Portrait preview" draggable={false}
            className={cutout?'portrait-adjust-cutout':''}
            style={{transform:`translate(${position.x}%, ${position.y}%) scale(${position.zoom})`}}/>}
        </div>
      </div>
      <div className="portrait-adjust-mode-options">
        <button type="button" className={mode==='inside'?'active':''} aria-pressed={mode==='inside'} onClick={()=>setMode('inside')}>Inside shape</button>
        <button type="button" className={mode==='popout'?'active':''} aria-pressed={mode==='popout'} disabled={!cutout} onClick={()=>setMode('popout')}>Pop out</button>
      </div>
      <div className="portrait-adjust-toolbar">
        <button type="button" onClick={reset}><RotateCcw size={17}/> Reset</button>
        <button type="button" onClick={onCrop}><Scissors size={17}/> Crop</button>
        <button type="button" disabled={working||!source} onClick={removeBackground}><Sparkles size={17}/>{working?'Removing…':'Remove BG'}</button>
      </div>
      {error&&<p role="alert" className="portrait-adjust-error">{error}</p>}
      <div className="portrait-adjust-actions">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" disabled={working} onClick={save}><Check size={18}/> Save</button>
      </div>
    </section>
  </div>;
}
