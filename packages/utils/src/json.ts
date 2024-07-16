function replacer(key: string, value: any): any {
  if (value instanceof Map) {
    return {
      dataType: "Map",
      value: Array.from(value.entries()), // or with spread: value: [...value]
    };
  } else {
    return value;
  }
}

function reviver(key: string, value: any): any {
  if (typeof value === "object" && value !== null) {
    if (value.dataType === "Map") {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- safe because we know the type
      return new Map(value.value);
    }
  }
  return value;
}

export function stringifyMapped(value: any): string {
  return JSON.stringify(value, replacer, 2);
}

export function parseToMapped(json: string): any {
  return JSON.parse(json, reviver);
}
