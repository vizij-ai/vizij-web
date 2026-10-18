import type { AnimatableValue, RawValue } from "@vizij/utils";

/** The components of a compound animatable, in the order its struct-form
 * value lists its fields. */
const COMPONENTS: Partial<Record<AnimatableValue["type"], readonly string[]>> =
  {
    vector2: ["x", "y"],
    vector3: ["x", "y", "z"],
    euler: ["x", "y", "z"],
    rgb: ["r", "g", "b"],
    hsl: ["h", "s", "l"],
  };

/** The other name a component goes by: a colour's channels are also read as
 * a vector's axes, and the inspector names them either way. */
const ALIASES: Record<string, string> = {
  x: "r",
  y: "g",
  z: "b",
  r: "x",
  g: "y",
  b: "z",
};

interface StructField {
  id?: string;
  value?: unknown;
}

function structFields(value: unknown): StructField[] | null {
  const fields = (value as { struct?: { fields?: unknown } } | null)?.struct
    ?.fields;
  return Array.isArray(fields) ? (fields as StructField[]) : null;
}

/** `number` in the form `previous` holds a number: as is, or under the same
 * scalar key (`{ f32: n }`). */
function scalarLike(previous: unknown, number: number): unknown {
  if (previous && typeof previous === "object" && !Array.isArray(previous)) {
    const keys = Object.keys(previous);
    if (
      keys.length === 1 &&
      typeof (previous as Record<string, unknown>)[keys[0]!] === "number"
    ) {
      return { [keys[0]!]: number };
    }
  }
  return number;
}

/**
 * `value` with its component `component` set to `number`, in the form
 * `value` has.
 *
 * A struct-form value (`{ struct: { fields } }`, as a default read from a
 * GLB holds it) gets the component's field set, by its position among the
 * components of `type`. A plain value gets the component's key. A value with
 * no component of that name, or no value, becomes a plain one holding it.
 */
export function withComponent(
  value: unknown,
  type: AnimatableValue["type"] | undefined,
  component: string,
  number: number,
): RawValue {
  const fields = structFields(value);
  const names = type ? COMPONENTS[type] : undefined;
  if (fields && names) {
    let index = names.indexOf(component);
    if (index < 0 && ALIASES[component]) {
      index = names.indexOf(ALIASES[component]!);
    }
    if (index >= 0 && index < fields.length) {
      const struct = (value as { struct: Record<string, unknown> }).struct;
      return {
        ...(value as object),
        struct: {
          ...struct,
          fields: fields.map((field, at) =>
            at === index
              ? { ...field, value: scalarLike(field.value, number) }
              : field,
          ),
        },
      } as unknown as RawValue;
    }
  }
  const plain =
    value && typeof value === "object" && !fields
      ? (value as Record<string, unknown>)
      : {};
  return { ...plain, [component]: number } as unknown as RawValue;
}
