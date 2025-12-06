export function FooterSection() {
  return (
    <footer className="showcase-section footer-section">
      <div className="section-header">
        <p className="section-eyebrow">Stay connected</p>
        <h2 className="section-title">hello@vizij.ai</h2>
        <p className="section-description">
          Vizij keeps AI expressive on every surface—web, app, or robot.
        </p>
      </div>
      <div className="footer-links">
        <a href="https://github.com/vizij-ai" target="_blank" rel="noreferrer">
          Docs →
        </a>
        <a href="https://github.com/vizij-ai" target="_blank" rel="noreferrer">
          GitHub →
        </a>
        <a href="https://semio.community" target="_blank" rel="noreferrer">
          Semio Community →
        </a>
      </div>
      <p className="footer-smallprint">
        © {new Date().getFullYear()} Semio Community · Vizij is open source.
      </p>
    </footer>
  );
}
