/**
 * Replacer function to handle Maps during JSON.stringify.
 *
 * @param key - The key being stringified.
 * @param value - The value associated with the key.
 * @returns The modified value if it's a Map, otherwise the original value.
 */
function replacer(key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return {
      dataType: "Map",
      value: Array.from(value.entries()), // or with spread: value: [...value]
    };
  }
  return value;
}

/**
 * Type guard to check if a value is a serialized Map object.
 *
 * @param value - The value to check.
 * @returns True if the value is a serialized Map object, false otherwise.
 */
function isSerializedMap(
  value: any,
): value is { dataType: string; value: [unknown, unknown][] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "dataType" in value &&
    value.dataType === "Map" &&
    Array.isArray(value.value)
  );
}

/**
 * Reviver function to handle Maps during JSON.parse.
 *
 * @param key - The key being parsed.
 * @param value - The value associated with the key.
 * @returns The modified value if it's a serialized Map, otherwise the original value.
 */
function reviver(key: string, value: unknown): unknown {
  if (isSerializedMap(value)) {
    return new Map(value.value);
  }
  return value;
}

/**
 * Converts a value to a JSON string, handling Maps appropriately.
 *
 * @param value - The value to stringify.
 * @returns The JSON string representation of the value.
 */
export function stringifyMapped(value: unknown): string {
  return JSON.stringify(value, replacer, 2);
}

/**
 * Parses a JSON string, reviving Maps appropriately.
 *
 * @param json - The JSON string to parse.
 * @returns The parsed value.
 */
export function parseToMapped(json: string): unknown {
  return JSON.parse(json, reviver);
}

/**
 * Parses the files in the given event and calls the provided function on each array item.
 *
 * @param event - The event containing the files to parse.
 * @param fn - The function to call on each array item.
 */
export function parseJSONFileEvent(
  event: React.ChangeEvent<HTMLInputElement>,
  fn: (item: unknown) => void,
): void {
  const files = event.target.files;
  if (files && files.length > 0) {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const json = e.target.result as string;
        const data = parseToMapped(json);
        if (Array.isArray(data)) {
          data.forEach((d) => {
            fn(d);
          });
        } else {
          fn(data);
        }
      }
    };
    reader.readAsText(files[0]);
  }
}
