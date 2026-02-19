import { describe, expect, it } from "vitest";
import {
  createPoseImportResult,
  isImportOutcomeSuccess,
  resolveRigImportSuccessStatus,
  type ImportOutcomeStatus,
} from "../../types/importOutcome";
import {
  importOutcomeFixtureMatrix,
  REQUIRED_IMPORT_FIXTURE_CLASSES,
  type ImportOutcomeFixture,
} from "../__fixtures__/import";

function resolveFixtureOutcomeStatus(
  fixture: ImportOutcomeFixture,
): ImportOutcomeStatus {
  if (fixture.flow === "rig") {
    return resolveRigImportSuccessStatus(fixture.rigSignals);
  }
  return createPoseImportResult(fixture.poseStatus, fixture.message).status;
}

describe("import outcome fixture matrix", () => {
  it("covers required fixture classes", () => {
    const seenClasses = new Set(
      importOutcomeFixtureMatrix.map((fixture) => fixture.fixtureClass),
    );
    expect(Array.from(seenClasses).sort()).toEqual(
      [...REQUIRED_IMPORT_FIXTURE_CLASSES].sort(),
    );
  });

  it("keeps fixture ids unique and deterministic", () => {
    const ids = importOutcomeFixtureMatrix.map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
  });

  it("maps each fixture to its expected outcome class", () => {
    importOutcomeFixtureMatrix.forEach((fixture) => {
      const resolvedStatus = resolveFixtureOutcomeStatus(fixture);
      expect(resolvedStatus, fixture.id).toBe(fixture.expectedStatus);
      expect(
        isImportOutcomeSuccess(resolvedStatus),
        `${fixture.id} success classification`,
      ).toBe(fixture.expectedSuccess);
    });
  });
});
