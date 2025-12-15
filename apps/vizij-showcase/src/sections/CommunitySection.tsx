const LINKS = [
  // { label: "💬 Join the Discord", href: "https://discord.gg/vizij" },
  { label: "🧑‍💻 Contribute on GitHub", href: "https://github.com/vizij-ai" },
  {
    label: "Learn more about Semio Community",
    href: "https://semio.community",
  },
  // { label: "💡 Share your rigs", href: "https://semio.community/showcase" },
];

export function CommunitySection() {
  return (
    <section id="community" className="showcase-section">
      <div className="section-header">
        <p className="section-eyebrow">Join the community</p>
        <h2 className="section-title">
          Vizij is built inside the{" "}
          <a href="https://semio.community">Semio Community</a>.
        </h2>
        <p className="section-description">
          We are building open, extensible tools for expressive robot systems.
          Join the community to share rigs, contribute code, and co-host
          workshops.
        </p>
      </div>
      <div className="community-chip-row">
        {LINKS.map((link) => (
          <a
            key={link.label}
            className="community-chip"
            href={link.href}
            target="_blank"
            rel="noreferrer"
          >
            {link.label}
          </a>
        ))}
      </div>
    </section>
  );
}
