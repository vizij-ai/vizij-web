import { VizijRuntimeProvider } from "@vizij/runtime-react";
import { RuntimeFaceFrame } from "../RuntimeFaceFrame";
import { DemoEmotionRow } from "./DemoEmotionRow";
import { DemoVoicePanel } from "./DemoVoicePanel";
import { useDemoMouseGaze } from "./useDemoMouseGaze";

/** Quori as shipped: its default composition, its active program running
 * from load. */
const DEMO_FACE = "/assets/Quori_Current_Extended.glb";

export function EmptyStateDemo() {
  return (
    <VizijRuntimeProvider glb={DEMO_FACE}>
      <EmptyStateDemoBody />
    </VizijRuntimeProvider>
  );
}

function EmptyStateDemoBody() {
  const gazeRef = useDemoMouseGaze();

  return (
    <div
      data-testid="empty-state-demo"
      className="flex w-full max-w-xl flex-col items-center gap-3"
    >
      <div className="h-52 w-full sm:h-60">
        <RuntimeFaceFrame variant="fill" pointerTargetRef={gazeRef} />
      </div>
      <DemoEmotionRow />
      <DemoVoicePanel />
    </div>
  );
}
