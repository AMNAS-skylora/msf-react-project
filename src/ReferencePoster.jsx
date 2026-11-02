import { Camera } from 'lucide-react';

function linesFor(person) {
  if (person.nameLayout === 'manual') return [person.line1 || '', person.line2 || ''].filter(Boolean);
  const name = String(person.name || '').trim().replace(/\s+/g, ' ');
  if (!name || name.length <= 15 || !name.includes(' ')) return name ? [name] : [];
  const words = name.split(' ');
  let best = 1, score = Infinity;
  for (let i = 1; i < words.length; i++) {
    const first = words.slice(0, i).join(' ');
    const second = words.slice(i).join(' ');
    const value = Math.max(first.length, second.length) * 2 + Math.abs(first.length - second.length);
    if (value < score) { score = value; best = i; }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

function PersonName({ person }) {
  return <div className="ref-person-name">{linesFor(person).map((line, i) => <span key={i}>{line}</span>)}</div>;
}

function MsfFlags() {
  return <svg className="ref-flags" viewBox="0 0 260 610" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <defs>
      <linearGradient id="ref-flag-green" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#118c36"/><stop offset=".75" stopColor="#006c2d"/><stop offset="1" stopColor="#004c23"/></linearGradient>
      <linearGradient id="ref-flag-pole" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#67786a"/><stop offset=".45" stopColor="#ecf1e9"/><stop offset="1" stopColor="#6d8371"/></linearGradient>
    </defs>
    <path d="M56 22L65 595" stroke="#54704e" strokeWidth="10" opacity=".28"/>
    <path d="M52 20L60 590" stroke="url(#ref-flag-pole)" strokeWidth="6"/>
    <circle cx="52" cy="16" r="11" fill="#cbd4bf" stroke="#79916e" strokeWidth="3"/>
    <g transform="rotate(-4 55 72)">
      <path d="M54 65C115 42 180 95 253 68L253 206C188 229 122 176 55 199Z" fill="url(#ref-flag-green)"/>
      <path d="M55 138C116 121 188 162 253 137L253 206C188 229 122 176 55 199Z" fill="#fff"/>
      <path d="M105 81a23 23 0 1 0 31 29a19 19 0 1 1 -31 -29" fill="#f7fff4"/>
      <text x="164" y="179" fontSize="38" fontStyle="italic" fontFamily="Georgia,serif" fontWeight="900" textAnchor="middle" fill="#077431">msf</text>
    </g>
    <path d="M26 270L34 606" stroke="#405e44" strokeWidth="9" opacity=".27"/>
    <path d="M23 267L30 601" stroke="url(#ref-flag-pole)" strokeWidth="5"/>
    <circle cx="23" cy="263" r="10" fill="#ccd4c7" stroke="#7a9075" strokeWidth="3"/>
    <g transform="rotate(3 28 296)">
      <path d="M28 300C102 273 173 322 260 293L260 433C178 462 99 411 28 441Z" fill="url(#ref-flag-green)"/>
      <path d="M28 369C103 351 176 396 260 369L260 433C178 462 99 411 28 441Z" fill="#fff"/>
      <path d="M84 316a20 20 0 1 0 28 26a17 17 0 1 1 -28 -26" fill="#fff"/>
      <text x="158" y="406" fontSize="40" fontStyle="italic" fontFamily="Georgia,serif" fontWeight="900" textAnchor="middle" fill="#077431">msf</text>
    </g>
  </svg>;
}

export default function ReferencePoster({
  people, heading, page, pageCount, membersFor, onLeaderClick, onMemberClick
}) {
  return <div className="ref-poster">
    <div className="ref-atmosphere" aria-hidden="true"/>
    <MsfFlags/>
    {page === 0 ? <>
      <header className="ref-poster-header">
        <span className="ref-identity">msf ചോക്കാട് ഗ്രാമപഞ്ചായത്ത്</span>
        <h1>{heading || 'ഇവർ നയിക്കും'}</h1>
      </header>
      <div className="ref-leaders">
        {people.map((person, index) => <div className="ref-leader" key={person.role}>
          <div className="ref-leader-photo">
            <span className={"ref-role"+(person.role==="General Secretary"?" ref-role-long":"")}>{person.role}</span>
            <button type="button" className={"ref-portrait-action"+(person.cutout?" ref-photo-cutout":"")} onClick={() => onLeaderClick(index, person)} aria-label={(person.photo ? 'Crop ' : 'Upload ') + person.role + ' portrait'}>
              {person.photo ? <img src={person.photo} alt={person.name || person.role}/> : <Camera size={30}/>}
            </button>
          </div>
          <PersonName person={person}/>
        </div>)}
      </div>
      {['Vice Presidents', 'Joint Secretaries'].map((role, sectionIndex) => {
        const members = membersFor(role);
        return <section className={'ref-committee-section ' + (sectionIndex === 0 ? 'ref-vice' : 'ref-joint')} key={role}>
          <h2>{role}</h2>
          <div className="ref-committee-outline">
            <div className="ref-committee-row">
              {members.map((person, index) => <div className="ref-member" key={index}>
                <button type="button" className={"ref-member-photo"+(person.cutout?" ref-photo-cutout":"")} onClick={() => onMemberClick(role, index)} aria-label={'Edit ' + role + ' member ' + (index + 1)}>
                  {person.photo ? <img src={person.photo} alt={person.name || role + ' member'}/> : <Camera size={22}/>}
                </button>
                <PersonName person={person}/>
              </div>)}
            </div>
          </div>
        </section>;
      })}
    </> : <>
      <header className="ref-poster-header ref-poster-header-executive">
        <span className="ref-identity">msf ചോക്കാട് ഗ്രാമപഞ്ചായത്ത്</span>
        <h1>Executive Members</h1>
        <span className="ref-executive-page-label">Committee members · {page} / {pageCount - 1}</span>
      </header>
      <section className="ref-executive-section">
        <h2>EXECUTIVE MEMBERS</h2>
        <div className="ref-executive-grid">
          {membersFor('Executive Members').map((person, index) => {
            const globalIndex = (page - 1) * 8 + index;
            return <div className="ref-executive-member" key={globalIndex}>
              <button className={"ref-member-photo"+(person.cutout?" ref-photo-cutout":"")} type="button" onClick={() => onMemberClick('Executive Members', globalIndex)} aria-label={'Edit executive member ' + (globalIndex + 1)}>
                {person.photo ? <img src={person.photo} alt={person.name || 'Executive member'}/> : <Camera size={25}/>}
              </button>
              <PersonName person={person}/>
            </div>;
          })}
        </div>
      </section>
    </>}
    <div className="ref-bottom-ribbon" aria-hidden="true"/>
    <footer className="ref-congratulations">
      <span>MSF ചോക്കാട് ഗ്രാമപഞ്ചായത്ത് കമ്മിറ്റിയുടെ</span>
      <strong>ഹൃദയം നിറഞ്ഞ അഭിനന്ദനങ്ങൾ</strong>
    </footer>
  </div>;
}
