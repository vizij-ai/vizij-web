import { useEffect, useMemo, useRef, useState } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import {
  buildPoseWeightPathMap,
  getPoseSemanticKey,
} from "@vizij/studio-support";
import { useAppState } from "../state/AppStateContext";
import { IconButton } from "./IconButton";
import { RuntimeApiDisclosure } from "./RuntimeApiDisclosure";

type PoseBucket = {
  id: string;
  label: string;
  poses: Array<{ id: string; name?: string; description?: string }>;
};

export function PosePanel() {
  const { assetBundle, setInput, stagePoseNeutral } = useVizijRuntime();
  const {
    state: {
      playbackSelection: { poseGroupId },
    },
    setSelectedPoseGroup,
  } = useAppState();
  const [heldPoseId, setHeldPoseId] = useState<string | null>(null);
  const timersRef = useRef<number[]>([]);
  const poseConfig = assetBundle.pose?.config;

  const posePathMap = useMemo(
    () =>
      buildPoseWeightPathMap(
        Array.isArray(poseConfig?.poses) ? poseConfig.poses : [],
        poseConfig?.faceId ?? assetBundle.faceId ?? null,
      ),
    [assetBundle.faceId, poseConfig?.faceId, poseConfig?.poses],
  );

  const buckets = useMemo(() => {
    const groups = Array.isArray(poseConfig?.poseGroups)
      ? poseConfig.poseGroups
      : [];
    const poses = Array.isArray(poseConfig?.poses) ? poseConfig.poses : [];
    const groupsById = new Map<string, PoseBucket>(
      groups.map((group) => [
        group.id,
        {
          id: group.id,
          label: group.name,
          poses: [] as PoseBucket["poses"],
        },
      ]),
    );
    const uncategorized: PoseBucket = {
      id: "ungrouped",
      label: groups.length > 0 ? "Ungrouped" : "All poses",
      poses: [],
    };

    poses.forEach((pose) => {
      const membership = Array.isArray(pose.groupIds)
        ? pose.groupIds
        : pose.groupId
          ? [pose.groupId]
          : pose.group
            ? [pose.group]
            : [];
      const targetGroups =
        membership.length > 0 ? membership : [uncategorized.id];
      targetGroups.forEach((groupId) => {
        if (groupId === uncategorized.id) {
          uncategorized.poses.push(pose);
          return;
        }
        const bucket = groupsById.get(groupId);
        if (!bucket) {
          uncategorized.poses.push(pose);
          return;
        }
        bucket.poses.push(pose);
      });
    });

    const next: PoseBucket[] = Array.from(groupsById.values()).filter(
      (bucket) => bucket.poses.length > 0,
    );
    if (uncategorized.poses.length > 0 || next.length === 0) {
      next.push(uncategorized);
    }
    return next;
  }, [poseConfig?.poseGroups, poseConfig?.poses]);

  useEffect(() => {
    if (!buckets.length) {
      setSelectedPoseGroup(null);
      return;
    }
    if (!poseGroupId || !buckets.some((bucket) => bucket.id === poseGroupId)) {
      setSelectedPoseGroup(buckets[0]!.id);
    }
  }, [buckets, poseGroupId, setSelectedPoseGroup]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
    };
  }, []);

  const activeBucket =
    buckets.find((bucket) => bucket.id === poseGroupId) ?? buckets[0] ?? null;
  const examplePose = activeBucket?.poses[0] ?? null;
  const examplePosePath = examplePose ? posePathMap.get(examplePose.id) : null;
  const runtimeExamples = useMemo(() => {
    if (!examplePose || !examplePosePath) {
      return [];
    }

    return [
      {
        label: `${examplePose.name ?? examplePose.id} pulse / hold`,
        code: [
          `const posePath = ${JSON.stringify(examplePosePath)};`,
          "",
          "// Bounce the pose on, then release it after 450ms.",
          "setInput(posePath, { float: 1 });",
          "window.setTimeout(() => setInput(posePath, { float: 0 }), 450);",
          "",
          "// Hold the pose until the operator releases or resets it.",
          "stagePoseNeutral(true);",
          "setInput(posePath, { float: 1 });",
        ].join("\n"),
      },
    ];
  }, [examplePose, examplePosePath]);

  const clearPoseWeights = () => {
    posePathMap.forEach((path) => {
      setInput(path, { float: 0 });
    });
  };

  const handleReset = () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    setHeldPoseId(null);
    clearPoseWeights();
    stagePoseNeutral(true);
  };

  const pulsePose = (poseId: string) => {
    const path = posePathMap.get(poseId);
    if (!path) {
      return;
    }
    setInput(path, { float: 1 });
    const timer = window.setTimeout(() => {
      setInput(path, { float: 0 });
      timersRef.current = timersRef.current.filter((entry) => entry !== timer);
    }, 450);
    timersRef.current.push(timer);
  };

  const toggleHold = (poseId: string) => {
    const nextId = heldPoseId === poseId ? null : poseId;
    clearPoseWeights();
    stagePoseNeutral(true);
    if (nextId) {
      const path = posePathMap.get(nextId);
      if (path) {
        setInput(path, { float: 1 });
      }
    }
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
        {buckets.length === 0 ? (
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
                const semanticKey = getPoseSemanticKey(pose);
                const held = heldPoseId === pose.id;
                const poseLabel = pose.name ?? pose.id;
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
                      {semanticKey ? (
                        <span className="soft-badge">{semanticKey}</span>
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
              description="One concrete pose path from the loaded bundle, showing the pulse versus hold behavior behind the UI."
              examples={runtimeExamples}
            />
          </>
        )}
      </div>
    </section>
  );
}
