import { useRef, useState } from 'react';
import { Check, Maximize2, Minus, Plus, RotateCcw, Scissors, Sparkles, X } from 'lucide-react';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const positionOf = person => ({
  zoom: clamp(Number(person.photoZoom) || 1, 0.7, 3.5),
  x: clamp(Number(person.photoX) || 0, -65, 65),
  y: clamp(Number(person.photoY) || 0, -65, 65),
});

// Non-destructive editing: this transform is saved on the member, so the
// poster preview and the exported PNG render the same clipped image.
export default function PortraitAdjustDialog({
  person,
  label,
  onClose,
  onSave,
  onRemoveBackground,
  onCrop,
}) {
  const [source, setSource] = useState(person.photo);
  const [cutout, setCutout] = useState(!!person.cutout);
  const [mode, setMode] = useState(person.cutout && person.photoMode === 'popout' ? 'popout' : 'inside');
  const [overhang, setOverhang] = useState(clamp(Number(person.photoPopout ?? 15), 0, 40));
  const [position, setPosition] = useState(() => positionOf(person));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const surfaceRef = useRef(null);
  const pointers = useRef(new Map());
  const lastDistance = useRef(0);

  const patch = update => setPosition(previous => ({
    ...previous,
    ...update,
  }));

  function pointerDown(event) {
    if (!source) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      lastDistance.current = Math.hypot(b.x - a.x, b.y - a.y);
    }
  }

  function pointerMove(event) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous || !surfaceRef.current) return;
    event.preventDefault();
    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);
    const rect = surfaceRef.current.getBoundingClientRect();
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      if (lastDistance.current > 0) {
        const ratio = distance / lastDistance.current;
        setPosition(current => ({
          ...current,
          zoom: clamp(current.zoom * ratio, .7, 3.5),
        }));
      }
      lastDistance.current = distance;
    } else {
      const dx = (next.x - previous.x) / Math.max(1, rect.width) * 100;
      const dy = (next.y - previous.y) / Math.max(1, rect.height) * 100;
      setPosition(current => ({
        ...current,
        x: clamp(current.x + dx, -65, 65),
        y: clamp(current.y + dy, -65, 65),
      }));
    }
  }

  function pointerUp(event) {
    pointers.current.delete(event.pointerId);
    lastDistance.current = 0;
  }

  async function removeBackground() {
    setWorking(true);
    setError('');
    try {
      const transparent = await onRemoveBackground(source);
      setSource(transparent);
      setCutout(true);
      setMode('popout');
      setPosition({ zoom: 1, x: 0, y: 0 });
    } catch (err) {
      setError('Background removal failed. Check internet connection or try a transparent PNG. ' + (err?.message || ''));
    } finally {
      setWorking(false);
    }
  }

  function save() {
    onSave({
      photo: source,
      cutout,
      photoMode: cutout ? mode : 'inside',
      photoPopout: overhang,
      photoZoom: position.zoom,
      photoX: position.x,
      photoY: position.y,
    });
  }

  return (
    <div className="portrait-adjust-overlay" role="presentation">
      <section className="portrait-adjust-dialog" role="dialog" aria-modal="true" aria-label={'Adjust photo: ' + label}>
        <div className="portrait-adjust-heading">
          <div><strong>Adjust portrait</strong><small>{label}</small></div>
          <button type="button" className="portrait-adjust-close" onClick={onClose} aria-label="Close"><X size={21}/></button>
        </div>
        <p className="portrait-adjust-help">Drag to move · Pinch or use Zoom to resize. Inside frame clips the photo to the curve. Pop out allows a transparent cutout to rise above it.</p>
        <div
          className="portrait-adjust-preview"
          ref={surfaceRef}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
          onLostPointerCapture={pointerUp}
          aria-label="Drag photo to adjust position"
        >
          <div className={'portrait-adjust-shape'+(cutout&&mode==='popout'?' portrait-adjust-popout':'')} style={{'--portrait-overhang':overhang+'%'}}>
            {source && <img
              src={source}
              alt="Adjust uploaded portrait"
              draggable={false}
              className={cutout ? 'portrait-adjust-cutout' : ''}
              style={{ transform: `translate(${position.x}%, ${position.y}%) scale(${position.zoom})` }}
            />}
          </div>
          <div className="portrait-adjust-crosshair" aria-hidden="true"/>
        </div>

        <fieldset className="portrait-adjust-modes">
          <legend>Photo shape</legend>
          <div className="portrait-adjust-mode-options">
            <button type="button" className={mode==='inside'?'active':''} aria-pressed={mode==='inside'} onClick={()=>setMode('inside')}>Inside curved frame</button>
            <button type="button" className={mode==='popout'?'active':''} aria-pressed={mode==='popout'} disabled={!cutout} onClick={()=>setMode('popout')}>Pop out above frame</button>
          </div>
          {!cutout && <small>Remove the image background first to enable Pop out.</small>}
        </fieldset>
        {cutout&&mode==='popout'&&<div className="portrait-adjust-control">
          <div className="portrait-adjust-control-label"><label htmlFor="portrait-adjust-overhang">Extend above curve</label><span>{overhang}%</span></div>
          <div className="portrait-adjust-zoom-row">
            <input id="portrait-adjust-overhang" type="range" min="0" max="40" step="1" value={overhang} onChange={event=>setOverhang(Number(event.target.value))}/>
          </div>
        </div>}
        <div className="portrait-adjust-control">
          <div className="portrait-adjust-control-label"><label htmlFor="portrait-adjust-zoom">Zoom</label><span>{Math.round(position.zoom * 100)}%</span></div>
          <div className="portrait-adjust-zoom-row">
            <button type="button" onClick={() => patch({ zoom: clamp(position.zoom - .1, .7, 3.5) })} aria-label="Zoom out"><Minus size={19}/></button>
            <input id="portrait-adjust-zoom" type="range" min=".7" max="3.5" step=".01" value={position.zoom} onChange={event => patch({ zoom: Number(event.target.value) })}/>
            <button type="button" onClick={() => patch({ zoom: clamp(position.zoom + .1, .7, 3.5) })} aria-label="Zoom in"><Plus size={19}/></button>
          </div>
        </div>
        <div className="portrait-adjust-toolbar">
          <button type="button" onClick={() => setPosition({ zoom: 1, x: 0, y: 0 })}><Maximize2 size={17}/> Fit center</button>
          <button type="button" onClick={() => { setPosition(positionOf(person)); setSource(person.photo); setCutout(!!person.cutout); setMode(person.cutout && person.photoMode==='popout'?'popout':'inside'); setOverhang(clamp(Number(person.photoPopout ?? 15),0,40)); setError(''); }}><RotateCcw size={17}/> Reset</button>
          <button type="button" onClick={onCrop}><Scissors size={17}/> Crop</button>
        </div>
        <div className="portrait-adjust-background">
          <label><input type="checkbox" checked={cutout} onChange={e => {setCutout(e.target.checked);if(!e.target.checked)setMode('inside');}}/> Transparent / removed background</label>
          <button type="button" disabled={working || !source} onClick={removeBackground}><Sparkles size={16}/> {working ? 'Removing…' : 'Remove BG'}</button>
        </div>
        {error && <p role="alert" className="portrait-adjust-error">{error}</p>}
        <div className="portrait-adjust-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={save} disabled={working}><Check size={18}/> Save position</button>
        </div>
      </section>
    </div>
  );
}
