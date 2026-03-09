import { describe, expect, it } from "vitest";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import {
  classifyPoseParentBindingEmptyState,
  hasParentBindingInput,
  resolveRigDrivenSelection,
} from "./inspectorActions";

const OBJECTS: SceneObjectNode[] = [
  {
    id: "shape-1",
    name: "Shape 1",
    type: "shape",
    parentId: null,
    childIds: [],
    features: [
      {
        id: "shape-1:translation",
        key: "translation",
        label: "Translation",
        defaultLabel: "Translation",
        type: "vector3",
        animated: true,
        elementId: "shape-1",
        elementName: "Shape 1",
        elementType: "shape",
        components: [
          {
            id: "shape-1-translation-x",
            label: "X",
            componentKey: "x",
            targetId: "shape-1-translation:x",
          },
          {
            id: "shape-1-translation-y",
            label: "Y",
            componentKey: "y",
            targetId: "shape-1-translation:y",
          },
        ],
      },
    ],
  },
];

describe("resolveRigDrivenSelection", () => {
  it("flags self variable selections", () => {
    const result = resolveRigDrivenSelection(
      { type: "variable", id: "jaw_open" },
      "jaw_open",
      OBJECTS,
    );
    expect(result).toEqual({ kind: "self-variable" });
  });

  it("returns child input id for variable selections", () => {
    const result = resolveRigDrivenSelection(
      { type: "variable", id: "smile" },
      "jaw_open",
      OBJECTS,
    );
    expect(result).toEqual({ kind: "variable", childInputIds: ["smile"] });
  });

  it("returns concrete target ids for property selections", () => {
    const result = resolveRigDrivenSelection(
      {
        type: "property",
        objectId: "shape-1",
        featureId: "shape-1:translation",
        label: "Shape 1 · Translation",
      },
      "jaw_open",
      OBJECTS,
    );
    expect(result).toEqual({
      kind: "property",
      targetIds: ["shape-1-translation:x", "shape-1-translation:y"],
    });
  });

  it("returns empty-property when property selection has no targets", () => {
    const result = resolveRigDrivenSelection(
      {
        type: "property",
        objectId: "missing",
        featureId: "missing",
        label: "Missing",
      },
      "jaw_open",
      OBJECTS,
    );
    expect(result).toEqual({ kind: "empty-property" });
  });
});

describe("classifyPoseParentBindingEmptyState", () => {
  it("classifies root state when downstream links exist", () => {
    expect(classifyPoseParentBindingEmptyState(1, 0)).toBe("root");
    expect(classifyPoseParentBindingEmptyState(0, 2)).toBe("root");
  });

  it("classifies unlinked state when no downstream links exist", () => {
    expect(classifyPoseParentBindingEmptyState(0, 0)).toBe("unlinked");
  });
});

describe("hasParentBindingInput", () => {
  it("returns true when binding.inputId matches parent input", () => {
    expect(
      hasParentBindingInput({ inputId: "jaw_open", slots: [] }, "jaw_open"),
    ).toBe(true);
  });

  it("returns true when any binding slot matches parent input", () => {
    expect(
      hasParentBindingInput(
        {
          inputId: "fallback_input",
          slots: [{ inputId: "brow_raise" }, { inputId: "jaw_open" }],
        },
        "jaw_open",
      ),
    ).toBe(true);
  });

  it("matches legacy-format equivalents using normalized ids", () => {
    expect(
      hasParentBindingInput(
        {
          inputId: "/l_eye/translation/x",
        },
        "l_eye_translation_x",
      ),
    ).toBe(true);
    expect(
      hasParentBindingInput(
        {
          slots: [{ inputId: "/jaw/open" }],
        },
        "jaw_open",
      ),
    ).toBe(true);
  });

  it("returns false for null/empty bindings and non-matching parents", () => {
    expect(hasParentBindingInput(null, "jaw_open")).toBe(false);
    expect(hasParentBindingInput(undefined, "jaw_open")).toBe(false);
    expect(hasParentBindingInput({ inputId: "smile" }, "jaw_open")).toBe(false);
    expect(
      hasParentBindingInput(
        { slots: [{ inputId: "smile" }, { inputId: "brow_raise" }] },
        "jaw_open",
      ),
    ).toBe(false);
  });
});
