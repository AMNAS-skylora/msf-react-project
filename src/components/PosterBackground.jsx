import { useEffect, useRef, useState } from 'react';
import { Download, Image as ImageIcon, Upload } from 'lucide-react';
import { GROUPS, MEMBERS, imageUrl } from '../data/committee.js';

const defaultBackground = `${import.meta.env.BASE_URL}assets/msf-poster-background.webp`;
const WIDTH = 1080;
const HEIGHT = 1350;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export default function PosterBackground({ photos = {} }) {
  const [background, setBackground] = useState(defaultBackground);
  const [headline, setHeadline] = useState('പുതിയ നേതൃത്വം');
  const [status, setStatus] = useState('');
  const [exporting, setExporting] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => () => {
    if (background.startsWith('blob:')) URL.revokeObjectURL(background);
  }, [background]);

  function uploadBackground(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus('Please choose an image file.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setStatus('Choose an image smaller than 15 MB.');
      return;
    }
    setBackground(URL.createObjectURL(file));
    setStatus('Background updated. Your image stays on this device.');
    event.target.value = '';
  }

  async function exportPoster() {
    setExporting(true);
    setStatus('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const ctx = canvas.getContext('2d');
      const bg = await loadImage(background);
      ctx.drawImage(bg, 0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#07532e';
      ctx.textAlign = 'center';
      ctx.font = 'bold 110px Georgia, serif';
      ctx.fillText('msf', WIDTH / 2, 125);
      ctx.font = 'bold 48px sans-serif';
      ctx.fillText(headline, WIDTH / 2, 190, 1000);
      let y = 230;
      for (const group of [...GROUPS.filter(g => g.id !== 'leadership'), ...GROUPS.filter(g => g.id === 'leadership')]) {
        const members = MEMBERS.filter(m => m.group === group.id);
        const cols = group.id === 'executive' ? 7 : group.id === 'leadership' ? 3 : 4;
        const cellWidth = 960 / cols;
        const photoWidth = group.id === 'executive' ? 106 : 150;
        const photoHeight = group.id === 'executive' ? 120 : 165;
        ctx.fillStyle = '#087c37';
        ctx.fillRect(70, y, 940, 40);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(group.title.toUpperCase(), WIDTH / 2, y + 28);
        y += 55;
        const rows = Math.ceil(members.length / cols);
        for (let i = 0; i < members.length; i++) {
          const member = members[i];
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = 60 + col * cellWidth + (cellWidth - photoWidth) / 2;
          const top = y + row * (photoHeight + 47);
          try {
            const img = await loadImage(photos[member.id] || imageUrl(member));
            ctx.drawImage(img, x, top, photoWidth, photoHeight);
          } catch {
            ctx.fillStyle = '#dce8df';
            ctx.fillRect(x, top, photoWidth, photoHeight);
          }
          ctx.fillStyle = '#073d30';
          ctx.font = 'bold 19px sans-serif';
          ctx.fillText(member.name.toUpperCase(), x + photoWidth / 2, top + photoHeight + 25, cellWidth - 8);
        }
        y += rows * (photoHeight + 47) + 15;
      }
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNG export failed');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'msf-committee-poster.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Poster PNG exported.');
    } catch (error) {
      setStatus(error.message || 'Unable to export poster.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <section id="poster" className="poster-section" aria-labelledby="poster-section-heading">
      <div className="container">
        <div className="poster-heading">
          <div>
            <span className="poster-eyebrow"><ImageIcon size={16} /> COMMITTEE POSTER CREATOR</span>
            <h2 id="poster-section-heading">Your background. <span>Your poster.</span></h2>
            <p>Upload any poster background and arrange the committee portraits in editable layers.</p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" className="poster-download" onClick={() => fileInput.current?.click()}><Upload size={18} /> Upload background</button>
            <button type="button" className="poster-download" onClick={exportPoster} disabled={exporting}><Download size={18} /> {exporting ? 'Exporting…' : 'Download PNG'}</button>
          </div>
        </div>
        <input ref={fileInput} type="file" accept="image/*" onChange={uploadBackground} style={{ display: 'none' }} />
        <label style={{ display: 'block', marginBottom: 16, color: '#134c35' }}>
          Poster headline
          <input value={headline} onChange={event => setHeadline(event.target.value)} maxLength={80} style={{ display: 'block', width: '100%', maxWidth: 420, padding: 12, marginTop: 8, border: '1px solid #b7d3c1', borderRadius: 8 }} />
        </label>
        {status && <p role="status" style={{ marginBottom: 12 }}>{status}</p>}
        <div style={{ maxWidth: 525, margin: '0 auto', aspectRatio: '1080 / 1350', position: 'relative', overflow: 'hidden', borderRadius: 12, background: '#e8f9e8', boxShadow: '0 16px 45px #123a2a20' }}>
          <img src={background} alt="Selected poster background" style={{ width: '100%', height: '100%', objectFit: 'fill', position: 'absolute', inset: 0 }} />
          <div style={{ position: 'absolute', inset: 0, padding: '4% 5%', display: 'flex', flexDirection: 'column', gap: '1%', color: '#073e2a', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(26px, 7vw, 65px)', fontWeight: 800, lineHeight: 1 }}>msf</div>
            <div style={{ fontSize: 'clamp(12px, 3vw, 25px)', fontWeight: 800 }}>{headline}</div>
            {[...GROUPS.filter(g => g.id !== 'leadership'), ...GROUPS.filter(g => g.id === 'leadership')].map(group => (
              <div key={group.id} style={{ minHeight: 0, flex: group.id === 'executive' ? 3 : group.id === 'leadership' ? 1.4 : 1.3, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ background: '#087b39', color: 'white', borderRadius: 20, padding: '2px 6px', fontSize: 'clamp(8px, 1.7vw, 15px)', fontWeight: 800 }}>{group.title.toUpperCase()}</div>
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${group.id === 'executive' ? 7 : group.id === 'leadership' ? 3 : 4}, minmax(0, 1fr))`, alignContent: 'start', gap: '3px 5px', minHeight: 0 }}>
                  {MEMBERS.filter(m => m.group === group.id).map(member => (
                    <div key={member.id} style={{ minWidth: 0 }}>
                      <img src={photos[member.id] || imageUrl(member)} alt={member.name} style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 4, background: '#d8eadc' }} />
                      <div style={{ fontSize: 'clamp(5px, 1.2vw, 11px)', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name.toUpperCase()}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
