import type {
  GraphDiffEntry,
  GraphDiffKind,
  GraphDiffResult,
  GraphDiffCategory,
} from "../types/discrepancy";

const DEFAULT_DIFF_LIMIT = 200;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isPrimitive(
  value: unknown,
): value is string | number | boolean | null | undefined {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, nested) => {
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
      return nested;
    }
    return Object.fromEntries(
      Object.entries(nested as Record<string, unknown>).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    );
  });
}

export function canonicalizeGraphComparable(value: unknown): unknown {
  if (isPrimitive(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    const canonicalItems = value.map((entry) =>
      canonicalizeGraphComparable(entry),
    );
    const sorted = [...canonicalItems].sort((a, b) =>
      stableStringify(a).localeCompare(stableStringify(b)),
    );
    return sorted;
  }

  if (isPlainObject(value)) {
    const next: Record<string, unknown> = {};
    Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .forEach((key) => {
        next[key] = canonicalizeGraphComparable(value[key]);
      });
    return next;
  }

  return value;
}

function isIdentifiedList(value: unknown): value is Array<{
  id: string;
  [key: string]: unknown;
}> {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        typeof (entry as { id?: unknown }).id === "string",
    )
  );
}

function categorizePath(path: string): GraphDiffCategory {
  if (/nodes\[\d+\]\.(id|name)/i.test(path)) {
    return "identifiers";
  }
  if (/inputs\[/i.test(path) || /standardInputs/i.test(path)) {
    return "inputs";
  }
  if (/bindings/i.test(path) || /slots/i.test(path)) {
    return "bindings";
  }
  if (/expression/i.test(path)) {
    return "expressions";
  }
  if (/remap|range|min|max|defaultValue/i.test(path)) {
    return "values";
  }
  if (/metadata|vizij|labels?/i.test(path)) {
    return "metadata";
  }
  if (/graph|spec|nodes|edges/i.test(path)) {
    return "structure";
  }
  return "other";
}

function createEntry(
  kind: GraphDiffKind,
  path: string,
  importedValue: unknown,
  rebuiltValue: unknown,
  id: string,
): GraphDiffEntry {
  return {
    id,
    kind,
    path,
    category: categorizePath(path),
    importedValue,
    rebuiltValue,
  };
}

interface DiffOptions {
  limit?: number;
}

export function diffGraphSpecs(
  importedSpec: unknown,
  rebuiltSpec: unknown,
  options?: DiffOptions,
): GraphDiffResult {
  const limit = Math.max(options?.limit ?? DEFAULT_DIFF_LIMIT, 1);
  const entries: GraphDiffEntry[] = [];
  let limitReached = false;
  let counter = 0;

  const pushEntry = (
    kind: GraphDiffKind,
    path: string,
    importedValue: unknown,
    rebuiltValue: unknown,
  ): boolean => {
    if (entries.length >= limit) {
      limitReached = true;
      return false;
    }
    counter += 1;
    entries.push(
      createEntry(
        kind,
        path,
        importedValue,
        rebuiltValue,
        `${kind}:${counter}:${path}`,
      ),
    );
    return entries.length < limit;
  };

  const walk = (
    importedValue: unknown,
    rebuiltValue: unknown,
    path: string,
  ): boolean => {
    if (entries.length >= limit) {
      limitReached = true;
      return false;
    }

    if (Array.isArray(importedValue) && Array.isArray(rebuiltValue)) {
      if (isIdentifiedList(importedValue) && isIdentifiedList(rebuiltValue)) {
        const importedMap = new Map(
          importedValue.map((entry) => [entry.id, entry]),
        );
        const rebuiltMap = new Map(
          rebuiltValue.map((entry) => [entry.id, entry]),
        );
        const ids = new Set<string>([
          ...importedMap.keys(),
          ...rebuiltMap.keys(),
        ]);
        for (const id of ids) {
          const expectedEntry = importedMap.get(id);
          const actualEntry = rebuiltMap.get(id);
          const nextPath = `${path}[${id}]`;
          if (!expectedEntry) {
            if (!pushEntry("unexpected", nextPath, undefined, actualEntry)) {
              return false;
            }
            continue;
          }
          if (!actualEntry) {
            if (!pushEntry("missing", nextPath, expectedEntry, undefined)) {
              return false;
            }
            continue;
          }
          if (!walk(expectedEntry, actualEntry, nextPath)) {
            return false;
          }
        }
        return true;
      }
      const maxLength = Math.max(importedValue.length, rebuiltValue.length);
      for (let index = 0; index < maxLength; index += 1) {
        const nextPath = `${path}[${index}]`;
        const expected = importedValue[index];
        const actual = rebuiltValue[index];
        if (index >= importedValue.length) {
          if (!pushEntry("unexpected", nextPath, undefined, actual)) {
            return false;
          }
          continue;
        }
        if (index >= rebuiltValue.length) {
          if (!pushEntry("missing", nextPath, expected, undefined)) {
            return false;
          }
          continue;
        }
        if (
          Array.isArray(expected) ||
          Array.isArray(actual) ||
          isPlainObject(expected) ||
          isPlainObject(actual)
        ) {
          if (!walk(expected, actual, nextPath)) {
            return false;
          }
        } else if (!Object.is(expected, actual)) {
          if (!pushEntry("mismatch", nextPath, expected, actual)) {
            return false;
          }
        }
      }
      return true;
    }

    const importedIsObject = isPlainObject(importedValue);
    const rebuiltIsObject = isPlainObject(rebuiltValue);
    if (importedIsObject && rebuiltIsObject) {
      const importedKeys = new Set(Object.keys(importedValue));
      const rebuiltKeys = new Set(Object.keys(rebuiltValue));
      for (const key of importedKeys) {
        if (!rebuiltKeys.has(key)) {
          const nextPath = `${path}.${key}`;
          if (
            !pushEntry(
              "missing",
              nextPath,
              (importedValue as Record<string, unknown>)[key],
              undefined,
            )
          ) {
            return false;
          }
        }
      }
      for (const key of rebuiltKeys) {
        if (!importedKeys.has(key)) {
          const nextPath = `${path}.${key}`;
          if (
            !pushEntry(
              "unexpected",
              nextPath,
              undefined,
              (rebuiltValue as Record<string, unknown>)[key],
            )
          ) {
            return false;
          }
        }
      }
      for (const key of importedKeys) {
        if (!rebuiltKeys.has(key)) {
          continue;
        }
        const nextPath = `${path}.${key}`;
        const expected = (importedValue as Record<string, unknown>)[key];
        const actual = (rebuiltValue as Record<string, unknown>)[key];
        const expectedIsComposite =
          Array.isArray(expected) || isPlainObject(expected);
        const actualIsComposite =
          Array.isArray(actual) || isPlainObject(actual);
        if (expectedIsComposite || actualIsComposite) {
          if (!walk(expected, actual, nextPath)) {
            return false;
          }
        } else if (!Object.is(expected, actual)) {
          if (!pushEntry("mismatch", nextPath, expected, actual)) {
            return false;
          }
        }
      }
      return true;
    }

    if (importedValue === undefined && rebuiltValue !== undefined) {
      return pushEntry("unexpected", path, undefined, rebuiltValue);
    }
    if (importedValue !== undefined && rebuiltValue === undefined) {
      return pushEntry("missing", path, importedValue, undefined);
    }
    if (!Object.is(importedValue, rebuiltValue)) {
      return pushEntry("mismatch", path, importedValue, rebuiltValue);
    }
    return true;
  };

  walk(importedSpec, rebuiltSpec, "spec");

  return {
    entries,
    limitReached,
  };
}
