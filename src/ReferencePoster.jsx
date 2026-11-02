import { Camera } from 'lucide-react';

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

function Portrait({ person, onClick, role, type = 'member' }) {
  const isCutout = !!person.cutout;
  return (
    <div className={'ref-profile ref-profile-' + type}>
      <button
        type="button"
        className={'ref-portrait' + (isCutout ? ' ref-portrait-cutout' : '')}
        onClick={onClick}
        aria-label={(person.photo ? 'Crop photo: ' : 'Upload photo: ') + (person.name || role)}
      >
        {person.photo
          ? <img src={person.photo} alt={person.name || role} draggable={false} />
          : <Camera className="ref-camera-placeholder" size={22} aria-hidden="true" />}
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

// A stylized MSF flag for the poster. No SKSSF branding is reproduced.
function MsfFlag() {
  return (
    <svg className="ref-feature-flag" viewBox="0 0 340 425" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="msf-pole" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#7c8c93"/>
          <stop offset=".45" stopColor="#e9f2f3"/>
          <stop offset="1" stopColor="#778c98"/>
        </linearGradient>
        <linearGradient id="msf-blue" x1="0" y1="0" x2=".95" y2="1">
          <stop stopColor="#0874c9"/><stop offset="1" stopColor="#00549c"/>
        </linearGradient>
        <linearGradient id="msf-green" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#0ba153"/><stop offset="1" stopColor="#00662d"/>
        </linearGradient>
      </defs>
      <path d="M35 26 L81 404" stroke="#45677e" strokeWidth="8" opacity=".14"/>
      <path d="M29 20 L70 404" stroke="url(#msf-pole)" strokeWidth="5" strokeLinecap="round"/>
      <circle cx="28" cy="17" r="5" fill="#bed6dc"/>
      <g transform="rotate(6 44 70)">
        <path d="M40 52 Q142 43 317 190 L276 318 Q153 214 52 202 Z" fill="#fff" stroke="#d3dfe0" strokeWidth="1.2"/>
        <path d="M40 52 Q141 45 317 190 L293 237 Q161 139 47 139 Z" fill="url(#msf-blue)"/>
        <path d="M47 139 Q167 151 293 237 L276 318 Q154 217 52 202 Z" fill="url(#msf-green)"/>
        <path d="M151 110 a22 22 0 1 0 30 27 a18 18 0 1 1 -30 -27" fill="white"/>
        <path d="M193 110 l4 10 11 1 -9 7 3 11 -9 -6 -9 6 3 -11 -9 -7 11 -1z" fill="#fff"/>
        <text x="200" y="241" textAnchor="middle" transform="rotate(22 200 241)" fontFamily="Georgia,serif" fontSize="55" fontWeight="bold" fontStyle="italic" fill="#fff">msf</text>
      </g>
    </svg>
  );
}

export default function ReferencePoster({
  people,
  heading,
  page,
  pageCount,
  membersFor,
  onLeaderClick,
  onMemberClick,
}) {
  const firstPage = page === 0;
  const executives = membersFor('Executive Members');
  const executiveOffset = firstPage ? 0 : FIRST_EXECUTIVE_COUNT + (page - 1) * LATER_EXECUTIVE_COUNT;
  const headingText = String(heading || 'ഇനി ഇവർ നയിക്കും').trim();

  return (
    <div className={'ref-poster ' + (firstPage ? 'ref-first-page' : 'ref-continuation-page')}>
      <span className="ref-background-corner ref-corner-top" aria-hidden="true" />
      <span className="ref-background-corner ref-corner-bottom" aria-hidden="true" />

      <div className="ref-brand">
        <strong className="ref-brand-logo">msf</strong>
        <span>ചോക്കാട് ഗ്രാമപഞ്ചായത്ത്<br/>കമ്മിറ്റി</span>
      </div>

      {firstPage ? (
        <>
          <div className="ref-title">
            <p>MSF ചോക്കാട് ഗ്രാമപഞ്ചായത്ത് കമ്മിറ്റി</p>
            <h1>{headingText}</h1>
          </div>

          <MsfFlag />

          <section className="ref-primary-leadership" aria-label="Primary leadership">
            {people.map((person, i) => (
              <Portrait
                key={person.role}
                person={person}
                role={person.role}
                type="leader"
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
