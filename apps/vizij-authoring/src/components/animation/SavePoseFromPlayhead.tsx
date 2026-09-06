import { useMemo, useState } from "react";
import { Bookmark } from "lucide-react";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import {
  useAnimationStore,
  type AnimationTimeDisplayMode,
} from "../../state/animationStore";
import { usePoseRigStore } from "../../poseRig/store";
import {
  poseFromClipAtTime,
  type PoseCaptureScope,
} from "../../poseRig/poseFromClip";
import { compileAnimationClipIr } from "../../utils/animationClipCompiler";
import {
  ANIMATION_CLIP_IR_SCHEMA_VERSION,
  AUTHORED_TIMELINE_CLIP_ID,
} from "../../types/animationClipIr";
import { formatKeyframeTime } from "../../utils/animationTimeDisplay";

/**
 * Saves the clip's value at the playhead as a pose.
 *
 * The values are sampled from the clip rather than read from the runtime.
 * `capturePose` snapshots the pose store's `currentValues`, which no authoring
 * surface writes as you work — so wiring this button to it would record the
 * last applied pose instead of the frame, and look like it had worked. See
 * `poseFromClipAtTime`.
 */

export interface SavePoseFromPlayheadProps {
  /** Names the pose, e.g. "Wave @ 1.500s". */
  clipName?: string | null;
  timeDisplayMode?: AnimationTimeDisplayMode;
  onSaved?: (result: { poseId: string; name: string }) => void;
}

function buildDefaultPoseName(
  clipName: string | null | undefined,
  time: number,
  mode: AnimationTimeDisplayMode,
): string {
  const base = clipName?.trim() || "Pose";
  return `${base} @ ${formatKeyframeTime(time, mode)}`;
}

