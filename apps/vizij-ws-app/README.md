# Vizij WS App

A standalone Tauri application that displays GLTF/GLB 3D models and accepts WebSocket commands for remote control.

## Prerequisites

- Node.js 18+
- Rust (latest stable)
- Tauri CLI prerequisites: https://tauri.app/start/prerequisites/

## Setup

```bash
cd apps/vizij-ws-app
npm install
```

## Running

### Development mode

```bash
npm run dev
```

With custom WebSocket port:

```bash
npm run dev -- -- --port 9001
```

### Production build

```bash
npm run build
npm run tauri build
```

Run the built binary with:

```bash
./src-tauri/target/release/vizij-ws --port 9001
```

## Command Line Options

| Option | Default | Description |
|--------|---------|-------------|
| `--port`, `-p` | 9000 | WebSocket server port |

## WebSocket Protocol

Connect to `ws://localhost:<port>` (default: `ws://localhost:9000`)

### Incoming Messages (Server → App)

**Update values:**
```json
{
  "type": "update",
  "values": {
    "eye_left": 0.5,
    "mouth_open": 1.0,
    "head_rotation": 45.0
  }
}
```

**Reset to defaults:**
```json
{
  "type": "reset"
}
```

**Get available tracks:**
```json
{
  "type": "get_tracks"
}
```

### Outgoing Messages (App → Server)

**Tracks list response:**
```json
{
  "type": "tracks",
  "tracks": ["eye_left", "eye_right", "mouth_open"]
}
```

**Acknowledgment:**
```json
{
  "type": "ack",
  "success": true,
  "message": null
}
```

## Example: Python Client

```python
import asyncio
import websockets
import json

async def control_vizij():
    async with websockets.connect("ws://localhost:9000") as ws:
        # Update some values
        await ws.send(json.dumps({
            "type": "update",
            "values": {"eye_left": 0.5, "mouth_open": 1.0}
        }))
        response = await ws.recv()
        print("Response:", response)

        # Get available tracks
        await ws.send(json.dumps({"type": "get_tracks"}))
        tracks = await ws.recv()
        print("Tracks:", tracks)

asyncio.run(control_vizij())
```

## Notes

- The app uses `vizij` as a workspace dependency from the monorepo
- To migrate to a standalone project, you'll need to publish or copy the vizij package
- Track names correspond to animatable properties in the loaded GLTF/GLB model
