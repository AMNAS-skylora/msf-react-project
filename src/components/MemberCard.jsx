import { Download, ImagePlus, RotateCcw, Scissors } from 'lucide-react';

export default function MemberCard({ member, image, showPhotos, editing, onUpload, onReset, onDownload, onRemoveBg, busy }) {
  return (
    <article className={`member-card ${member.group === 'leadership' ? 'leader-card' : ''}`}>
      <div className="member-portrait">
        {showPhotos ? <img src={image} alt={`${member.name}, ${member.role}`} loading="lazy" /> : <span className="member-initial" aria-hidden="true">{member.name.charAt(0)}</span>}
        <div className="portrait-accent" aria-hidden="true" />
      </div>
      <div className="member-copy"><p className="member-role">{member.role}</p><h3>{member.name}</h3></div>
      {editing && <div className="photo-actions" aria-label={`Photo tools for ${member.name}`}>
        <button type="button" title={`Upload ${member.name}'s photo`} aria-label={`Change photo for ${member.name}`} onClick={() => onUpload(member)}><ImagePlus size={16} /></button>
        <button type="button" title="AI background removal" aria-label={`Remove background for ${member.name}`} onClick={() => onRemoveBg(member)} disabled={busy}><Scissors size={16} />{busy && <span className="spinner" />}</button>
        <button type="button" title="Restore original image" aria-label={`Restore original photo for ${member.name}`} onClick={() => onReset(member)}><RotateCcw size={16} /></button>
        <button type="button" title="Download photo" aria-label={`Download photo of ${member.name}`} onClick={() => onDownload(member)}><Download size={16} /></button>
      </div>}
    </article>
  );
}
