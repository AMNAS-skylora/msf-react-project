import { Camera } from 'lucide-react';
import { strengthLogo } from './strength-mark.js';

const FIRST_EXECUTIVE_COUNT = 8;
const LATER_EXECUTIVE_COUNT = 16;

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
  const executiveOffset = firstPage ? 0 : FIRST_EXECUTIVE_COUNT + (page - 1) * LATER_EXECUTIVE_COUNT;
  const placeName = String(unitName || '').trim() || 'ചോക്കാട്';
  const headingText = 'ഇനി ഇവർ\nനയിക്കും';

  return (
    <div className={'ref-poster ' + (firstPage ? 'ref-first-page' : 'ref-continuation-page')}>
      <span className="ref-background-corner ref-corner-top" aria-hidden="true" />
      <span className="ref-background-corner ref-corner-bottom" aria-hidden="true" />

      <div className="ref-brand" aria-label="Strength logo">
        <img className="ref-brand-strength-logo" src={strengthLogo} alt="Strength" draggable={false} />
      </div>

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

          <section className="ref-member-section ref-vice-section" aria-label="Vice Presidents">
            <SectionHeading>Vice Presidents</SectionHeading>
            <div className="ref-member-row">
              {membersFor('Vice Presidents').map((person, i) => (
                <Portrait
                  key={i}
                  person={person}
                  type="committee"
                  selectionRole="Vice Presidents"
                  selectionIndex={i}
                  editingPhoto={editingPhoto}
                  onPortraitPointerDown={onPortraitPointerDown}
                  onPortraitPointerMove={onPortraitPointerMove}
                  onPortraitPointerUp={onPortraitPointerUp}
                  onClick={() => onMemberClick('Vice Presidents', i)}
                />
              ))}
            </div>
          </section>

          <section className="ref-member-section ref-joint-section" aria-label="Joint Secretaries">
            <SectionHeading>Joint Secretaries</SectionHeading>
            <div className="ref-member-row">
              {membersFor('Joint Secretaries').map((person, i) => (
                <Portrait
                  key={i}
                  person={person}
                  type="committee"
                  selectionRole="Joint Secretaries"
                  selectionIndex={i}
                  editingPhoto={editingPhoto}
                  onPortraitPointerDown={onPortraitPointerDown}
                  onPortraitPointerMove={onPortraitPointerMove}
                  onPortraitPointerUp={onPortraitPointerUp}
                  onClick={() => onMemberClick('Joint Secretaries', i)}
                />
              ))}
            </div>
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
        <SectionHeading>Executive Members</SectionHeading>
        <div className="ref-executive-grid">
          {executives.map((person, i) => (
            <Portrait
              key={executiveOffset + i}
              person={person}
              type="executive"
              selectionRole="Executive Members"
              selectionIndex={executiveOffset + i}
              editingPhoto={editingPhoto}
              onPortraitPointerDown={onPortraitPointerDown}
              onPortraitPointerMove={onPortraitPointerMove}
              onPortraitPointerUp={onPortraitPointerUp}
              onClick={() => onMemberClick('Executive Members', executiveOffset + i)}
            />
          ))}
        </div>
      </section>

      <footer className="ref-footer">
        <div className="ref-footer-organization">MSF CHOKKAD GRAMA PANCHAYATH</div>
        <div className="ref-footer-message">MSF ചോക്കാട് ഗ്രാമപഞ്ചായത്ത് കമ്മിറ്റിയുടെ ഹൃദയം നിറഞ്ഞ അഭിനന്ദനങ്ങൾ</div>
      </footer>
    </div>
  );
}
