#!/usr/bin/env node
import WebSocket from "ws";

const DEFAULT_URL = "ws://127.0.0.1:9000";
const DEFAULT_TIMEOUT_MS = 6000;
const DOUBLE_PULSE_DELAY_MS = 1000;
const SLOT_VALUE_TIMEOUT_MS = 4000;
const SLOT_VALUE_POLL_MS = 150;

function printUsage() {
  console.log(`Usage:
  node scripts/smoke-vizij-ws-app.mjs [options]

Options:
  --url <url>             WebSocket URL to connect to (default: ${DEFAULT_URL})
  --timeout <ms>          Per-request timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})
  --slot-value <number>    Value used for set_slot_values smoke input (default: 0.1)
  --skip-concurrency       Skip concurrent get_slot_values check
  --help                  Show this help message
`);
}

function parseArgs(argv) {
  const options = {
    url: DEFAULT_URL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    slotValue: 0.1,
    skipConcurrency: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      continue;
    }
    switch (arg) {
      case "--url":
        options.url = argv[i + 1];
        i += 1;
        break;
      case "--timeout":
        options.timeoutMs =
          Number.parseInt(argv[i + 1], 10) || DEFAULT_TIMEOUT_MS;
        i += 1;
        break;
      case "--slot-value":
        options.slotValue = Number.parseFloat(argv[i + 1]);
        i += 1;
        break;
      case "--skip-concurrency":
        options.skipConcurrency = true;
        break;
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

class WsClient {
  constructor(url, timeoutMs) {
    this.url = url;
    this.timeoutMs = timeoutMs;
    this.ws = null;
    this.inbox = [];
    this.waiters = [];
    this.closed = false;
  }

  async connect() {
    this.ws = new WebSocket(this.url);

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out connecting to ${this.url}`));
      }, this.timeoutMs);

      this.ws.on("open", () => {
        clearTimeout(timeout);
        resolve();
      });

      this.ws.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    this.ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(
          typeof data === "string" ? data : data.toString("utf8"),
        );
      } catch (err) {
        for (const waiter of this.waiters) {
          if (!waiter.settled) {
            waiter.settled = true;
            clearTimeout(waiter.timeout);
            waiter.reject(new Error(`Failed to parse message: ${err.message}`));
          }
        }
        this.waiters = this.waiters.filter((w) => !w.settled);
        return;
      }

      for (let i = 0; i < this.waiters.length; i += 1) {
        const waiter = this.waiters[i];
        if (!waiter.settled && waiter.predicate(msg)) {
          waiter.settled = true;
          clearTimeout(waiter.timeout);
          this.waiters.splice(i, 1);
          waiter.resolve(msg);
          return;
        }
      }

      this.inbox.push(msg);
    });
  }

  async sendAndWait(payload, predicate, description) {
    this.ws.send(JSON.stringify(payload));
    return this.waitFor(predicate, description);
  }

  async waitFor(predicate, description) {
    const matchedIndex = this.inbox.findIndex(predicate);
    if (matchedIndex !== -1) {
      const msg = this.inbox.splice(matchedIndex, 1)[0];
      return msg;
    }

    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        settled: false,
        timeout: undefined,
        resolve: (msg) => {
          clearTimeout(waiter.timeout);
          resolve(msg);
        },
        reject: (err) => {
          clearTimeout(waiter.timeout);
          reject(err);
        },
      };

      waiter.timeout = setTimeout(() => {
        waiter.settled = true;
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(
          new Error(
            `Timed out waiting for response to ${description} after ${this.timeoutMs}ms`,
          ),
        );
      }, this.timeoutMs);

      this.waiters.push(waiter);
    });
  }

  close() {
    if (!this.ws || this.closed) {
      return Promise.resolve();
    }
    this.closed = true;
    this.ws.close();
    return new Promise((resolve) => {
      this.ws.on("close", () => resolve());
      this.ws.on("error", () => resolve());
    });
  }
}

function pickFirstSlot(slotsResp) {
  if (!Array.isArray(slotsResp?.slots) || slotsResp.slots.length === 0) {
    throw new Error(
      "No slots available from list_slots response. Load an avatar with input slots first.",
    );
  }

  const slot = slotsResp.slots[0];
  if (!slot?.path) {
    throw new Error("list_slots response did not include a usable slot path.");
  }
  return slot.path;
}

function hasSlotValue(valueObj) {
  return valueObj && (valueObj.f64 !== undefined || valueObj.f32 !== undefined);
}

function aroraValueToNumber(valueObj) {
  if (!valueObj) {
    return undefined;
  }
  if (typeof valueObj.f64 === "number") {
    return valueObj.f64;
  }
  if (typeof valueObj.f32 === "number") {
    return valueObj.f32;
  }
  return undefined;
}

function areNumbersEqual(expected, observed) {
  const tolerance = 1e-9;
  return Math.abs(expected - observed) <= tolerance;
}

async function sendSetSlotValue(client, slotPath, value) {
  const resp = await client.sendAndWait(
    { type: "set_slot_values", values: { [slotPath]: { f64: value } } },
    (msg) => msg.type === "set_slot_values_resp",
    "set_slot_values_resp",
  );
  assert(
    resp.success === true,
    `set_slot_values did not succeed for value ${value}`,
  );
  return resp;
}

async function waitForSlotValue(client, slotPath, expectedValue, label) {
  const timeoutDeadline = Date.now() + SLOT_VALUE_TIMEOUT_MS;
  let lastObserved;

  while (Date.now() <= timeoutDeadline) {
    const resp = await client.sendAndWait(
      { type: "get_slot_values", slots: [slotPath] },
      (msg) => msg.type === "get_slot_values_resp",
      "get_slot_values_resp",
    );

    lastObserved = aroraValueToNumber(resp.values?.[slotPath]);
    if (
      hasSlotValue(resp.values?.[slotPath]) &&
      areNumbersEqual(expectedValue, lastObserved)
    ) {
      return resp;
    }
    await sleep(SLOT_VALUE_POLL_MS);
  }

  assert(
    hasSlotValue(lastObserved && { f64: lastObserved }),
    `${label}: get_slot_values did not return a value for slot ${slotPath}`,
  );

  throw new Error(
    `${label}: value for ${slotPath} did not match expected ${expectedValue} after ${SLOT_VALUE_TIMEOUT_MS}ms, last seen ${lastObserved}`,
  );
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const client = new WsClient(options.url, options.timeoutMs);
  let secondaryClient = null;

  try {
    await client.connect();
    console.log(`[smoke] connected to ${options.url}`);

    const methodsResp = await client.sendAndWait(
      { type: "list_methods" },
      (msg) => msg.type === "list_methods_resp",
      "list_methods_resp",
    );
    assert(
      Array.isArray(methodsResp.methods),
      "list_methods response did not include methods array",
    );
    const hasReset = methodsResp.methods.some(
      (method) => method.path === "reset",
    );
    assert(hasReset, "reset method missing from list_methods response");
    console.log("[smoke] list_methods reset exists");

    const slotsResp = await client.sendAndWait(
      { type: "list_slots" },
      (msg) => msg.type === "list_slots_resp",
      "list_slots_resp",
    );
    const slotPath = pickFirstSlot(slotsResp);
    console.log(`[smoke] selected slot: ${slotPath}`);

    const baseSlotValue = options.slotValue;
    const doubledSlotValue = options.slotValue * 2;

    await sendSetSlotValue(client, slotPath, baseSlotValue);
    await waitForSlotValue(
      client,
      slotPath,
      baseSlotValue,
      "initial set_slot_values",
    );
    console.log("[smoke] set_slot_values valid path succeeded");

    await sendSetSlotValue(client, slotPath, doubledSlotValue);
    await waitForSlotValue(
      client,
      slotPath,
      doubledSlotValue,
      "double set_slot_values",
    );
    console.log("[smoke] set_slot_values doubled value succeeded");
    await sleep(DOUBLE_PULSE_DELAY_MS);

    await sendSetSlotValue(client, slotPath, baseSlotValue);
    await waitForSlotValue(
      client,
      slotPath,
      baseSlotValue,
      "restore set_slot_values",
    );
    console.log("[smoke] set_slot_values restored original value");

    const badSetResp = await client.sendAndWait(
      {
        type: "set_slot_values",
        values: { "__invalid__/smoke/path": { f64: 0.5 } },
      },
      (msg) => msg.type === "set_slot_values_resp",
      "set_slot_values_resp",
    );
    assert(
      badSetResp.success === false,
      "set_slot_values did not reject invalid path as expected",
    );
    console.log("[smoke] set_slot_values invalid path rejected");

    const getResp = await client.sendAndWait(
      {
        type: "get_slot_values",
        slots: [slotPath, "__invalid__/smoke/path"],
      },
      (msg) => msg.type === "get_slot_values_resp",
      "get_slot_values_resp",
    );
    assert(
      hasSlotValue(getResp.values?.[slotPath]),
      `get_slot_values did not return value for slot ${slotPath}`,
    );
    console.log("[smoke] get_slot_values returned valid value");

    const requestId = "reset-smoke-1";
    const invokeResp = await client.sendAndWait(
      {
        type: "invoke",
        method: "reset",
        request_id: requestId,
      },
      (msg) => msg.type === "invoke_resp" && msg.request_id === requestId,
      "invoke_resp",
    );
    assert(
      invokeResp.success === true,
      "invoke reset returned unsuccessful response",
    );
    console.log("[smoke] invoke reset succeeded");

    if (!options.skipConcurrency) {
      secondaryClient = new WsClient(options.url, options.timeoutMs);
      await secondaryClient.connect();

      const [resp1, resp2] = await Promise.all([
        client.sendAndWait(
          { type: "get_slot_values", slots: [slotPath] },
          (msg) => msg.type === "get_slot_values_resp",
          "get_slot_values_resp",
        ),
        secondaryClient.sendAndWait(
          { type: "get_slot_values", slots: [slotPath] },
          (msg) => msg.type === "get_slot_values_resp",
          "get_slot_values_resp",
        ),
      ]);

      assert(
        hasSlotValue(resp1.values?.[slotPath]),
        "Concurrent get_slot_values request 1 did not return expected slot value",
      );
      assert(
        hasSlotValue(resp2.values?.[slotPath]),
        "Concurrent get_slot_values request 2 did not return expected slot value",
      );
      console.log(
        "[smoke] concurrent get_slot_values requests both returned expected values",
      );
    }

    console.log("[smoke] PASSED");
  } catch (err) {
    console.error(`[smoke] FAILED: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.close();
    if (secondaryClient) {
      await secondaryClient.close();
    }
    if (process.exitCode === 1) {
      console.log(
        "[smoke] Done with failures. Start app and check logs for details.",
      );
    }
  }
}

run();
