import {
  VizijRuntimeProvider,
  type VizijAssetBundle,
} from "@vizij/runtime-react";
import { RuntimeFaceFrame } from "../RuntimeFaceFrame";
import { DemoEmotionRow } from "./DemoEmotionRow";
import { DemoVoicePanel } from "./DemoVoicePanel";
import { useDemoMouseGaze } from "./useDemoMouseGaze";
import { useDemoIdleGaze } from "./useDemoIdleGaze";

const DEMO_BUNDLE: VizijAssetBundle = {
  namespace: "empty-demo",
  glb: {
    kind: "url",
    src: "/assets/Quori_Current_Extended.glb",
    aggressiveImport: true,
  },
  pose: {
    stageNeutralFilter: (_id, path) => !path.includes("/color/"),
  },
};

export function EmptyStateDemo() {
  return (
    <VizijRuntimeProvider assetBundle={DEMO_BUNDLE} autostart>
      <EmptyStateDemoBody />
    </VizijRuntimeProvider>
  );
}

function EmptyStateDemoBody() {
  const gaze = useDemoMouseGaze(true);
  useDemoIdleGaze({ enabled: true, pointerActive: gaze.isPointerActive });

  return (
    <div
      data-testid="empty-state-demo"
      className="flex w-full max-w-xl flex-col items-center gap-3"
    >
      <div className="h-52 w-full sm:h-60">
        <RuntimeFaceFrame variant="fill" pointerTargetRef={gaze.ref} />
      </div>
      <DemoEmotionRow />
      <DemoVoicePanel />
    </div>
  );
}
