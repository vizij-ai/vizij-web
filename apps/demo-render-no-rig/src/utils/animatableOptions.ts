import type {
  AnimationEditorState,
  AnimatableListGroup,
  OrchestratorAnimatableComponent,
  OrchestratorAnimatableOption,
  ValueKind,
} from "../types";
import { defaultValueForKind } from "./valueHelpers";

const COMPONENTS_BY_TYPE: Record<string, OrchestratorAnimatableComponent[]> = {
  vec2: [
    { key: "x", label: "X" },
    { key: "y", label: "Y" },
  ],
  vec3: [
    { key: "x", label: "X" },
    { key: "y", label: "Y" },
    { key: "z", label: "Z" },
  ],
  vec4: [
    { key: "x", label: "X" },
    { key: "y", label: "Y" },
    { key: "z", label: "Z" },
    { key: "w", label: "W" },
  ],
  quat: [
    { key: "x", label: "X" },
    { key: "y", label: "Y" },
    { key: "z", label: "Z" },
    { key: "w", label: "W" },
  ],
  color: [
    { key: "r", label: "R" },
    { key: "g", label: "G" },
    { key: "b", label: "B" },
    { key: "a", label: "A" },
  ],
};

export function buildAnimatableOptions(
  groups: AnimatableListGroup[],
): OrchestratorAnimatableOption[] {
  const options: OrchestratorAnimatableOption[] = [];

  const pushOption = (
    item: (typeof groups)[number]["items"][number],
    component?: OrchestratorAnimatableComponent,
    suffix?: string,
  ) => {
    const optionId = component ? `${item.id}::${component.key}` : item.id;
    const label = suffix ? `${item.label} • ${suffix}` : item.label;
    options.push({
      optionId,
      animId: item.id,
      name: item.name,
      group: item.group,
      label,
      type: item.type,
      defaultValue: item.defaultValue,
      component,
    });
  };

  groups.forEach((group) => {
    group.items.forEach((item) => {
      pushOption(item);
      const components = COMPONENTS_BY_TYPE[item.type?.toLowerCase?.() ?? ""];
      if (components) {
        components.forEach((component) =>
          pushOption(item, component, component.label),
        );
      }
    });
  });

  return options;
}

export function updateTracksForSelectedAnim(
  state: AnimationEditorState,
  options: OrchestratorAnimatableOption[],
): AnimationEditorState {
  const optionByAnimId = new Map(options.map((opt) => [opt.animId, opt]));
  const optionByOptionId = new Map(options.map((opt) => [opt.optionId, opt]));
  const next: AnimationEditorState = {
    ...state,
    tracks: state.tracks.map((track) => {
      const opt =
        optionByOptionId.get(track.optionId ?? "") ??
        optionByAnimId.get(track.animatableId);
      if (!opt) {
        return {
          ...track,
          componentKey: null,
        };
      }
      const normalizedType = normalizeValueKind(opt.type, track.valueKind);
      return {
        ...track,
        animatableId: opt.animId,
        optionId: opt.optionId,
        componentKey: opt.component?.key ?? null,
        valueKind: normalizedType,
        keyframes: track.keyframes.map((kf) => ({
          ...kf,
          value: ensureValueMatchesKind(normalizedType, kf.value),
        })),
      };
    }),
  };
  return next;
}

function normalizeValueKind(
  type: string | undefined,
  fallback: ValueKind,
): ValueKind {
  if (!type) return fallback;
  const t = type.toLowerCase();
  if (t.includes("vec2")) return "vec2";
  if (t.includes("vec3")) return "vec3";
  if (t.includes("vec4")) return "vec4";
  if (t.includes("quat")) return "quat";
  if (t.includes("color")) return "color";
  if (t.includes("float")) return "float";
  if (t.includes("bool")) return "bool";
  if (t.includes("transform")) return "transform";
  if (t.includes("vector")) return "vector";
  return fallback;
}

function ensureValueMatchesKind(kind: ValueKind, value: any): any {
  if (value == null) return defaultValueForKind(kind);
  switch (kind) {
    case "float":
      return Number(value ?? 0);
    case "bool":
      return Boolean(value);
    case "vec2":
      return {
        x: Number(value?.x ?? 0),
        y: Number(value?.y ?? 0),
      };
    case "vec3":
      return {
        x: Number(value?.x ?? 0),
        y: Number(value?.y ?? 0),
        z: Number(value?.z ?? 0),
      };
    case "vec4":
    case "quat":
      return {
        x: Number(value?.x ?? 0),
        y: Number(value?.y ?? 0),
        z: Number(value?.z ?? 0),
        w: Number(value?.w ?? 1),
      };
    case "color":
      return {
        r: Number(value?.r ?? 1),
        g: Number(value?.g ?? 1),
        b: Number(value?.b ?? 1),
        a: Number(value?.a ?? 1),
      };
    case "vector":
      return Array.isArray(value)
        ? value.map((entry) => Number(entry ?? 0))
        : [0];
    case "transform":
      return {
        position: {
          x: Number(
            value?.translation?.x ?? value?.position?.x ?? value?.pos?.x ?? 0,
          ),
          y: Number(
            value?.translation?.y ?? value?.position?.y ?? value?.pos?.y ?? 0,
          ),
          z: Number(
            value?.translation?.z ?? value?.position?.z ?? value?.pos?.z ?? 0,
          ),
        },
        rotation: {
          x: Number(value?.rotation?.x ?? value?.rot?.x ?? 0),
          y: Number(value?.rotation?.y ?? value?.rot?.y ?? 0),
          z: Number(value?.rotation?.z ?? value?.rot?.z ?? 0),
        },
        scale: {
          x: Number(value?.scale?.x ?? 1),
          y: Number(value?.scale?.y ?? 1),
          z: Number(value?.scale?.z ?? 1),
        },
      };
    case "custom":
    default:
      return value;
  }
}
