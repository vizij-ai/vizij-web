import { ShowcaseRuntime } from "../components/ShowcaseRuntime";
import { SectionIntro } from "../components/SectionIntro";
import { RigControlPanel } from "../components/RigControlPanel";
import { RuntimeFaceFrame } from "../components/RuntimeFaceFrame";
import { FaceFramePlaceholder } from "../components/FaceFramePlaceholder";
import { useSectionInView } from "../hooks/useSectionInView";

/** The face's own rig and poses, without its standard adaptation, which
 * would write the inputs this section sets. */
const RIG_ONLY = {
  graphs: ["rig", "pose-driver", "pose"],
  program: "none",
};

export function ControlsSection() {
  const { ref, hasEntered, isVisible } = useSectionInView<HTMLElement>({
    threshold: 0.4,
    once: false,
  });

  return (
    <section id="controls" className="showcase-section" ref={ref}>
      <SectionIntro
        eyebrow="Fine-grain control"
        title="Every feature is controllable."
        description="Dial any part of the face—from color and opacity to 3D position, rotation, and scale. Search a path, add it, and drive exact values into the face's device."
      />
      <ShowcaseRuntime
        namespace="controls"
        active={hasEntered}
        visible={isVisible}
        options={RIG_ONLY}
        fallback={<ControlsFallback />}
      >
        <div className="section-grid two-col">
          <RigControlPanel />
          <RuntimeFaceFrame
            variant="md"
            label="Feature overrides"
            subtitle="Blend shapes, transforms, materials—anything on the rig"
          />
        </div>
      </ShowcaseRuntime>
    </section>
  );
}

function ControlsFallback() {
  return (
    <div className="section-grid two-col">
      <div className="input-stage input-stage--placeholder">
        <p className="input-stage__title">Feature overrides</p>
        <p className="input-stage__subtitle">
          Vizij will boot this live feature editor once the section is in view.
        </p>
        <div className="input-stage__placeholder-bar" aria-hidden />
        <div className="input-stage__placeholder-bar" aria-hidden />
        <div className="input-stage__placeholder-grid" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </div>
      <FaceFramePlaceholder
        variant="md"
        label="Rig playground"
        subtitle="Scroll to initialise Vizij"
      />
    </div>
  );
}
