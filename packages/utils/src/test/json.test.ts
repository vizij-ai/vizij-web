import { describe, it, expect } from "vitest";
import { stringifyMapped, parseToMapped } from "../json";

describe("JSON Map handling", () => {
  it("should correctly stringify a Map", () => {
    const map = new Map([
      ["key1", "value1"],
      ["key2", "value2"],
    ]);
    const json = stringifyMapped(map);
    const expected = JSON.stringify(
      {
        dataType: "Map",
        value: [
          ["key1", "value1"],
          ["key2", "value2"],
        ],
      },
      null,
      2,
    );
    expect(json).toBe(expected);
  });

  it("should correctly parse a stringified Map", () => {
    const json = JSON.stringify({
      dataType: "Map",
      value: [
        ["key1", "value1"],
        ["key2", "value2"],
      ],
    });
    const result = parseToMapped(json);
    expect(result).toBeInstanceOf(Map);
    expect((result as Map<string, string>).get("key1")).toBe("value1");
  });

  it("should handle nested Maps", () => {
    const nested = new Map([["outer", new Map([["inner", "value"]])]]);
    const json = stringifyMapped(nested);
    const result = parseToMapped(json);
    expect(result).toBeInstanceOf(Map);
    expect((result as Map<string, Map<string, string>>).get("outer")).toBeInstanceOf(Map);
    expect((result as Map<string, Map<string, string>>).get("outer")?.get("inner")).toBe("value");
  });

  it("should handle regular objects alongside Maps", () => {
    const data = {
      map: new Map([["key", "value"]]),
      regular: "object",
    };
    const json = stringifyMapped(data);
    const result = parseToMapped(json);
    expect((result as any).regular).toBe("object");
    expect((result as any).map).toBeInstanceOf(Map);
  });
});
