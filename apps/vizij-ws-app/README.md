# Vizij WS App

A standalone desktop application that renders Vizij avatars and accepts real-time control via WebSocket. Perfect for integrating facial animation into robotics, VTubing, games, or any application that needs programmatic avatar control.

## Features

- Load any Vizij-compatible GLB avatar file
- Real-time WebSocket server on configurable port (default `ws://localhost:9000`, localhost-only)
- Control facial features, eye gaze, expressions via simple JSON messages
- Cross-platform (Windows, macOS, Linux)
- Fullscreen and multi-monitor support
- Kiosk mode for installations

---

## Workflow

This app is designed to be **built once and deployed as a standalone executable**. The typical workflow is:

1. **Build** the application on your development machine
2. **Copy** the resulting executable to your target machine
3. **Run** with command line arguments to configure behavior

The executable is self-contained and requires no additional runtime dependencies.

---

## Command Line Options

```
vizij-ws [OPTIONS]
vizij-ws <COMMAND>
```

### Subcommands

| Command         | Description                               |
| --------------- | ----------------------------------------- |
| `list-displays` | List available displays/monitors and exit |

### Options

| Option              | Short | Description                         | Default                  |
| ------------------- | ----- | ----------------------------------- | ------------------------ |
| `--glb <PATH>`      | `-g`  | Path or URL to GLB/GLTF avatar file | None (shows file picker) |
| `--port <PORT>`     | `-p`  | WebSocket server port               | 9000                     |
| `--fullscreen`      | `-f`  | Launch in fullscreen mode           | false                    |
| `--display <INDEX>` | `-d`  | Monitor index (0 = primary)         | Primary monitor          |
| `--width <PIXELS>`  | `-W`  | Window width                        | 800                      |
| `--height <PIXELS>` | `-H`  | Window height                       | 600                      |
| `--no-decorations`  |       | Remove window title bar and borders | false                    |
| `--always-on-top`   |       | Keep window above other windows     | false                    |

---

## Build Prerequisites

### Node.js (v18 or later)

**Windows:**

```bash
winget install OpenJS.NodeJS.LTS
```

**macOS:**

```bash
brew install node
```

**Linux (Ubuntu/Debian):**

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### pnpm

```bash
npm install -g pnpm
```

### Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**Windows:** Also install [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++".

### Linux-only dependencies

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

---

## Development

For testing and development within the monorepo:

```bash
# Clone and install
git clone https://github.com/vizij-ai/vizij-web.git
cd vizij-web
pnpm install

# Run in dev mode
pnpm run dev:vizij-ws-app

# Pass CLI arguments
pnpm run dev:vizij-ws-app -- -- -- --glb /path/to/avatar.glb --fullscreen
```

---

## Deployment

### Building

```bash
cd apps/vizij-ws-app
pnpm install
pnpm tauri build
```

Output locations:

- **Windows:** `src-tauri/target/release/vizij-ws.exe`
- **macOS:** `src-tauri/target/release/bundle/macos/Vizij WS.app`
- **Linux:** `src-tauri/target/release/vizij-ws`

### Running

Copy the executable to your target machine and run. On Windows PowerShell, use `.\` prefix:

```bash
# Basic usage
.\vizij-ws.exe --glb C:\path\to\avatar.glb

# Fullscreen on second monitor
.\vizij-ws.exe --glb avatar.glb --fullscreen --display 1

# Kiosk mode
.\vizij-ws.exe --glb avatar.glb --fullscreen --no-decorations --always-on-top

# Custom WebSocket port
.\vizij-ws.exe --glb avatar.glb --port 8080

# List available displays
.\vizij-ws.exe list-displays
```

On Linux/macOS:

```bash
./vizij-ws --glb /path/to/avatar.glb
```

---

## WebSocket Protocol

Connect to `ws://localhost:9000` (or your configured port) and send JSON messages.
The server binds to `0.0.0.0` by default, so it accepts connections from other devices on your LAN/Wi-Fi.

Messages use **arora-types** format for type-safe value serialization. This format ensures compatibility with the Rust backend and provides explicit type information for each value.

### Test with wscat

```bash
npx wscat -c ws://localhost:9000
```

Then paste one of the JSON payloads below and press Enter.

Note: `wscat` sends one WebSocket message per line. The JSON examples below are formatted across multiple lines for readability, so you’ll need to paste them as a single line (no newlines) when sending from the terminal.

### Test with Websocketking

Send JSON messages using e.g. https://websocketking.com/.

- Local machine: `ws://localhost:9000`
- Another device on the same Wi-Fi: `ws://<HOST_LAN_IP>:9000` (example: `ws://192.168.1.42:9000`)

Note: browser-based clients served over `https://` may fail to connect to `ws://` due to mixed-content rules.
If you expose this on Wi-Fi/LAN, treat it as a control endpoint: use trusted networks and firewall rules.

---

### Arora-Types Value Format

