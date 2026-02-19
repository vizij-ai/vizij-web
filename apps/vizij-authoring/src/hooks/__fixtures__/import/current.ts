import type { ImportOutcomeFixture } from "./types";

export const currentImportOutcomeFixtures: ImportOutcomeFixture[] = [
  {
    id: "current-pose-direct-apply",
    fixtureClass: "current",
    flow: "pose",
    description: "Current pose graph payload applies without remap",
    poseStatus: "success",
    expectedStatus: "success",
    expectedSuccess: true,
  },
  {
    id: "current-rig-clean",
    fixtureClass: "current",
    flow: "rig",
    description: "Current rig graph imports with no normalization or review",
    rigSignals: {
      discrepancyReviewed: false,
      normalizationCount: 0,
      animatableFallbackCount: 0,
      missingBlueprintPathCount: 0,
    },
    expectedStatus: "success",
    expectedSuccess: true,
  },
];
