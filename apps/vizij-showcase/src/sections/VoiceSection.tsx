import { useEffect, useRef, useState } from "react";
import { ShowcaseRuntime } from "../components/ShowcaseRuntime";
import { SectionIntro } from "../components/SectionIntro";
import { RuntimeFaceFrame } from "../components/RuntimeFaceFrame";
import { VoicePanel } from "../components/VoicePanel";
import { SpeechOverlay } from "../components/SpeechOverlay";
import { FaceFramePlaceholder } from "../components/FaceFramePlaceholder";
import { useSectionInView } from "../hooks/useSectionInView";
import { type SpeechStatus } from "../data/speech";

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
        title="Stream visemes into affective rigs."
        description="Kick off the sample Amazon Polly read to see how audio events map to facial nuance. Swap in your own SSML or live robot speech next—the scaffolding is ready."
      />
      <ShowcaseRuntime
        namespace="voice"
        asset="hugoLatest"
        active={hasEntered}
        autostart={isVisible}
        driveOrchestrator
        visible={isVisible}
        hiddenStepHz={1}
        label="Voice"
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
            subtitle="Polly timeline scaffold"
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
          Amazon Polly + Vizij viseme playback boots as soon as the section is
          visible, keeping initial load snappy.
        </p>
      </div>
      <FaceFramePlaceholder
        variant="lg"
        label="Voice reactive"
        subtitle="Viseme playback scaffold"
      />
    </div>
  );
}
