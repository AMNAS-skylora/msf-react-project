import { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { EXECUTIVE_MEMBERS_PER_PAGE, splitExecutiveRows } from './executiveLayout.js';

// Original text.png is an opaque white sheet with black repeated lettering.
// Convert white to transparency, recolor the existing lettering cream and
// crop its empty lower area for the top-right poster decoration.
// Only the browser preview is transformed; the original PNG is unchanged.
const OPTIONAL_HEADER_TEXT='/background/text.png';
function trimInvisibleArtwork(image) {
  // The committed text.png is a white, opaque 2480×3508 sheet with black
  // micro-lettering in the upper portion. Alpha-only trimming treated its
  // enormous white background as content and shrunk the letters to nothing.
  // Make the white paper transparent, tint the lettering cream so it remains
  // visible on the dark poster, and crop away blank space.
  const limit=1200; // modest on iPhone, detailed enough at 227 poster pixels
  const scale=Math.min(1,limit/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)return OPTIONAL_HEADER_TEXT;
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const imageData=ctx.getImageData(0,0,canvas.width,canvas.height);
  const pixels=imageData.data;
  let left=canvas.width,top=canvas.height,right=-1,bottom=-1;
  for(let y=0;y<canvas.height;y++){
    for(let x=0;x<canvas.width;x++){
      const i=(y*canvas.width+x)*4;
      const alpha=pixels[i+3]/255;
      const luminance=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];
      // Retain dark text and antialiasing; strip the white paper entirely.
      const ink=Math.max(0,Math.min(1,(240-luminance)/170))*alpha;
      pixels[i]=246;
      pixels[i+1]=240;
      pixels[i+2]=218;
      pixels[i+3]=Math.round(ink*255);
      if(pixels[i+3]<=24)continue;
      if(x<left)left=x;
      if(x>right)right=x;
      if(y<top)top=y;
      if(y>bottom)bottom=y;
    }
  }
  if(right<left||bottom<top)return '';
  ctx.putImageData(imageData,0,0);
  const pad=3;
  left=Math.max(0,left-pad);
  top=Math.max(0,top-pad);
  right=Math.min(canvas.width-1,right+pad);
  bottom=Math.min(canvas.height-1,bottom+pad);
  const output=document.createElement('canvas');
  output.width=right-left+1;
  output.height=bottom-top+1;
  const out=output.getContext('2d');
  if(!out)return OPTIONAL_HEADER_TEXT;
  out.drawImage(canvas,left,top,output.width,output.height,
    0,0,output.width,output.height);
  return output.toDataURL('image/png');
}
function OptionalChokkadTextArtwork() {
  // Render the actual committed PNG immediately. Previously the image was
  // hidden until a Safari canvas trim had finished, leaving the header blank
  // when that conversion was interrupted or the user exported immediately.
  const [source,setSource]=useState(OPTIONAL_HEADER_TEXT);
  useEffect(()=>{
    let active=true;
    const image=new Image();
    image.onload=()=>{
      if(!active||!image.naturalWidth)return;
      try{
        const trimmed=trimInvisibleArtwork(image);
        if(active)setSource(trimmed);
      }catch{
        // Never hide the original artwork just because trimming is unsupported.
        if(active)setSource(OPTIONAL_HEADER_TEXT);
      }
    };
    image.onerror=()=>{
      if(active)setSource('');
    };
    image.src=OPTIONAL_HEADER_TEXT;
    return ()=>{active=false;image.onload=null;image.onerror=null;};
  },[]);
  if(!source)return null;
  return <img className="ref-unit-subtext-image" src={source}
    data-source={OPTIONAL_HEADER_TEXT}
    alt="MSF Chokkad committee text artwork" draggable={false}/>;
}

