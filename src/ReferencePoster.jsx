import { Camera } from 'lucide-react';
import { EXECUTIVE_MEMBERS_PER_PAGE, splitExecutiveRows } from './executiveLayout.js';

// Recolor only the *existing transparent logo ink*, not its lettering,
// layout, alpha, underline, or background. The source PNG contains dark
// lettering and bright green lettering: map those ink families to the
// approved Warm Cream / Light Lime brand palette in the same pixel positions.
// A same-origin canvas remains a PNG/data URL, which our preview/PNG exporter
// captures without recomposing individual text elements.
function applyCommitteeLogoPalette(event) {
  const image = event.currentTarget;
  if (image.dataset.paletteApplied || image.dataset.fallbackApplied ||
      !image.naturalWidth || !image.naturalHeight) return;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    if (!context) return;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      if (pixels.data[i + 3] === 0) continue;
      const red = pixels.data[i];
      const green = pixels.data[i + 1];
      const blue = pixels.data[i + 2];
      // Distinguish the original saturated green ink from black/dark ink.
      const lightLime = green > 26 && green > red * 1.18 && green > blue * 1.4;
      pixels.data[i] = lightLime ? 0xD8 : 0xF6;
      pixels.data[i + 1] = lightLime ? 0xEB : 0xF0;
      pixels.data[i + 2] = lightLime ? 0x8B : 0xDA;
      // Preserve source alpha exactly for clean edges and no green box.
    }
    context.putImageData(pixels, 0, 0);
    image.dataset.paletteApplied = 'true';
    image.src = canvas.toDataURL('image/png');
  } catch (error) {
    // A browser that cannot process canvas should still display the original
    // user's logo, rather than dropping the MSF branding.
    console.warn('MSF logo palette adjustment unavailable:', error);
  }
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
            style={{transform:`translate(${Number(person.photoX)||0}%, ${Number(person.photoY)||0}%) scale(${Number(person.photoZoom)||1})`}}
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
      <span className="ref-background-corner ref-corner-top" aria-hidden="true" />
      <span className="ref-background-corner ref-corner-bottom" aria-hidden="true" />

      <div className="ref-brand" aria-label="MSF logo">
        <img
          className="ref-brand-strength-logo"
          src="/background/logo.png"
          alt="MSF Chokakad Panchayath Committee logo"
          draggable={false}
          onLoad={applyCommitteeLogoPalette}
          onError={event => {
            // Do not reintroduce the removed STRENGTH wordmark.
            event.currentTarget.style.display = 'none';
          }}
        />
      </div>

      {firstPage ? (
        <>
          <div className="ref-title">
            <p>MSF {placeName} പഞ്ചായത്ത് കമ്മിറ്റി</p>
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

      <footer className="ref-footer" aria-label="Congratulations">
        <span className="ref-footer-greeting">അഭിവാദ്യങ്ങൾ</span>
      </footer>
    </div>
  );
}
