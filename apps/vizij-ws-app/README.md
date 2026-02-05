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
git clone https://github.com/anthropics/vizij-web.git
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

Messages use **arora-types** format for type-safe value serialization. This format ensures compatibility with the Rust backend and provides explicit type information for each value.

### Test with wscat

```bash
npx wscat -c ws://localhost:9000
```

Then paste one of the JSON payloads below and press Enter.

### Test with Websocketking

Send JSON messages using e.g. https://websocketking.com/. The server binds to `127.0.0.1`, so it only accepts localhost connections.

Note: browser-based clients served over `https://` may fail to connect to `ws://` due to mixed-content rules.

---

### Arora-Types Value Format

Values are wrapped in type-annotated objects rather than sent as raw primitives:

| Type | Format | Example |
|------|--------|---------|
| Float (64-bit) | `{"f64": <number>}` | `{"f64": 0.5}` |
| Float (32-bit) | `{"f32": <number>}` | `{"f32": 0.5}` |
| Integer (32-bit) | `{"i32": <number>}` | `{"i32": 42}` |
| Boolean | `{"bool": <boolean>}` | `{"bool": true}` |
| String | `{"str": "<string>"}` | `{"str": "hello"}` |
| UUID | `{"uuid": "<uuid>"}` | `{"uuid": "550e8400-e29b-41d4-a716-446655440000"}` |
| Unit | `"unit"` | `"unit"` |
| Option (some) | `{"v?": <value>}` | `{"v?": {"f64": 1.0}}` |
| Option (none) | `{"v?": null}` | `{"v?": null}` |

For animation control, most values are `f64` (64-bit floats).

---

### Message Types

#### Update Values

Send new values to control avatar features:

```json
{
  "type": "update",
  "values": {
    "standard/vizij/left_eye/pos/x": {"f64": 0.5},
    "standard/vizij/left_eye/pos/y": {"f64": 0.3},
    "standard/vizij/right_eye/pos/x": {"f64": 0.5},
    "standard/vizij/right_eye/pos/y": {"f64": 0.3}
  }
}
```

**Response:**
```json
{"type": "ack", "success": true}
```

If a path is invalid:
```json
{"type": "ack", "success": false, "message": "Unknown input path: invalid/path"}
```

#### Reset

Reset all values to their defaults:

```json
{
  "type": "reset"
}
```

**Response:**
```json
{"type": "ack", "success": true}
```

#### List Nodes

Query available input nodes (optionally filtered by path prefix):

```json
{
  "type": "list_nodes",
  "path": "standard/vizij/left_eye"
}
```

**Response:**
```json
{
  "type": "nodes",
  "nodes": [
    {
      "path": "standard/vizij/left_eye/pos/x",
      "kind": "input",
      "value_type": "f64",
      "min": -1.0,
      "max": 1.0,
      "default_value": {"f64": 0.0}
    },
    {
      "path": "standard/vizij/left_eye/pos/y",
      "kind": "input",
      "value_type": "f64",
      "min": -1.0,
      "max": 1.0,
      "default_value": {"f64": 0.0}
    }
  ]
}
```

### Path Format

Paths follow the Vizij rig convention. The app automatically prefixes paths with `rig/{faceId}/`, so you only need to send the feature path.

**Common eye gaze paths:**

| Path                       | Description          | Range                  |
| -------------------------- | -------------------- | ---------------------- |
| `standard/vizij/left_eye/pos/x`  | Left eye horizontal  | -1 (left) to 1 (right) |
| `standard/vizij/left_eye/pos/y`  | Left eye vertical    | -1 (down) to 1 (up)    |
| `standard/vizij/right_eye/pos/x` | Right eye horizontal | -1 (left) to 1 (right) |
| `standard/vizij/right_eye/pos/y` | Right eye vertical   | -1 (down) to 1 (up)    |

Click the **Debug** button in the app to see all available paths for your loaded avatar.

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
  createUpdate,
  extractNumericValue,
  type AroraValue,
  type AroraUpdate,
} from '@vizij/arora-types';

// Connect to WebSocket
const ws = new WebSocket('ws://localhost:9000');

// Send update using helper functions
function sendEyeGaze(x: number, y: number) {
  const update = createUpdate({
    'standard/vizij/left_eye/pos/x': f64(x),
    'standard/vizij/left_eye/pos/y': f64(y),
    'standard/vizij/right_eye/pos/x': f64(x),
    'standard/vizij/right_eye/pos/y': f64(y),
  });

  ws.send(JSON.stringify({ type: 'update', ...update }));
}

// Or construct manually
ws.send(JSON.stringify({
  type: 'update',
  values: {
    'standard/vizij/left_eye/pos/x': { f64: 0.5 },
    'standard/vizij/left_eye/pos/y': { f64: 0.3 },
  }
}));

// Extract values from responses
function handleNodeInfo(node: { default_value?: AroraValue }) {
  if (node.default_value) {
    const value = extractNumericValue(node.default_value);
    console.log('Default:', value); // e.g., 0.0
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

**Message Helpers:**
- `createUpdate(values)` — Create an update payload
- `createSuccessAck()` — Create success acknowledgment
- `createErrorAck(message)` — Create error acknowledgment

---
## License

See the repository root for license information.