function splitName(person = {}) {
  if (person.nameLayout === 'manual') {
    return [person.line1 || '', person.line2 || ''].filter(Boolean);
  }
  const name = String(person.name || '').trim().replace(/\s+/g, ' ');
  if (!name) return [];
  if (name.length <= 17 || !name.includes(' ')) return [name];
  const words = name.split(' ');
  let bestIndex = 1;
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const first = words.slice(0, i).join(' ');
    const second = words.slice(i).join(' ');
    const score = Math.max(first.length, second.length) * 2 + Math.abs(first.length - second.length);
    if (score < bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return [words.slice(0, bestIndex).join(' '), words.slice(bestIndex).join(' ')];
}

function Portrait({ person, onClick, role, type = 'member', selectionRole, selectionIndex, editingPhoto, onPortraitPointerDown, onPortraitPointerMove, onPortraitPointerUp }) {
  const isCutout = !!person.cutout;
  return (
    <div className={'ref-profile ref-profile-' + type}>
      <button
        type="button"
        data-portrait-role={selectionRole}
        data-portrait-index={selectionIndex}
        className={'ref-portrait' + (isCutout ? ' ref-portrait-cutout' : '') + (isCutout && person.photoMode === 'popout' ? ' ref-portrait-popout' : '')}
        style={{'--portrait-overhang': Math.min(40,Math.max(0,Number(person.photoPopout ?? 15))) + '%'}}
        onClick={onClick}
        onPointerDown={person.photo ? event => onPortraitPointerDown?.(event,selectionRole,selectionIndex) : undefined}
        onPointerMove={person.photo ? onPortraitPointerMove : undefined}
        onPointerUp={person.photo ? onPortraitPointerUp : undefined}
        onPointerCancel={person.photo ? onPortraitPointerUp : undefined}
        onLostPointerCapture={person.photo ? onPortraitPointerUp : undefined}
        aria-label={(person.photo ? 'Adjust photo: ' : 'Upload photo: ') + (person.name || role)}
      >
        {person.photo
          ? <img
            src={person.photo}
            alt={person.name || role}
            draggable={false}
            style={{
              transform:`translate(${Number(person.photoX)||0}%, ${Number(person.photoY)||0}%) scale(${Number(person.photoZoom)||1}) scaleX(${person.flipHorizontal ? -1 : 1}) scaleY(${person.flipVertical ? -1 : 1})`,
              objectFit:isCutout?'contain':(person.photoFit==='contain'?'contain':'cover'),
            }}
          />
          : <Camera className="ref-camera-placeholder" size={22} aria-hidden="true" />}
        {person.photo && editingPhoto?.role===selectionRole && editingPhoto?.index===selectionIndex &&
          <span className="ref-photo-selection-ring" aria-hidden="true"/>}
      </button>
      {role && <span className="ref-profile-role">{role}</span>}
      <div className="ref-profile-name">
        {splitName(person).map((part, i) => <span key={i}>{part}</span>)}
      </div>
    </div>
  );
}

function SectionHeading({ children }) {
  return <h2 className="ref-section-heading"><span>{children}</span></h2>;
}

export default function ReferencePoster({
  people,
  unitName,
  page,
  pageCount,
  membersFor,
  onLeaderClick,
  onMemberClick,
  editingPhoto,
  onPortraitPointerDown,
  onPortraitPointerMove,
  onPortraitPointerUp,
}) {
  const firstPage = page === 0;
  const executives = membersFor('Executive Members');
  const executiveRows = splitExecutiveRows(executives);
  const executiveColumns = executives.length > 16 ? 10 : 8;
  const executiveRowClass = ['', 'ref-executive-one-row', 'ref-executive-two-rows', 'ref-executive-three-rows'][executiveRows.length] || '';
  const executiveOffset = firstPage ? 0 : page * EXECUTIVE_MEMBERS_PER_PAGE;
  const placeName = String(unitName || '').trim() || 'ചോക്കാട്';
  const headingText = 'ഇനി ഇവർ\nനയിക്കും';

  return (
    <div className={'ref-poster ' + (firstPage ? 'ref-first-page' : 'ref-continuation-page')}>
      <div className="ref-brand" aria-label="MSF logo">
        <img className="ref-brand-strength-logo" src="/background/logo.png" alt="MSF committee logo" draggable={false} />
      </div>
      <div className="ref-right-header-artwork">
        <img
          className="ref-unit-corner-image"
          src="/background/chokkad.png"
          alt="ചോക്കാട്"
          draggable={false}
        />
        <OptionalChokkadTextArtwork />
      </div>
      <span className="ref-background-corner ref-corner-top" aria-hidden="true" />
      <span className="ref-background-corner ref-corner-bottom" aria-hidden="true" />



      {firstPage ? (
        <>
          <div className="ref-title">
            <p>MSF {placeName} യൂണിറ്റ് കമ്മിറ്റി</p>
            <h1>{headingText}</h1>
          </div>

          <section className="ref-primary-leadership" aria-label="Primary leadership">
            {people.map((person, i) => (
              <Portrait
                key={person.role}
                person={person}
                role={person.role}
                type="leader"
                selectionRole="leader"
                selectionIndex={i}
                editingPhoto={editingPhoto}
                onPortraitPointerDown={onPortraitPointerDown}
                onPortraitPointerMove={onPortraitPointerMove}
                onPortraitPointerUp={onPortraitPointerUp}
                onClick={() => onLeaderClick(i, person)}
              />
            ))}
          </section>

          <section className="ref-officer-eight" aria-label="Vice Presidents and Joint Secretaries, eight portraits in one row">
            {['Vice Presidents', 'Joint Secretaries'].map(role => (
              <div className="ref-officer-four" key={role}>
                <h2 className="ref-officer-group-heading">{role}</h2>
                <div className="ref-member-row">
                  {membersFor(role).slice(0, 4).map((person, i) => (
                    <Portrait
                      key={i}
                      person={person}
                      type="committee"
                      selectionRole={role}
                      selectionIndex={i}
                      editingPhoto={editingPhoto}
                      onPortraitPointerDown={onPortraitPointerDown}
                      onPortraitPointerMove={onPortraitPointerMove}
                      onPortraitPointerUp={onPortraitPointerUp}
                      onClick={() => onMemberClick(role, i)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        </>
      ) : (
        <header className="ref-extra-header">
          <small>MSF CHOKKAD GRAMA PANCHAYATH</small>
          <h1>Executive Members</h1>
          <p>Committee members · {page} / {pageCount - 1}</p>
        </header>
      )}

      <section
        className={'ref-executive-section ' + (firstPage ? 'ref-main-executives' : 'ref-extra-executives')}
        aria-label="Executive Members"
      >
        <h2 className="ref-officer-group-heading ref-executive-heading">Executive Members</h2>
        <div className={'ref-executive-grid '+executiveRowClass}
          style={{'--exec-slot-width': ((100 - (executiveColumns - 1) * 1.15) / executiveColumns).toFixed(4) + '%'}}>
          {executiveRows.map((row,rowIndex) => (
            <div className="ref-executive-row" key={rowIndex}>
              {row.map((person,i) => {
                const priorCount=executiveRows.slice(0,rowIndex).reduce((sum,previous)=>sum+previous.length,0);
                const memberIndex=executiveOffset+priorCount+i;
                return (
                  <Portrait
                    key={memberIndex}
                    person={person}
                    type="executive"
                    selectionRole="Executive Members"
                    selectionIndex={memberIndex}
                    editingPhoto={editingPhoto}
                    onPortraitPointerDown={onPortraitPointerDown}
                    onPortraitPointerMove={onPortraitPointerMove}
                    onPortraitPointerUp={onPortraitPointerUp}
                    onClick={() => onMemberClick('Executive Members', memberIndex)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <footer className="ref-footer" aria-label="Congratulations artwork">
        <img
          className="ref-footer-artwork"
          src="/background/congratulations.png"
          alt="MSF congratulations"
          draggable={false}
        />
      </footer>
    </div>
  );
}
