import { useMemo, useRef, useState } from 'react';
import { Camera, Eye, EyeOff, Search, Settings2, ShieldCheck, X } from 'lucide-react';
import Header from './components/Header.jsx';
import Hero from './components/Hero.jsx';
import SectionHeading from './components/SectionHeading.jsx';
import MemberCard from './components/MemberCard.jsx';
import Footer from './components/Footer.jsx';
import { GROUPS, MEMBERS, imageUrl } from './data/committee.js';
import { useStoredPhotos } from './hooks/useStoredPhotos.js';
import { blobToDataUrl, downloadPhoto, fileToOptimizedDataUrl } from './utils/photos.js';

export default function App() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [showPhotos, setShowPhotos] = useState(true);
  const [editing, setEditing] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [notice, setNotice] = useState('');
  const uploadInput = useRef(null);
  const uploadTarget = useRef(null);
  const { photos, replace, restore, saveError } = useStoredPhotos();

  const filteredMembers = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return MEMBERS.filter((member) =>
      (role === 'all' || member.group === role) &&
      (member.name + ' ' + member.role).toLocaleLowerCase().includes(needle),
    );
  }, [search, role]);

  const leadership = MEMBERS.filter((member) => member.group === 'leadership');
  const editedUrl = (member) => photos[member.id] || imageUrl(member);
  const alertMessage = (message) => setNotice(message);

  function openPhotoPicker(member) {
    uploadTarget.current = member;
    uploadInput.current?.click();
  }

  async function onFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !uploadTarget.current) return;
    try {
      const optimized = await fileToOptimizedDataUrl(file);
      replace(uploadTarget.current.id, optimized);
      alertMessage(uploadTarget.current.name + "'s photo updated in this browser.");
    } catch (error) {
      alertMessage(error.message || 'Unable to upload photo.');
    }
  }

  async function removeBg(member) {
    setWorkingId(member.id);
    setNotice('Removing background… the first request may download an AI model.');
    try {
      const { removeBackground } = await import('@imgly/background-removal');
      const output = await removeBackground(editedUrl(member));
      replace(member.id, await blobToDataUrl(output));
      alertMessage('Background removed for ' + member.name + '. Saved in this browser.');
    } catch (error) {
      console.error('Background removal error:', error);
      alertMessage('Could not remove background. Check your connection and try again.');
    } finally {
      setWorkingId(null);
    }
  }

  function renderCard(member) {
    return (
      <MemberCard
        key={member.id}
        member={member}
        image={editedUrl(member)}
        showPhotos={showPhotos}
        editing={editing}
        busy={workingId === member.id}
        onUpload={openPhotoPicker}
        onRemoveBg={removeBg}
        onReset={(item) => {
          restore(item.id);
          alertMessage('Original photo restored for ' + item.name + '.');
        }}
        onDownload={(item) =>
          downloadPhoto(editedUrl(item), 'msf-' + item.id + '.' + (photos[item.id] ? 'png' : 'webp'))
        }
      />
    );
  }

  return (
    <>
      <Header />
      <main>
        <Hero totalMembers={MEMBERS.length} />
        <section className="section" id="leadership" aria-label="Unit leadership">
          <div className="container">
            <SectionHeading number="01" eyebrow="OFFICE BEARERS" title="Our" emphasis="Leadership" subtitle="Meet the elected office bearers of the unit committee." />
            <div className="member-grid leadership-grid">{leadership.map(renderCard)}</div>
          </div>
        </section>
        <section className="section committee-section" id="committee" aria-label="Committee members">
          <div className="container">
            <SectionHeading number="02" eyebrow="MEET THE TEAM" title="Committee" emphasis="Members" subtitle="Explore members by responsibility and role.">
              <button
                className={'tool-button ' + (editing ? 'tool-button-active' : '')}
                type="button"
                onClick={() => { setEditing((current) => !current); setNotice(''); }}
              ><Settings2 size={17} />{editing ? 'Close photo editor' : 'Edit photos'}</button>
            </SectionHeading>
            <div className="member-toolbar">
              <label className="search-box">
                <Search size={18}/>
                <span className="sr-only">Search committee members</span>
                <input placeholder="Search members by name or role…" value={search} onChange={(event) => setSearch(event.target.value)}/>
                {search && <button title="Clear search" aria-label="Clear search" type="button" onClick={() => setSearch('')}><X size={16}/></button>}
              </label>
              <button className="tool-button visibility-button" type="button" onClick={() => setShowPhotos((current) => !current)}>
                {showPhotos ? <EyeOff size={17}/> : <Eye size={17}/>} {showPhotos ? 'Hide photos' : 'Show photos'}
              </button>
            </div>
            <div className="filters" role="group" aria-label="Filter by committee role">
              {[{ id: 'all', title: 'All members' }, ...GROUPS].map((group) =>
                <button key={group.id} type="button" aria-pressed={role === group.id} className={role === group.id ? 'is-selected' : ''} onClick={() => setRole(group.id)}>{group.title}</button>
              )}
            </div>
            {editing && <div className="editor-help"><Camera size={19}/><div><strong>Photo editing enabled</strong><p>Upload, remove background, restore or download any portrait. Edits are saved only on this device; source image files must be replaced to publish edits for everyone.</p></div></div>}
            {(notice || saveError) && <div className="notice" role="status">{saveError || notice}<button aria-label="Dismiss notice" type="button" onClick={() => setNotice('')}><X size={15}/></button></div>}
            {GROUPS.map((group) => {
              const people = filteredMembers.filter((member) => member.group === group.id);
              if (!people.length) return null;
              return <section className="role-section" key={group.id} aria-labelledby={'group-' + group.id}>
                <div className="role-heading"><div><h3 id={'group-' + group.id}>{group.title}</h3><span lang="ml">{group.malayalam}</span></div><span className="role-count">{people.length} {people.length === 1 ? 'member' : 'members'}</span></div>
                <div className={'member-grid ' + (group.id === 'leadership' ? 'leadership-grid compact-leaders' : '')}>{people.map(renderCard)}</div>
              </section>;
            })}
            {filteredMembers.length === 0 && <div className="no-results">No matching members found. Try another name or select All members.</div>}
          </div>
        </section>
        <section className="about-section" id="about"><div className="container about-layout"><div><span className="about-eyebrow">03 / ABOUT THE COMMITTEE</span><h2>One team.<br/><span>Shared purpose.</span></h2></div><div><p>MSF മമ്പാടുമൂല യൂണിറ്റ് കമ്മിറ്റിയുടെ പുതിയ നേതൃത്വത്തെയും അംഗങ്ങളെയും പരിചയപ്പെടുത്തുന്നതിനായി തയ്യാറാക്കിയ വെബ്സൈറ്റ്.</p><div className="permission-note"><ShieldCheck size={22}/><span>Before publishing, confirm all names, responsibilities, portraits, and photo permissions.</span></div></div></div></section>
      </main>
      <Footer />
      <input ref={uploadInput} className="visually-hidden-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={onFileChange} tabIndex={-1} />
    </>
  );
}