Values are wrapped in type-annotated objects rather than sent as raw primitives:

| Type             | Format                | Example                                            |
| ---------------- | --------------------- | -------------------------------------------------- |
| Float (64-bit)   | `{"f64": <number>}`   | `{"f64": 0.5}`                                     |
| Float (32-bit)   | `{"f32": <number>}`   | `{"f32": 0.5}`                                     |
| Integer (32-bit) | `{"i32": <number>}`   | `{"i32": 42}`                                      |
| Boolean          | `{"bool": <boolean>}` | `{"bool": true}`                                   |
| String           | `{"str": "<string>"}` | `{"str": "hello"}`                                 |
| UUID             | `{"uuid": "<uuid>"}`  | `{"uuid": "550e8400-e29b-41d4-a716-446655440000"}` |
| Unit             | `"unit"`              | `"unit"`                                           |
| Option (some)    | `{"v?": <value>}`     | `{"v?": {"f64": 1.0}}`                             |
| Option (none)    | `{"v?": null}`        | `{"v?": null}`                                     |

For animation control, most values are `f64` (64-bit floats).

---

### Message Types

#### Set Slot Values

Send new values to control avatar features:

```json
{
  "type": "set_slot_values",
  "values": {
    "standard/vizij/left_eye/pos/x": { "f64": 0.5 },
    "standard/vizij/left_eye/pos/y": { "f64": 0.3 },
    "standard/vizij/right_eye/pos/x": { "f64": 0.5 },
    "standard/vizij/right_eye/pos/y": { "f64": 0.3 }
  }
}
```

**Response:**

```json
{ "type": "set_slot_values_resp", "success": true }
```

If a path is invalid:

```json
{
  "type": "set_slot_values_resp",
  "success": false,
  "message": "Unknown input path: invalid/path"
}
```

#### Invoke Reset Method

Reset all values to their defaults using method invocation:

```json
{
  "type": "invoke",
  "method": "reset",
  "request_id": "req-1"
}
```

**Response:**

```json
{
  "type": "invoke_resp",
  "success": true,
  "request_id": "req-1"
}
```

#### List Slots

Query available input slots (optionally filtered by path prefix):

```json
{
  "type": "list_slots",
  "path": "standard/vizij/left_eye"
}
```

**Response:**

```json
{
  "type": "list_slots_resp",
  "slots": [
    {
      "path": "standard/vizij/left_eye/pos/x",
      "kind": "input",
      "value_type": "f64",
      "min": -1.0,
      "max": 1.0,
      "default_value": { "f64": 0.0 }
    },
    {
      "path": "standard/vizij/left_eye/pos/y",
      "kind": "input",
      "value_type": "f64",
      "min": -1.0,
      "max": 1.0,
      "default_value": { "f64": 0.0 }
    }
  ]
}
```

### Path Format

Paths follow the Vizij rig convention. The app automatically prefixes paths with `rig/{faceId}/`, so you only need to send the feature path.

**Common eye gaze paths:**

| Path                             | Description          | Range                  |
| -------------------------------- | -------------------- | ---------------------- |
| `standard/vizij/left_eye/pos/x`  | Left eye horizontal  | -1 (left) to 1 (right) |
| `standard/vizij/left_eye/pos/y`  | Left eye vertical    | -1 (down) to 1 (up)    |
| `standard/vizij/right_eye/pos/x` | Right eye horizontal | -1 (left) to 1 (right) |
| `standard/vizij/right_eye/pos/y` | Right eye vertical   | -1 (down) to 1 (up)    |

Click the **Debug** button in the app to see all available paths for your loaded avatar.

---

## Architecture / Internal Data Flow

The app uses a layered architecture where the `arora-websocket` library handles protocol logic, and the Tauri app bridges WebSocket messages to the React frontend:

```
┌─────────────────┐     WebSocket      ┌───────────────────────┐
│  External       │ ──────────────────>│  arora-websocket      │
│  Client         │    JSON messages   │  (Rust library)       │
│  (Python, etc.) │                    │                       │
└─────────────────┘                    │  • Parses messages    │
                                       │  • Validates paths    │
                                       │  • Dispatches to      │
                                       │    handlers           │
                                       └───────────┬───────────┘
                                                   │
                                                   │ Callback
                                                   ▼
                                       ┌───────────────────────┐
                                       │  Tauri App            │
                                       │  (ws_server.rs)       │
                                       │                       │
                                       │  SetSlotValueHandler  │
                                       │  calls app.emit()     │
                                       └───────────┬───────────┘
                                                   │
                                                   │ Tauri Event
                                                   │ "update-values"
                                                   ▼
                                       ┌───────────────────────┐
                                       │  React Frontend       │
                                       │                       │
                                       │  listen("update-      │
                                       │    values", callback) │
                                       │                       │
                                       │  Applies values to    │
                                       │  Vizij runtime        │
                                       └───────────────────────┘
```

### Data Flow Steps

