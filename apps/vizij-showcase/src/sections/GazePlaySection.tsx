import { ShowcaseRuntime } from "../components/ShowcaseRuntime";
import { SectionIntro } from "../components/SectionIntro";
import { GazeInteractiveFace } from "../components/GazeInteractiveFace";
import { FaceFramePlaceholder } from "../components/FaceFramePlaceholder";
import { useSectionInView } from "../hooks/useSectionInView";

/** Quori's program implements the gaze target and its idle gaze. */
const WITH_PROGRAM = { program: "auto" } as const;

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
        description="Let the face's own idle gaze run, or connect mouse, touch, or sensor data to the gaze target for joint attention in real time."
      />
      <ShowcaseRuntime
        namespace="gaze"
        active={hasEntered}
        visible={isVisible}
        options={WITH_PROGRAM}
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
      message="Scroll a bit further to wake this Vizij face."
    />
  );
}
