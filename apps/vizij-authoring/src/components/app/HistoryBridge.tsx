import { useEffect, useRef } from "react";
import { appHistory } from "../../state/history/historyStore";
import { registerAnimationHistoryScope } from "../../state/history/animationHistoryScope";
import { registerMotionGraphHistoryScope } from "../../state/history/motiongraphHistoryScope";
import { registerPoseHistoryScope } from "../../state/history/poseHistoryScope";
import { usePoseRigStoreApi } from "../../poseRig/store";
import { useGraphRuntime } from "../../state/RigControllerProvider";
import { useUndoRedoShortcuts } from "../../hooks/useUndoRedoShortcuts";

/**
 * Wires the app-wide undo/redo history: registers the animation,
 * motion-graph, and pose document scopes (the rig scope registers inside
 * useRigController), binds the keyboard shortcuts, and resets history when a
 * different face is loaded so undo never crosses documents.
 */
export function HistoryBridge() {
  const poseStore = usePoseRigStoreApi();
  const faceId = useGraphRuntime((state) => state.faceId);

  useEffect(() => registerAnimationHistoryScope(appHistory), []);
  useEffect(() => registerMotionGraphHistoryScope(appHistory), []);
  useEffect(() => registerPoseHistoryScope(appHistory, poseStore), [poseStore]);

  const lastFaceIdRef = useRef(faceId);
  useEffect(() => {
    if (lastFaceIdRef.current !== faceId) {
      lastFaceIdRef.current = faceId;
      appHistory.reset();
    }
  }, [faceId]);

  useUndoRedoShortcuts();

  return null;
}
