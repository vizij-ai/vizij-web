import { SectionIntro } from "../components/SectionIntro";

const LAYERS = [
  {
    icon: "🧠",
    title: "Core libraries",
    description:
      "Rust animation, node graph, and behavior crates that compile to WASM.",
  },
  {
    icon: "🌐",
    title: "Web tooling",
    description: "React-based Studio, Rig Editor, Renderer, and Graph UI.",
  },
  {
    icon: "🤝",
    title: "Bridges",
    description: "ROS 2, Zenoh, or WebSocket adapters for live deployments.",
  },
];

export function ArchitectureSection() {
  return (
    <section id="architecture" className="showcase-section">
      <SectionIntro
        eyebrow="Architecture"
        title="A multi-layer stack for embodied AI."
        description="Swap renderers, transports, or orchestration logic without rewriting the rig—Vizij stays modular end to end."
      />
      <div className="architecture-grid">
        {LAYERS.map((layer) => (
          <article className="architecture-card" key={layer.title}>
            <span className="architecture-card__icon" aria-hidden>
              {layer.icon}
            </span>
            <p className="architecture-card__title">{layer.title}</p>
            <p className="architecture-card__body">{layer.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
