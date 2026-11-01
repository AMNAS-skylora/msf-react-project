export default function SectionHeading({ number, eyebrow, title, emphasis, subtitle, children }) {
  return (
    <div className="section-heading">
      <div>
        <div className="section-eyebrow"><span>{number}</span> / {eyebrow}</div>
        <h2>{title} <span>{emphasis}</span></h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
