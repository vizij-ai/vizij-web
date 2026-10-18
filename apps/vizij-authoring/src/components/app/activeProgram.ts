import {
  BEHAVIOR_RUNS,
  behaviorValue,
  runStatus,
  type Program,
  type Runtime,
  type ValueInput,
} from "@vizij/runtime";

const textOf = (value: unknown): string | null =>
  value && typeof value === "object" && "str" in value
    ? String((value as { str: unknown }).str)
    : null;

/**
 * Halt every run of program `programId` the device is running: its runs
 * are listed under `BEHAVIOR_RUNS`, each by the name it runs under. A
 * halted run's outputs keep their last values.
 */
export async function haltProgramRuns(
  runtime: Runtime,
  programId: string,
): Promise<void> {
  const nameKeys = (await runtime.listKeys(BEHAVIOR_RUNS))
    .map((key) => key.path)
    .filter((path) => path.startsWith(BEHAVIOR_RUNS) && path.endsWith("/name"));
  const statusKeys = nameKeys.map((path) => path.replace(/\/name$/, "/status"));
  const values = runtime.readValues([...nameKeys, ...statusKeys]);
  const runs = nameKeys
    .map((path, index) => ({
      run: path.slice(BEHAVIOR_RUNS.length, -"/name".length),
      name: textOf(values[path]),
      status: runStatus(values[statusKeys[index]!]),
    }))
    .filter(({ name, status }) => name === programId && status === "running");
  await Promise.all(runs.map(({ run }) => runtime.halt(run)));
}

/** Run `program` beside the device's graph, named after it, as the face
 * runs its active program from load. */
export async function runProgram(
  runtime: Runtime,
  program: Program,
): Promise<void> {
  await runtime.invoke("run_behavior", {
    name: program.id,
    // `behaviorValue` returns the Arora value `run_behavior` takes, typed
    // `object`; `ValueInput` admits it.
    behavior: (await behaviorValue(program.graph)) as ValueInput,
  });
}
