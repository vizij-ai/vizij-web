import { describe, expect, it } from "vitest";
import {
  createGetSlotValues,
  createListNodes,
  createListSlots,
  createSetSlotValues,
  createUpdate,
  isGetSlotValuesResp,
  isListNodesResp,
  isListSlotsResp,
  isSetSlotValuesResp,
  isUpdateResp,
  type SlotInfo,
} from "./messages";

describe("arora websocket protocol contract", () => {
  it("uses set_slot_values for value updates", () => {
    const msg = createUpdate({});
    expect(msg.type).toBe("set_slot_values");
  });

  it("uses list_slots for slot discovery", () => {
    const msg = createListNodes();
    expect(msg.type).toBe("list_slots");
  });

  it("new canonical helpers produce canonical message names", () => {
    expect(createSetSlotValues({}).type).toBe("set_slot_values");
    expect(createGetSlotValues(["a/b"]).type).toBe("get_slot_values");
    expect(createListSlots("a").type).toBe("list_slots");
  });

  it("canonical and compatibility type guards match canonical responses", () => {
    const setResp = { type: "set_slot_values_resp", success: true } as const;
    expect(isSetSlotValuesResp(setResp)).toBe(true);
    expect(isUpdateResp(setResp)).toBe(true);

    const getResp = { type: "get_slot_values_resp", values: {} } as const;
    expect(isGetSlotValuesResp(getResp)).toBe(true);

    const listResp = {
      type: "list_slots_resp",
      slots: [] as SlotInfo[],
    } as const;
    expect(isListSlotsResp(listResp)).toBe(true);
    expect(isListNodesResp(listResp)).toBe(true);
  });
});
