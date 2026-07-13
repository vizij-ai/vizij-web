import { useEffect, useMemo, useState } from "react";
import {
  useVizijRuntime,
  type ProgramPlaybackState,
} from "@vizij/runtime-react";
import { useAppState } from "../state/AppStateContext";
import { IconButton } from "./IconButton";
import { RuntimeApiDisclosure } from "./RuntimeApiDisclosure";

function useProgramSnapshots(programIds: string[]) {
  const { getProgramState } = useVizijRuntime();
  const [snapshots, setSnapshots] = useState<
    Record<string, ProgramPlaybackState | null>
  >({});
  const programIdsKey = programIds.join("|");

  useEffect(() => {
    if (programIds.length === 0) {
      // Bail if already empty: `assetBundle.programs` is rebuilt every render,
      // so `programIds` is a fresh reference each time and this effect re-runs
      // on every render. Setting a new `{}` here would then loop forever
      // ("Maximum update depth"); returning `prev` unchanged lets React bail.
      setSnapshots((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    const timer = window.setInterval(() => {
      setSnapshots(
        Object.fromEntries(programIds.map((id) => [id, getProgramState(id)])),
      );
    }, 150);
    return () => window.clearInterval(timer);
    // Keyed by `programIdsKey` (stable by value), not `programIds` (unstable
    // identity) — otherwise the interval is torn down and rebuilt every render
    // and its snapshots never settle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getProgramState, programIdsKey]);

  return snapshots;
}

export function ProgramsPanel() {
  const { assetBundle, playProgram, pauseProgram, stopProgram } =
    useVizijRuntime();
  const {
    state: {
      playbackSelection: { programId },
    },
    setSelectedProgram,
  } = useAppState();
  const programs = assetBundle.programs ?? [];
  const programIds = useMemo(
    () => programs.map((program) => program.id),
    [programs],
  );
  const programIdsKey = programIds.join("|");
  const snapshots = useProgramSnapshots(programIds);

  useEffect(() => {
    if (!programs.length) {
      setSelectedProgram(null);
      return;
    }
    if (!programId || !programs.some((program) => program.id === programId)) {
      setSelectedProgram(programs[0]!.id);
    }
  }, [programId, programIdsKey, programs, setSelectedProgram]);

  const selectedProgram =
    programs.find((program) => program.id === programId) ?? programs[0] ?? null;
  const runtimeExamples = useMemo(() => {
    if (!selectedProgram) {
      return [];
    }

    return [
      {
        label: selectedProgram.label ?? selectedProgram.id,
        code: [
          `playProgram(${JSON.stringify(selectedProgram.id)});`,
          `pauseProgram(${JSON.stringify(selectedProgram.id)});`,
          `stopProgram(${JSON.stringify(selectedProgram.id)}, { resetOutputs: true });`,
        ].join("\n"),
      },
    ];
  }, [selectedProgram]);

  return (
    <section className="panel" aria-labelledby="program-panel-title">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Procedural motiongraph</p>
          <h2 id="program-panel-title">Programs</h2>
        </div>
      </header>
      <div className="panel-body">
        {programs.length === 0 ? (
          <div className="panel-empty">
            No bundled procedural programs were discovered in this face.
          </div>
        ) : (
          <>
            <div className="list-stack">
              {programs.map((program) => {
                const state = snapshots[program.id];
                const active = program.id === programId;
                return (
                  <article
                    key={program.id}
                    className={`program-card ${active ? "is-active" : ""}`}
                  >
                    <button
                      type="button"
                      className="program-card-select"
                      onClick={() => setSelectedProgram(program.id)}
                    >
                      <span>
                        <strong>{program.label ?? program.id}</strong>
                        <small>{program.id}</small>
                      </span>
                      <span className="soft-badge">
                        {state?.state ?? "stopped"}
                      </span>
                    </button>
                    <div className="transport-actions">
                      <IconButton
                        icon="play"
                        label={`Play ${program.label ?? program.id}`}
                        onClick={() => playProgram(program.id)}
                      />
                      <IconButton
                        icon="pause"
                        label={`Pause ${program.label ?? program.id}`}
                        onClick={() => pauseProgram(program.id)}
                      />
                      <IconButton
                        icon="stop"
                        label={`Stop ${program.label ?? program.id}`}
                        onClick={() =>
                          stopProgram(program.id, { resetOutputs: true })
                        }
                      />
                    </div>
                  </article>
                );
              })}
            </div>
            <RuntimeApiDisclosure
              title="Runtime program calls"
              description="The selected procedural program uses the runtime program transport directly."
              examples={runtimeExamples}
            />
          </>
        )}
      </div>
    </section>
  );
}
