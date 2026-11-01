import { ArrowUp } from 'lucide-react';

export default function Footer() {
  return <footer className="site-footer"><div className="container footer-layout"><a href="#home" className="footer-logo" aria-label="Back to MSF home">msf<span>.</span></a><span>മമ്പാടുമൂല യൂണിറ്റ് കമ്മിറ്റി</span><a className="footer-back" href="#home">Back to top <ArrowUp size={16}/></a></div></footer>;
}
