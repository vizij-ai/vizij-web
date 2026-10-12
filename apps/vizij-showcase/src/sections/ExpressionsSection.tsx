import { ShowcaseRuntime } from "../components/ShowcaseRuntime";
import { SectionIntro } from "../components/SectionIntro";
import { RuntimeFaceFrame } from "../components/RuntimeFaceFrame";
import { ExpressionPanel } from "../components/ExpressionPanel";
import { FaceFramePlaceholder } from "../components/FaceFramePlaceholder";
import { useSectionInView } from "../hooks/useSectionInView";

export function ExpressionsSection() {
  const { ref, hasEntered, isVisible } = useSectionInView<HTMLElement>({
    threshold: 0.35,
    once: false,
  });

  return (
    <section id="expressions" className="showcase-section" ref={ref}>
      <SectionIntro
        eyebrow="Expressions"
        title="Express emotions with Vizij."
        description="Expressions, visemes, and gestures are named in the Vizij face standard, so any rendered face expresses mood and intent the same way."
      />
      <ShowcaseRuntime
        namespace="expressions"
        active={hasEntered}
        visible={isVisible}
        fallback={<ExpressionsFallback />}
      >
        <div className="expression-stack">
          <div className="expression-panel-shell">
            <ExpressionPanel />
          </div>
          <div className="expression-face-grid">
            <RuntimeFaceFrame
              variant="md"
              label="Expression kit · Quori"
              subtitle="Tap a preset or fire the hotkeys to see the expression"
            />
          </div>
        </div>
      </ShowcaseRuntime>
    </section>
  );
}

function ExpressionsFallback() {
  return (
    <div className="expression-stack">
      <div className="expression-panel-shell">
        <div className="feature-card feature-card--placeholder">
          <p className="feature-card__eyebrow">Expressions</p>
          <h3>Scroll to load the expression kit.</h3>
          <p className="feature-card__description">
            Each section loads its own Vizij face, so this panel awakens once it
            reaches the viewport.
          </p>
          <div className="pose-placeholder-grid" aria-hidden>
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
      <div className="expression-face-grid">
        <FaceFramePlaceholder
          variant="md"
          label="Expression kit · Quori"
          subtitle="Tap a preset or fire the hotkeys to see the expression"
        />
      </div>
    </div>
  );
}