1. **External client** sends a WebSocket message (e.g., `{"type": "set_slot_values", "values": {...}}`)
2. **arora-websocket** parses the JSON, validates paths against registered input nodes, and calls the registered `SetSlotValueHandler`
3. **Tauri app** receives the callback and emits a Tauri event using `app.emit("update-values", &values)`
4. **React frontend** listens for the event via `listen("update-values", callback)` and applies the values to the Vizij runtime

This separation allows:

- **arora-websocket** to be reused in any Rust WebSocket server (not just Tauri)
- **Tauri app** to handle app-specific concerns (events, file loading, window management)
- **Frontend** to remain decoupled from WebSocket implementation details

### Connection Abstraction

The app uses the `AroraConnection` trait from the `arora-connection` crate to abstract the communication protocol. This allows different transport mechanisms to be used without changing the application logic.

```
┌─────────────────────────────────────────────────────────┐
│  arora-connection (trait)                               │
│  • AroraConnection trait                                │
│  • SlotInfo, MethodInfo, InvokeResult types             │
│  • Handler type definitions                             │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │ implements
          ┌───────────────┼───────────────┐
          │               │               │
┌─────────┴─────┐ ┌───────┴───────┐ ┌─────┴─────────┐
│ arora-        │ │ Future:       │ │ Future:       │
│ websocket     │ │ arora-ros2    │ │ arora-grpc    │
│ (WebSocket)   │ │ (ROS2 node)   │ │ (gRPC/HTTP2)  │
└───────────────┘ └───────────────┘ └───────────────┘
```

**To add a new protocol:**

1. Create a new crate (e.g., `arora-ipc`) that depends on `arora-connection`
2. Implement the `AroraConnection` trait for your transport
3. Optionally implement `AroraConnectionTauriExt` for Tauri event integration
4. Update the app to use your implementation instead of (or alongside) `WsServer`

The trait methods handle slot registration, value updates, method invocation, and lifecycle management—see `packages/arora-connection/src/traits.rs` for the full interface.

---

## TypeScript Client Integration

For TypeScript/JavaScript clients, use the `@vizij/arora-types` package for type-safe message construction:

```bash
npm install @vizij/arora-types
```

### Usage Example

```typescript
import {
  f64,
  createSetSlotValues,
  createInvoke,
  createListSlots,
  extractNumericValue,
  type Incoming,
  type Outgoing,
  type SlotInfo,
} from "@vizij/arora-types";

// Connect to WebSocket
const ws = new WebSocket("ws://localhost:9000");

// Send update using helper functions
function sendEyeGaze(x: number, y: number) {
  const msg: Incoming = createSetSlotValues({
    "standard/vizij/left_eye/pos/x": f64(x),
    "standard/vizij/left_eye/pos/y": f64(y),
    "standard/vizij/right_eye/pos/x": f64(x),
    "standard/vizij/right_eye/pos/y": f64(y),
  });
  ws.send(JSON.stringify(msg));
}

// Invoke a method (e.g., reset)
function reset() {
  const msg: Incoming = createInvoke("reset", {}, "req-1");
  ws.send(JSON.stringify(msg));
}

// Handle responses
ws.onmessage = (event) => {
  const response: Outgoing = JSON.parse(event.data);

  if (response.type === "list_slots_resp") {
    console.log("Available slots:", response.slots);
  } else if (response.type === "invoke_resp") {
    console.log("Invoke result:", response.success, response.message);
  }
};

// Extract values from slot info
function handleSlotInfo(slot: SlotInfo) {
  if (slot.default_value) {
    const value = extractNumericValue(slot.default_value);
    console.log("Default:", value); // e.g., 0.0
  }
}
```

### Available Helpers

**Value Constructors:**

- `f64(n)`, `f32(n)`, `i64(n)`, `i32(n)`, `u64(n)`, `u32(n)` — Numeric values
- `str(s)`, `bool(b)`, `uuid(id)` — Scalar values
- `unit()`, `some(value)`, `none()` — Special values

**Value Extractors:**

- `extractNumericValue(v)` — Get number from any numeric arora value
- `extractStringValue(v)` — Get string value
- `extractBooleanValue(v)` — Get boolean value

**Message Constructors:**

- `createSetSlotValues(values)` — Create a slot update message
- `createGetSlotValues(slots)` — Create a slot value query
- `createListSlots(path?)` — Create a list slots query
- `createListMethods(path?)` — Create a list methods query
- `createInvoke(method, args?, request_id?)` — Create a method invocation

**Response Type Guards:**

- `isSetSlotValuesResp(msg)` — Check if response is a slot update acknowledgment
- `isGetSlotValuesResp(msg)` — Check if response is a slot values response
- `isListSlotsResp(msg)` — Check if response is a slot list
- `isListMethodsResp(msg)` — Check if response is a method list
- `isInvokeResp(msg)` — Check if response is an invocation result
- `isError(msg)` — Check if response is an error

---

## License

See the repository root for license information.
