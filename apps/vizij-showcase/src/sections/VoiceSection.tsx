import { useEffect, useRef, useState } from "react";
import { ShowcaseRuntime } from "../components/ShowcaseRuntime";
import { SectionIntro } from "../components/SectionIntro";
import { RuntimeFaceFrame } from "../components/RuntimeFaceFrame";
import { VoicePanel } from "../components/VoicePanel";
import { SpeechOverlay } from "../components/SpeechOverlay";
import { FaceFramePlaceholder } from "../components/FaceFramePlaceholder";
import { useSectionInView } from "../hooks/useSectionInView";
import { type SpeechStatus } from "../data/speech";
import { getApiBase } from "../services/apiBase";

/** The text-to-speech service `say` calls. */
const SPEECH_OPTIONS = { program: "none", speechApiUrl: getApiBase() };

export function VoiceSection() {
  const [speechStatus, setSpeechStatus] = useState<SpeechStatus>("idle");
  const [showOverlay, setShowOverlay] = useState(true);
  const facePointerRef = useRef<HTMLDivElement | null>(null);
  const { ref, hasEntered, isVisible } = useSectionInView<HTMLElement>({
    threshold: 0.3,
    once: false,
  });

  useEffect(() => {
    if (!showOverlay) {
      return;
    }
    const node = facePointerRef.current;
    if (!node) {
      return;
    }
    const hide = () => setShowOverlay(false);
    node.addEventListener("pointermove", hide, { once: true });
    node.addEventListener("pointerdown", hide, { once: true });
    return () => {
      node.removeEventListener("pointermove", hide);
      node.removeEventListener("pointerdown", hide);
    };
  }, [showOverlay]);

  useEffect(() => {
    if (speechStatus !== "idle") {
      setShowOverlay(false);
    }
  }, [speechStatus]);
  return (
    <section id="voice" className="showcase-section" ref={ref}>
      <SectionIntro
        eyebrow="Speech sync"
        title="Stream visemes into rendered faces."
        description="Let the face say a line: its say method synthesises the speech and streams the visemes into its lips. Any voice that produces visemes drives the same face standard."
      />
      <ShowcaseRuntime
        namespace="voice"
        active={hasEntered}
        visible={isVisible}
        options={SPEECH_OPTIONS}
        fallback={<VoiceFallback />}
      >
        <div className="section-grid two-col">
          <VoicePanel
            status={speechStatus}
            onStatusChange={setSpeechStatus}
            enabled={isVisible}
          />
          <RuntimeFaceFrame
            variant="lg"
            label="Voice reactive"
            subtitle="The face's say method"
            pointerTargetRef={facePointerRef}
            overlay={
              showOverlay ? <SpeechOverlay status={speechStatus} /> : null
            }
          />
        </div>
      </ShowcaseRuntime>
    </section>
  );
}

function VoiceFallback() {
  return (
    <div className="section-grid two-col">
      <div className="feature-card feature-card--placeholder">
        <p className="feature-card__eyebrow">Speech pipeline</p>
        <h3>Voice demo warming up.</h3>
        <p className="feature-card__description">
          The face loads as soon as the section is visible, keeping initial load
          snappy.
        </p>
      </div>
      <FaceFramePlaceholder
        variant="lg"
        label="Voice reactive"
        subtitle="The face's say method"
      />
    </div>
  );
}
