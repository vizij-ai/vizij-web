import { describe, expect, it } from "vitest";
import {
  mergeImportedAndLocalPipelineConfigByInputId,
  mergeImportedAndLocalPipelineLinksById,
} from "../useRigController";

describe("useRigController pipeline metadata merge helpers", () => {
  it("preserves imported custom parent formulas and stage controls when local edits are partial", () => {
    const imported = {
      child_input: {
        inputId: "child_input",
        parents: [
          {
            inputId: "parent_input",
            linkId: "link/parent_input->child_input",
            alias: "s1",
            expression: "s1 = sin(parent * scale) + offset",
          },
        ],
        parentBlend: {
          expression:
            "parentContribution = normalizedAdditive([s1], baseline=default)",
        },
        directInput: {
          enabled: true,
        },
        override: {
          enabledDefault: true,
          valueDefault: 0.42,
        },
        clamp: {
          enabled: true,
        },
      },
    };
    const local = {
      child_input: {
        inputId: "child_input",
        parents: [
          {
            inputId: "parent_input",
            linkId: "link/parent_input->child_input",
            alias: "s1",
          },
        ],
      },
    };

    const merged = mergeImportedAndLocalPipelineConfigByInputId(
      imported,
      local,
    );
    const childConfig = merged.child_input as
      | {
          parents?: Array<{ expression?: string }>;
          parentBlend?: { expression?: string };
          directInput?: { enabled?: boolean };
          override?: { enabledDefault?: boolean; valueDefault?: number };
          clamp?: { enabled?: boolean };
        }
      | undefined;
    expect(childConfig).toBeDefined();
    expect(childConfig?.parents?.[0]?.expression).toBe(
      "s1 = sin(parent * scale) + offset",
    );
    expect(childConfig?.parentBlend?.expression).toBe(
      "parentContribution = normalizedAdditive([s1], baseline=default)",
    );
    expect(childConfig?.directInput?.enabled).toBe(true);
    expect(childConfig?.override?.enabledDefault).toBe(true);
    expect(childConfig?.override?.valueDefault).toBe(0.42);
    expect(childConfig?.clamp?.enabled).toBe(true);
  });

  it("preserves imported link expressions when local links omit expression", () => {
    const imported = {
      "link/parent_input->child_input": {
        linkId: "link/parent_input->child_input",
        parentInputId: "parent_input",
        childInputId: "child_input",
        scale: 1,
        offset: 0,
        expression: "s1 = sin(parent * scale) + offset",
      },
    };
    const local = {
      "link/parent_input->child_input": {
        linkId: "link/parent_input->child_input",
        parentInputId: "parent_input",
        childInputId: "child_input",
        scale: 2,
      },
    };

    const merged = mergeImportedAndLocalPipelineLinksById(imported, local);
    const link = merged["link/parent_input->child_input"] as
      | { expression?: string; scale?: number }
      | undefined;
    expect(link).toBeDefined();
    expect(link?.scale).toBe(2);
    expect(link?.expression).toBe("s1 = sin(parent * scale) + offset");
  });

  it("applies local link expression when explicitly provided", () => {
    const imported = {
      "link/parent_input->child_input": {
        linkId: "link/parent_input->child_input",
        parentInputId: "parent_input",
        childInputId: "child_input",
        expression: "s1 = parent * scale + offset",
      },
    };
    const local = {
      "link/parent_input->child_input": {
        linkId: "link/parent_input->child_input",
        parentInputId: "parent_input",
        childInputId: "child_input",
        expression: "s1 = sin(parent * scale) + offset",
      },
    };

    const merged = mergeImportedAndLocalPipelineLinksById(imported, local);
    const link = merged["link/parent_input->child_input"] as
      | { expression?: string }
      | undefined;
    expect(link?.expression).toBe("s1 = sin(parent * scale) + offset");
  });

  it("lets explicit local direct-input enablement override imported disabled state", () => {
    const imported = {
      mouth_driver: {
        inputId: "mouth_driver",
        directInput: {
          enabled: false,
        },
      },
    };
    const local = {
      mouth_driver: {
        inputId: "mouth_driver",
        directInput: {
          enabled: true,
        },
      },
    };

    const merged = mergeImportedAndLocalPipelineConfigByInputId(
      imported,
      local,
    );
    const mouthConfig = merged.mouth_driver as
      | {
          directInput?: { enabled?: boolean };
        }
      | undefined;

    expect(mouthConfig?.directInput?.enabled).toBe(true);
  });
});
