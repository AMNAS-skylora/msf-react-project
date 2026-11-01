import { useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';

const links = [
  { href: '#home', title: 'Home' },
  { href: '#poster', title: 'Poster' },
  { href: '#leadership', title: 'Leadership' },
  { href: '#committee', title: 'Committee' },
  { href: '#about', title: 'About' },
];

export default function Header() {
  const [expanded, setExpanded] = useState(false);
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a className="brand" href="#home" aria-label="MSF Unit Committee home" onClick={() => setExpanded(false)}>
          <span className="brand-logo">msf<span className="logo-period">.</span></span>
          <span className="brand-caption">മമ്പാടുമൂല<br />യൂണിറ്റ് കമ്മിറ്റി</span>
        </a>
        <nav aria-label="Main navigation" className={`site-nav ${expanded ? 'is-open' : ''}`} id="primary-navigation">
          {links.map((link) => <a key={link.href} href={link.href} onClick={() => setExpanded(false)}>{link.title}</a>)}
          <a className="nav-contact" href="#committee" onClick={() => setExpanded(false)}>Our team <ArrowUpRight size={15} /></a>
        </nav>
        <button className="mobile-menu" type="button" aria-label={expanded ? 'Close menu' : 'Open menu'} aria-expanded={expanded} aria-controls="primary-navigation" onClick={() => setExpanded((previous) => !previous)}>
          {expanded ? <X size={23} /> : <Menu size={23} />}
        </button>
      </div>
    </header>
  );
}
