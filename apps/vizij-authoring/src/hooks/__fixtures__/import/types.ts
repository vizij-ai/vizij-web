import type {
  ImportOutcomeStatus,
  RigImportRepairSignals,
} from "../../../types/importOutcome";

export const REQUIRED_IMPORT_FIXTURE_CLASSES = [
  "legacy",
  "current",
  "malformed",
] as const;

export type ImportFixtureClass =
  (typeof REQUIRED_IMPORT_FIXTURE_CLASSES)[number];

interface ImportOutcomeFixtureBase {
  id: string;
  fixtureClass: ImportFixtureClass;
  description: string;
  expectedStatus: ImportOutcomeStatus;
  expectedSuccess: boolean;
}

export interface RigImportOutcomeFixture extends ImportOutcomeFixtureBase {
  flow: "rig";
  rigSignals: RigImportRepairSignals;
  expectedStatus: "success" | "success_with_repair";
}

export interface PoseImportOutcomeFixture extends ImportOutcomeFixtureBase {
  flow: "pose";
  poseStatus: ImportOutcomeStatus;
  message?: string;
}

export type ImportOutcomeFixture =
  | RigImportOutcomeFixture
  | PoseImportOutcomeFixture;
