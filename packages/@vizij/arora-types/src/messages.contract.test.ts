import { describe, expect, it } from "vitest";
import {
  createInvoke,
  createListKeys,
  createListMethods,
  createReadValues,
  createWriteValues,
  isError,
  isInvokeResp,
  isListKeysResp,
  isListMethodsResp,
  isReadValuesResp,
  isValuesChanged,
  isWriteValuesResp,
  type Incoming,
  type KeyInfo,
  type Outgoing,
} from "./messages";

// Pins the arora-websocket 1.0 wire format: JSON with a `type` discriminator.
describe("arora websocket 1.0 wire format contract", () => {
  it("client -> server messages use the 1.0 tags and payload fields", () => {
    expect(createWriteValues({ "face/mouth": { f64: 0.5 } })).toEqual({
      type: "write_values",
      values: { "face/mouth": { f64: 0.5 } },
    });

    expect(createReadValues(["face/mouth", "face/eyes"])).toEqual({
      type: "read_values",
      keys: ["face/mouth", "face/eyes"],
    });

    expect(createListKeys("face")).toEqual({
      type: "list_keys",
      path: "face",
    });

    expect(createListMethods()).toEqual({
      type: "list_methods",
      path: undefined,
    });

    expect(createInvoke("reset", {}, "req-1")).toEqual({
      type: "invoke",
      method: "reset",
      args: {},
      request_id: "req-1",
    });
  });

  it("read_values carries key paths under `keys`", () => {
    const msg = createReadValues(["a/b"]) as Extract<
      Incoming,
      { type: "read_values" }
    >;
    expect(msg.keys).toEqual(["a/b"]);
    expect("slots" in msg).toBe(false);
  });

  it("server -> client response tags match the 1.0 format", () => {
    const writeResp = { type: "write_values_resp", success: true } as const;
    expect(isWriteValuesResp(writeResp)).toBe(true);

    const readResp = { type: "read_values_resp", values: {} } as const;
    expect(isReadValuesResp(readResp)).toBe(true);

    const listKeysResp = {
      type: "list_keys_resp",
      keys: [] as KeyInfo[],
    } as const;
    expect(isListKeysResp(listKeysResp)).toBe(true);

    const listMethodsResp = {
      type: "list_methods_resp",
      methods: [],
    } as const;
    expect(isListMethodsResp(listMethodsResp)).toBe(true);

    const invokeResp = {
      type: "invoke_resp",
      success: true,
      request_id: "req-1",
    } as const;
    expect(isInvokeResp(invokeResp)).toBe(true);

    const errorResp = { type: "error", message: "Invalid JSON" } as const;
    expect(isError(errorResp)).toBe(true);
  });

  it("supports the unsolicited values_changed push", () => {
    const push: Outgoing = {
      type: "values_changed",
      values: { "face/mouth": { f64: 0.5 } },
    };
    expect(isValuesChanged(push)).toBe(true);
    expect(isReadValuesResp(push)).toBe(false);
  });

  it("KeyInfo describes keys by hierarchical path", () => {
    const key: KeyInfo = {
      path: "face/mouth/open",
      kind: "input",
      value_type: "f64",
      min: 0,
      max: 1,
      default_value: { f64: 0 },
      description: "Mouth openness",
    };
    const listResp: Outgoing = { type: "list_keys_resp", keys: [key] };
    expect(isListKeysResp(listResp) && listResp.keys[0].path).toBe(
      "face/mouth/open",
    );
  });
});
