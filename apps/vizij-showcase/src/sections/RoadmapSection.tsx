export function RoadmapSection() {
  return (
    <section id="roadmap" className="showcase-section">
      <div className="section-header">
        <p className="section-eyebrow">Roadmap</p>
        <h2 className="section-title">
          Shipping now, building for the long run.
        </h2>
        <p className="section-description">
          Here is what the team is focused on today and where the platform is
          heading next.
        </p>
      </div>
      <div className="roadmap-grid">
        <div className="roadmap-card">
          <p className="roadmap-card__eyebrow">Phase I</p>
          <h3 className="roadmap-card__title">Short-term goals</h3>
          <ul className="roadmap-list">
            <li>Ship Vizij Core, Rig, and Renderer crates.</li>
            <li>Release open reference rigs and sample robots.</li>
            <li>Launch open source Vizij customization tools.</li>
            <li>Stand up community governance and documentation.</li>
          </ul>
        </div>
        <div className="roadmap-card">
          <p className="roadmap-card__eyebrow">Vision</p>
          <h3 className="roadmap-card__title">Long-term outlook</h3>
          <p className="roadmap-card__body">
            An open expressive-robot ecosystem where anyone can author, share,
            and remix expressive animation and behavior modules across robots,
            apps, and devices.
          </p>
        </div>
      </div>
    </section>
  );
}
