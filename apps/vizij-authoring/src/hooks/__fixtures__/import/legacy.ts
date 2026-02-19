import type { ImportOutcomeFixture } from "./types";

export const legacyImportOutcomeFixtures: ImportOutcomeFixture[] = [
  {
    id: "legacy-pose-remap-required",
    fixtureClass: "legacy",
    flow: "pose",
    description:
      "Legacy pose graph payload requires remap decisions before apply",
    poseStatus: "blocked_recoverable",
    message: "Pose graph import requires remap decisions.",
    expectedStatus: "blocked_recoverable",
    expectedSuccess: false,
  },
  {
    id: "legacy-rig-normalized",
    fixtureClass: "legacy",
    flow: "rig",
    description: "Legacy rig payload imports after deterministic normalization",
    rigSignals: {
      discrepancyReviewed: false,
      normalizationCount: 2,
      animatableFallbackCount: 0,
      missingBlueprintPathCount: 0,
    },
    expectedStatus: "success_with_repair",
    expectedSuccess: true,
  },
];
