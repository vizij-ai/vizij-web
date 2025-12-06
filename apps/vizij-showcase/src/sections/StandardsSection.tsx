const STACK = [
  "Rust",
  "WebAssembly",
  "React",
  "ROS 2",
  "GLTF",
  "TypeScript",
  "Zenoh",
];

export function StandardsSection() {
  return (
    <section id="standards" className="showcase-section standards-section">
      <div className="section-header">
        <p className="section-eyebrow">Open standards</p>
        <h2 className="section-title">Built on the open stack.</h2>
        <p className="section-description">
          Vizij rides the same technologies teams already trust, so expressive
          AI stays portable and future-proof.
        </p>
      </div>
      <div className="standards-row">
        {STACK.map((item) => (
          <span className="standards-pill" key={item}>
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}
