import { describe, expect, it } from "vitest";
import type { VizijBundleExtension } from "@vizij/render";
import { auditBundleGraphs } from "../utils/bundleAudit";

describe("auditBundleGraphs", () => {
  it("reports missing IR graphs without compiling", async () => {
    const bundle: VizijBundleExtension = {
      version: 1,
      graphs: [
        {
          id: "rig",
          kind: "rig",
          label: "Rig",
          spec: {
            metadata: {
              vizij: {
                faceId: "face",
              },
            },
          },
          ir: null,
        },
      ],
    };

    await expect(auditBundleGraphs(bundle)).resolves.toEqual([
      {
        id: "rig",
        label: "Rig",
        kind: "rig",
        faceId: "face",
        status: "missing-ir",
        diff: undefined,
        diffCount: 0,
        diffLimitReached: false,
        issues: [],
        outputs: [],
      },
    ]);
  });
});
