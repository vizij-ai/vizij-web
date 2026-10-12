import { useEffect, useMemo, useRef, useState } from "react";
import type { Pose } from "@vizij/runtime";
import { useVizijRuntime } from "@vizij/runtime-react";
import { useAppState } from "../state/AppStateContext";
import { IconButton } from "./IconButton";
import { RuntimeApiDisclosure } from "./RuntimeApiDisclosure";

type PoseBucket = {
  id: string;
  label: string;
  poses: Pose[];
};

const PULSE_MS = 450;

/** A pose's weight, relative to the face. */
const weightPath = (poseId: string) => `poses/${poseId}.weight`;

/**
 * The bundle's poses, by group (`describe(glb).poses` and `.poseGroups`).
 * A pulse sets a pose's weight to 1 and back to 0; a hold keeps one pose at
 * 1 and every other at 0; the reset returns the whole face to rest
 * (`invoke("reset")`).
 */
export function PosePanel() {
  const { runtime, description } = useVizijRuntime();
  const {
    state: {
      playbackSelection: { poseGroupId },
    },
    setSelectedPoseGroup,
  } = useAppState();
  const [heldPoseId, setHeldPoseId] = useState<string | null>(null);
  const timersRef = useRef<number[]>([]);
  const poses = useMemo(() => description?.poses ?? [], [description]);
  const groups = useMemo(() => description?.poseGroups ?? [], [description]);

  const buckets = useMemo(() => {
    const byId = new Map<string, PoseBucket>(
      groups.map((group) => [
        group.id,
        { id: group.id, label: group.name ?? group.id, poses: [] },
      ]),
    );
    const ungrouped: PoseBucket = {
      id: "ungrouped",
      label: groups.length > 0 ? "Ungrouped" : "All poses",
      poses: [],
    };
    poses.forEach((pose) => {
      const owners = pose.groupIds
        .map((id) => byId.get(id))
        .filter((bucket): bucket is PoseBucket => Boolean(bucket));
      if (owners.length === 0) {
        ungrouped.poses.push(pose);
      }
      owners.forEach((bucket) => bucket.poses.push(pose));
    });
    const next = Array.from(byId.values()).filter(
      (bucket) => bucket.poses.length > 0,
    );
    if (ungrouped.poses.length > 0 || next.length === 0) {
      next.push(ungrouped);
    }
    return next;
  }, [groups, poses]);

  const groupNames = useMemo(
    () => new Map(groups.map((group) => [group.id, group.name ?? group.id])),
    [groups],
  );

  useEffect(() => {
    if (!buckets.length) {
      setSelectedPoseGroup(null);
      return;
    }
    if (!poseGroupId || !buckets.some((bucket) => bucket.id === poseGroupId)) {
      setSelectedPoseGroup(buckets[0]!.id);
    }
  }, [buckets, poseGroupId, setSelectedPoseGroup]);

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
    },
    [],
  );

  const activeBucket =
    buckets.find((bucket) => bucket.id === poseGroupId) ?? buckets[0] ?? null;
  const examplePose = activeBucket?.poses[0] ?? null;
  const runtimeExamples = useMemo(() => {
    if (!examplePose) {
      return [];
    }
    const path = JSON.stringify(weightPath(examplePose.id));
    return [
      {
        label: `${examplePose.name ?? examplePose.id} pulse / hold`,
        code: [
          `const weight = runtime.path(${path});`,
          "",
          `// Bounce the pose on, then release it after ${PULSE_MS} ms.`,
          "runtime.setValue(weight, 1);",
          `setTimeout(() => runtime.setValue(weight, 0), ${PULSE_MS});`,
          "",
          "// Back to rest: every key the face's graphs read.",
          'await runtime.invoke("reset");',
        ].join("\n"),
      },
    ];
  }, [examplePose]);

  const setWeights = (weights: Record<string, number>) => {
    if (!runtime) return;
    runtime.writeValues(
      Object.fromEntries(
        Object.entries(weights).map(([poseId, weight]) => [
          runtime.path(weightPath(poseId)),
          weight,
        ]),
      ),
    );
  };

  const handleReset = () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    setHeldPoseId(null);
    void runtime?.invoke("reset");
  };

  const pulsePose = (poseId: string) => {
    setWeights({ [poseId]: 1 });
    const timer = window.setTimeout(() => {
      setWeights({ [poseId]: 0 });
      timersRef.current = timersRef.current.filter((entry) => entry !== timer);
    }, PULSE_MS);
    timersRef.current.push(timer);
  };

  const toggleHold = (poseId: string) => {
    const nextId = heldPoseId === poseId ? null : poseId;
    setWeights(
      Object.fromEntries(
        poses.map((pose) => [pose.id, pose.id === nextId ? 1 : 0]),
      ),
    );
    setHeldPoseId(nextId);
  };

  return (
    <section className="panel" aria-labelledby="pose-panel-title">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Bundle poses</p>
          <h2 id="pose-panel-title">Poses</h2>
        </div>
        <IconButton icon="reset" label="Neutral reset" onClick={handleReset} />
      </header>
      <div className="panel-body">
        {buckets.length === 0 || poses.length === 0 ? (
          <div className="panel-empty">
            This bundle does not include a pose rig.
          </div>
        ) : (
          <>
            <div className="segmented-row">
              {buckets.map((bucket) => (
                <button
                  key={bucket.id}
                  type="button"
                  className={
                    bucket.id === activeBucket?.id ? "secondary" : "ghost"
                  }
                  onClick={() => setSelectedPoseGroup(bucket.id)}
                >
                  {bucket.label}
                </button>
              ))}
            </div>
            <div className="pose-list">
              {activeBucket?.poses.map((pose) => {
                const held = heldPoseId === pose.id;
                const poseLabel = pose.name ?? pose.id;
                const groupLabel = pose.groupIds
                  .map((id) => groupNames.get(id))
                  .filter(Boolean)
                  .join(", ");
                return (
                  <article
                    key={pose.id}
                    className={`pose-row ${held ? "is-held" : ""}`}
                    title={
                      pose.description ??
                      `${poseLabel} pose target ready for playback.`
                    }
                  >
                    <div className="pose-row-main">
                      <strong>{poseLabel}</strong>
                      {groupLabel ? (
                        <span className="soft-badge">{groupLabel}</span>
                      ) : null}
                    </div>
                    <div className="icon-toolbar">
                      <IconButton
                        icon="pulse"
                        label={`Pulse ${poseLabel}`}
                        onClick={() => pulsePose(pose.id)}
                      />
                      <IconButton
                        icon="hold"
                        label={
                          held ? `Release ${poseLabel}` : `Hold ${poseLabel}`
                        }
                        active={held}
                        onClick={() => toggleHold(pose.id)}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
            <RuntimeApiDisclosure
              title="Runtime pose calls"
              description="One pose weight from the loaded bundle, pulsed and held, and the face's reset."
              examples={runtimeExamples}
            />
          </>
        )}
      </div>
    </section>
  );
}
