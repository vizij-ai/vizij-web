import { useEffect, useMemo, useState } from "react";
import {
  behaviorValue,
  outputKeys,
  runStatus,
  type Program,
  type RunHandle,
  type ValueInput,
} from "@vizij/runtime";
import { useVizijRuntime, useVizijValues } from "@vizij/runtime-react";
import { useAppState } from "../state/AppStateContext";
import { IconButton } from "./IconButton";
import { RuntimeApiDisclosure } from "./RuntimeApiDisclosure";

/**
 * The face's programs (`describe(glb).programs`). A program runs beside the
 * face's graph as a `run_behavior` run of the device's interpreter: play
 * starts a run, pause halts it with its outputs holding their last values,
 * and stop halts it and returns those outputs to rest (`reset_keys` of the
 * keys `outputKeys(program.graph)` lists). Playing after a pause starts a
 * new run.
 */
export function ProgramsPanel() {
  const { runtime, description } = useVizijRuntime();
  const {
    state: {
      playbackSelection: { programId },
    },
    setSelectedProgram,
  } = useAppState();
  const programs = useMemo(() => description?.programs ?? [], [description]);
  const [runs, setRuns] = useState<Record<string, RunHandle>>({});
  const statuses = useVizijValues(
    Object.values(runs).map((handle) => handle.status),
  );
  const stateOf = (program: Program) => {
    const handle = runs[program.id];
    return handle ? (runStatus(statuses[handle.status]) ?? "starting") : null;
  };

  useEffect(() => {
    setRuns({});
  }, [runtime]);

  useEffect(() => {
    if (!programs.length) {
      setSelectedProgram(null);
      return;
    }
    if (!programId || !programs.some((program) => program.id === programId)) {
      setSelectedProgram(programs[0]!.id);
    }
  }, [programId, programs, setSelectedProgram]);

  const play = async (program: Program) => {
    if (!runtime || stateOf(program) === "running") return;
    const handle = (await runtime.invoke("run_behavior", {
      name: program.id,
      // `behaviorValue` returns the Arora value `run_behavior` takes, typed
      // as a plain object.
      behavior: (await behaviorValue(program.graph)) as ValueInput,
    })) as RunHandle;
    setRuns((current) => ({ ...current, [program.id]: handle }));
  };

  const halt = async (program: Program) => {
    const handle = runs[program.id];
    if (!runtime || !handle || stateOf(program) !== "running") return;
    await runtime.halt(handle.run);
  };

  const stop = async (program: Program) => {
    if (!runtime) return;
    await halt(program);
    await runtime.invoke("reset_keys", {
      keys: { strs: await outputKeys(program.graph) },
    });
  };

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
          `const program = description.programs.find((p) => p.id === ${JSON.stringify(selectedProgram.id)})!;`,
          'const run = await runtime.invoke("run_behavior", {',
          "  name: program.id,",
          "  behavior: await behaviorValue(program.graph),",
          "});",
          "await runtime.halt(run.run); // its outputs hold their last values",
          'await runtime.invoke("reset_keys", {',
          "  keys: { strs: await outputKeys(program.graph) },",
          "}); // back to rest",
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
                const label = program.label ?? program.id;
                const state = stateOf(program);
                return (
                  <article
                    key={program.id}
                    className={`program-card ${program.id === selectedProgram?.id ? "is-active" : ""}`}
                  >
                    <button
                      type="button"
                      className="program-card-select"
                      onClick={() => setSelectedProgram(program.id)}
                    >
                      <span>
                        <strong>{label}</strong>
                        <small>{program.id}</small>
                      </span>
                      <span className="soft-badge">
                        {state === "running" ? "running" : "halted"}
                      </span>
                    </button>
                    <div className="transport-actions">
                      <IconButton
                        icon="play"
                        label={`Play ${label}`}
                        disabled={!runtime}
                        onClick={() => void play(program)}
                      />
                      <IconButton
                        icon="pause"
                        label={`Pause ${label}`}
                        disabled={state !== "running"}
                        onClick={() => void halt(program)}
                      />
                      <IconButton
                        icon="stop"
                        label={`Stop ${label}`}
                        disabled={!runtime}
                        onClick={() => void stop(program)}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
            <RuntimeApiDisclosure
              title="Runtime program calls"
              description="A program as a run of the device's interpreter, started, halted and returned to rest."
              examples={runtimeExamples}
            />
          </>
        )}
      </div>
    </section>
  );
}