export function SavePoseFromPlayhead({
  clipName,
  timeDisplayMode = "seconds",
  onSaved,
}: SavePoseFromPlayheadProps) {
  const tracks = useAnimationStore((state) => state.tracks);
  const duration = useAnimationStore((state) => state.duration);
  const currentTime = useAnimationStore((state) => state.currentTime);

  const standardInputs = usePoseRigStore((state) => state.standardInputs);
  const currentValues = usePoseRigStore((state) => state.currentValues);
  const storeNeutralInputs = usePoseRigStore((state) => state.neutralInputs);
  const createPoseFromValues = usePoseRigStore(
    (state) => state.createPoseFromValues,
  );

  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<PoseCaptureScope>("animated");
  const [name, setName] = useState("");

  const knownInputIds = useMemo(
    () => new Set(standardInputs.map((input) => input.id)),
    [standardInputs],
  );

  const defaultValues = useMemo(() => {
    const resolved: Record<string, number> = {};
    for (const input of standardInputs) {
      resolved[input.id] = input.defaultValue ?? 0;
    }
    return resolved;
  }, [standardInputs]);

  // The rig's neutral is only explicitly captured for some inputs, so fall
  // back to each input's declared default — that is what `createNeutralInputs`
  // builds neutral from in the first place. Without a per-input basis the
  // at-neutral filter cannot fire, and every animated track would be pinned.
  const neutralValues = useMemo(
    () => ({ ...defaultValues, ...storeNeutralInputs }),
    [defaultValues, storeNeutralInputs],
  );

  // `currentValues` is a *filtered* mirror of the binding store, restricted to
  // the visible pose-rig inputs — so it is empty on a face with no pose rig,
  // and "every input" silently captured nothing. Start from the face's own
  // catalog so the scope means what it says; a known live value wins over the
  // declared default.
  const allInputValues = useMemo(
    () => ({ ...defaultValues, ...currentValues }),
    [currentValues, defaultValues],
  );

  // Frozen when the dialog opens: the playhead can still move underneath it
  // (playback is not stopped to open this), and a pose that quietly retargeted
  // itself mid-edit would be the same class of bug as the autosave that wrote
  // to whichever clip happened to be selected when it ran.
  const [capturedTime, setCapturedTime] = useState(0);

  const preview = useMemo(() => {
    if (!open) {
      return null;
    }
    // Compiled the same way export and playback compile it, so the pose holds
    // the values the clip actually produces: compilation normalizes keyframes
    // and drops tracks whose channel never resolved.
    const clip = compileAnimationClipIr({
      clip: {
        schemaVersion: ANIMATION_CLIP_IR_SCHEMA_VERSION,
        id: AUTHORED_TIMELINE_CLIP_ID,
        duration,
        tracks,
      },
    });
    return poseFromClipAtTime({
      clip,
      time: capturedTime,
      knownInputIds,
      baseValues: allInputValues,
      neutralValues,
      scope,
    });
  }, [
    open,
    allInputValues,
    capturedTime,
    duration,
    knownInputIds,
    neutralValues,
    scope,
    tracks,
  ]);

  const animatedCount = useMemo(
    () =>
      tracks.filter(
        (track) =>
          !track.detached &&
          track.keyframes.length > 0 &&
          knownInputIds.has(track.variableId),
      ).length,
    [knownInputIds, tracks],
  );

  const hasTracks = tracks.length > 0;

  const handleOpen = () => {
    setCapturedTime(currentTime);
    setName(buildDefaultPoseName(clipName, currentTime, timeDisplayMode));
    setScope("animated");
    setOpen(true);
  };

  const valueCount = preview ? Object.keys(preview.values).length : 0;
  const canSave = valueCount > 0 && name.trim().length > 0;

  const handleSave = () => {
    if (!preview || !canSave) {
      return;
    }
    const poseName = name.trim();
    const poseId = createPoseFromValues({
      name: poseName,
      values: preview.values,
    });
    setOpen(false);
    if (poseId) {
      onSaved?.({ poseId, name: poseName });
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-[10px] px-2"
        data-testid="save-pose-from-playhead"
        onClick={handleOpen}
        disabled={!hasTracks}
        title={
          hasTracks
            ? "Save this frame's values as a pose"
            : "Add a track before saving a frame as a pose"
        }
      >
        <Bookmark className="mr-1 h-3 w-3" />
        Save Frame as Pose
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Save Frame as Pose"
        maxWidth="md"
      >
        <div className="flex flex-col gap-3">
          <p className="text-[11px] text-text-secondary">
            Sampled from{" "}
            <span className="font-medium text-text-primary">
              {clipName?.trim() || "the current clip"}
            </span>{" "}
            at{" "}
            <span className="font-mono">
              {formatKeyframeTime(capturedTime, timeDisplayMode)}
            </span>
            .
          </p>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              Pose name
            </span>
            <input
              className="w-full rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-600"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Pose name"
            />
          </label>

          <fieldset className="flex flex-col gap-1">
            <legend className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              Inputs to capture
            </legend>
            <label className="flex items-start gap-2 text-xs text-zinc-200">
              <input
                type="radio"
                className="mt-0.5"
                checked={scope === "animated"}
                onChange={() => setScope("animated")}
              />
              <span>
                Only inputs this clip animates
                <span className="ml-1 text-[10px] text-text-muted">
                  ({animatedCount})
                </span>
                <span className="block text-[10px] text-text-muted">
                  Composes with everything else. Inputs resting at neutral are
                  left out so the pose does not fight the ones it blends with.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-zinc-200">
              <input
                type="radio"
                className="mt-0.5"
                checked={scope === "all"}
                onChange={() => setScope("all")}
              />
              <span>
                Every input
                <span className="ml-1 text-[10px] text-text-muted">
                  ({Object.keys(allInputValues).length})
                </span>
                <span className="block text-[10px] text-text-muted">
                  Pins inputs the clip never touched to their current values.
                </span>
              </span>
            </label>
          </fieldset>

          {preview && preview.neutralInputIds.length > 0 ? (
            <p
              className="text-[10px] text-text-muted"
              data-testid="save-pose-neutral-note"
            >
              {preview.neutralInputIds.length} of {animatedCount} animated input
              {animatedCount === 1 ? "" : "s"} rest at neutral here and are left
              out.
            </p>
          ) : null}

          {preview && preview.unresolvedChannels.length > 0 ? (
            <p
              className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-200"
              data-testid="save-pose-unresolved"
            >
              {preview.unresolvedChannels.length} track
              {preview.unresolvedChannels.length === 1 ? "" : "s"} target inputs
              this face does not have, so they are left out:{" "}
              <span className="font-mono">
                {preview.unresolvedChannels.slice(0, 3).join(", ")}
                {preview.unresolvedChannels.length > 3 ? "…" : ""}
              </span>
            </p>
          ) : null}

          {valueCount === 0 ? (
            <p className="text-[11px] text-text-muted">
              Nothing to save — no track at this playhead resolves to a known
              input.
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="subtle" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              data-testid="save-pose-confirm"
              onClick={handleSave}
              disabled={!canSave}
            >
              Save Pose ({valueCount})
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
