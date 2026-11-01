import { ArrowDownRight, ArrowUpRight, Sparkles, Users } from 'lucide-react';

export default function Hero({ totalMembers }) {
  return (
    <section className="hero" id="home" aria-labelledby="hero-title">
      <div className="hero-decoration hero-decoration-one" aria-hidden="true" />
      <div className="hero-decoration hero-decoration-two" aria-hidden="true" />
      <div className="container hero-layout">
        <div className="hero-copy">
          <span className="hero-tag"><span className="status-dot" /> MSF · UNIT COMMITTEE</span>
          <p className="hero-overline">മമ്പാടുമൂല യൂണിറ്റ് കമ്മിറ്റി</p>
          <h1 id="hero-title">പുതിയ <span>നേതൃത്വം</span><br />പുതിയ പ്രതീക്ഷകൾ<span className="title-dot">.</span></h1>
          <p className="hero-desc">നമ്മുടെ യൂണിറ്റ് കമ്മിറ്റിയുടെ നേതൃത്വത്തെയും സഹപ്രവർത്തകരെയും പരിചയപ്പെടാം.</p>
          <div className="hero-links">
            <a href="#leadership" className="btn btn-primary">Meet our leaders <ArrowUpRight size={18} /></a>
            <a href="#committee" className="btn btn-outline">Explore committee <ArrowDownRight size={18} /></a>
          </div>
          <div className="hero-stat-line"><span className="hero-stat-icon"><Users size={21} /></span><strong>{totalMembers}</strong><span>Committee members</span><span className="hero-divider" /><Sparkles size={17} /><span>One team</span></div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-ring hero-ring-back" />
          <div className="hero-ring hero-ring-mid" />
          <div className="hero-logo-disc"><span>msf</span><small>UNIT COMMITTEE</small></div>
          <div className="hero-visual-note">MSF <span>2026</span></div>
        </div>
      </div>
    </section>
  );
}
