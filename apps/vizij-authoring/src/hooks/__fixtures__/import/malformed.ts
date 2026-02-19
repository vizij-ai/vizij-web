import type { ImportOutcomeFixture } from "./types";

export const malformedImportOutcomeFixtures: ImportOutcomeFixture[] = [
  {
    id: "malformed-pose-conflict",
    fixtureClass: "malformed",
    flow: "pose",
    description: "Malformed pose mappings produce a recoverable conflict block",
    poseStatus: "blocked_recoverable",
    message: "Resolve remap conflicts before applying.",
    expectedStatus: "blocked_recoverable",
    expectedSuccess: false,
  },
  {
    id: "malformed-pose-parse-failure",
    fixtureClass: "malformed",
    flow: "pose",
    description: "Malformed payload parse/import errors are fatal blocks",
    poseStatus: "blocked_fatal",
    message: "Failed to import pose graph: Unexpected token",
    expectedStatus: "blocked_fatal",
    expectedSuccess: false,
  },
];
