import { Download, Image as ImageIcon } from 'lucide-react';

const backgroundUrl = `${import.meta.env.BASE_URL}assets/msf-poster-background.webp`;

/**
 * A clean poster canvas with NO photos, logos, names, or headings over the artwork.
 * Future poster designs can use this same base image under separate editable layers.
 */
export default function PosterBackground() {
  return (
    <section id="poster" className="poster-section" aria-labelledby="poster-section-heading">
      <div className="container">
        <div className="poster-heading">
          <div>
            <span className="poster-eyebrow"><ImageIcon size={16} /> POSTER BACKGROUND</span>
            <h2 id="poster-section-heading">Clean green <span>template.</span></h2>
            <p>പേരുകളും ഫോട്ടോകളും എഴുത്തും ഇല്ലാത്ത poster background. പുതിയ ഡിസൈനുകൾക്ക് വീണ്ടും ഉപയോഗിക്കാം.</p>
          </div>
          <a href={backgroundUrl} download="msf-clean-poster-background.webp" className="poster-download">
            <Download size={18} /> Download background
          </a>
        </div>
        <div className="poster-preview-container">
          <div className="poster-preview" aria-label="Empty mint green poster background, without text or photos">
            <img src={backgroundUrl} alt="Soft green gradient poster background with blurred leaves and flowing white-green waves; no text or people" loading="lazy" width="525" height="736" />
          </div>
        </div>
      </div>
    </section>
  );
}
