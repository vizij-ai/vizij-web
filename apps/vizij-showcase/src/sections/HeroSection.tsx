import { useCallback } from "react";
import { HERO_FACES } from "../data/heroFaces";
import { ShowcaseRuntime } from "../components/ShowcaseRuntime";
import { RuntimeFaceFrame } from "../components/RuntimeFaceFrame";
import { HeroPassiveBehavior } from "../components/HeroPassiveBehavior";
import { useSectionInView } from "../hooks/useSectionInView";

export function HeroSection() {
  const { ref, isVisible, hasEntered } = useSectionInView<HTMLElement>({
    threshold: 0.2,
    once: false,
  });
  const scrollToSection = useCallback((targetId: string) => {
    const node = document.getElementById(targetId);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return (
    <section
      id="hero"
      className="showcase-section showcase-section--hero"
      ref={ref}
    >
      <div className="hero-header">
        <div className="hero-brand">
          <div className="hero-brand__identity">
            <span className="hero-brand__icon-shell">
              <img
                src="/assets/vizij-icon.png"
                alt="Vizij icon"
                className="hero-brand__icon"
                loading="lazy"
              />
            </span>
            <img
              src="/assets/vizij.png"
              alt="Vizij wordmark"
              className="hero-brand__wordmark"
              loading="lazy"
            />
          </div>
          <p className="hero-brand__tagline">
            Let every AI show up with a face that matches its intent. Vizij
            keeps affective, embodied assistants consistent on any surface.
          </p>
          <div className="hero-brand__chips">
            <span className="hero-chip">Affective Intelligence</span>
            <span className="hero-chip">Embodied AI</span>
            <span className="hero-chip">Web-native GLTF</span>
            <span className="hero-chip">Extend with ROS 2 + Zenoh</span>
          </div>
        </div>
        <div className="section-header">
          <p className="section-eyebrow">Vizij · Affective surfaces</p>
          <h1 className="section-title">
            Design, animate, and deploy lifelike AI characters.
          </h1>
          <p className="section-description">
            Vizij is the open platform for affective, embodied AI—built so
            assistants, agents, and robots feel expressive and human-aligned
            whether they greet someone in a browser, an app, or on real
            hardware.
          </p>
          <div className="hero-cta-row">
            <button
              type="button"
              className="cta"
              onClick={() => scrollToSection("controls")}
            >
              Launch the showcase
            </button>
            <a
              className="ghost-button"
              href="https://github.com/vizij-ai"
              target="_blank"
              rel="noreferrer"
            >
              Read the docs
            </a>
            <a
              className="ghost-link"
              href="https://github.com/vizij-ai"
              target="_blank"
              rel="noreferrer"
            >
              ⭐ Star Vizij on GitHub
            </a>
          </div>
        </div>
      </div>
      <div className="hero-face-grid">
        {HERO_FACES.map((face, index) => (
          <ShowcaseRuntime
            namespace={face.namespace}
            asset={face.asset}
            key={face.namespace}
            active={hasEntered}
            visible={isVisible}
            driveOrchestrator={index === 0}
            label={face.label}
          >
            <HeroPassiveBehavior enabled={isVisible} />
            <RuntimeFaceFrame
              variant="sm"
              label={face.label}
              subtitle={face.subtitle}
              className="hero-face-card"
            />
          </ShowcaseRuntime>
        ))}
      </div>
      <div className="section-note section-note--hero">
        <p>
          Hugo and Quori are each improvising: mixing expressions and vizemes
          while coordinating blinks and saccades to stay lifelike. Below, you’ll
          find focused demos that unpack the building blocks—rig controls, pose
          kits, gaze behaviors, and speech blending—that make this composite
          performance work.
        </p>
      </div>
    </section>
  );
}
