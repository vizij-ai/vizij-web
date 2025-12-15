import { ShowcaseRuntime } from "../components/ShowcaseRuntime";
import { SectionIntro } from "../components/SectionIntro";
import { GazeInteractiveFace } from "../components/GazeInteractiveFace";
import { FaceFramePlaceholder } from "../components/FaceFramePlaceholder";
import { useSectionInView } from "../hooks/useSectionInView";

export function GazePlaySection() {
  const { ref, hasEntered, isVisible } = useSectionInView<HTMLElement>({
    threshold: 0.3,
    once: false,
  });

  return (
    <section id="gaze" className="showcase-section" ref={ref}>
      <SectionIntro
        eyebrow="Responsive presence"
        title="Enable rendered faces to give people attention across every surface."
        description="Use passive gaze behaviors for idle animations or connect mouse, touch, or sensor data to control gaze for joint attention in real time."
      />
      <ShowcaseRuntime
        namespace="gaze"
        asset="hugoLatest"
        active={hasEntered}
        autostart={isVisible}
        driveOrchestrator
        visible={isVisible}
        hiddenStepHz={1}
        label="Gaze"
        fallback={<GazeFallback />}
      >
        <GazeInteractiveFace enabled={isVisible} />
      </ShowcaseRuntime>
    </section>
  );
}

function GazeFallback() {
  return (
    <FaceFramePlaceholder
      variant="lg"
      label="Cursor-reactive gaze"
      subtitle="Live demo activates on scroll"
      message="Scroll a bit further to wake this Vizij runtime."
    />
  );
}
