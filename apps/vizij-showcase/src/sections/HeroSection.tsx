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
            Design and deploy expressive, rendered robot faces that convey
            intent and support consistent interactions across browsers, apps,
            and hardware.
          </p>
          <div className="hero-brand__chips">
            <span className="hero-chip">Emotive facial expressions</span>
            <span className="hero-chip">Granular Gaze Control</span>
            <span className="hero-chip">Synchronized Lips and Speech</span>
            <span className="hero-chip">Web-native GLTF</span>
            <span className="hero-chip">Integrates with ROS 2</span>
          </div>
        </div>
        <div className="section-header">
          <p className="section-eyebrow">Vizij · Rendered robot faces</p>
          <h1 className="section-title">
            Design, animate, and deploy expressive rendered robot faces.
          </h1>
          <p className="section-description">
            Vizij is an open-source ecosystem for building and deploying
            rendered robot faces. It provides a standardized, modular rig and
            controller pipeline—covering gaze, visemes, and emotion—so faces
            behave consistently across hardware.
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
      <div className="section-description">
        <p>
          Hugo (from <a href="https://peerbots.org">Peerbots</a>), and{" "}
          <a href="https://quori.org">Quori</a> are driven by Vizij rigs and
          controllers, combining expressions, visemes, blinks, and saccades to
          create communicative, rendered robot faces. Below, feature-specific
          demos unpack the building blocks—rig controls, poses, gaze behaviors,
          and speech blending— that enable these performances.
        </p>
      </div>
    </section>
  );
}
