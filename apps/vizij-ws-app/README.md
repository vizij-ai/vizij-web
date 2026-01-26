# Vizij WS App

A standalone desktop application that renders Vizij avatars and accepts real-time control via WebSocket. Perfect for integrating facial animation into robotics, VTubing, games, or any application that needs programmatic avatar control.

## Features

- Load any Vizij-compatible GLB avatar file
- Real-time WebSocket server on configurable port (default `ws://localhost:9000`)
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
pnpm dev:vizij-ws-app

# Pass CLI arguments
pnpm dev:vizij-ws-app -- -- --glb /path/to/avatar.glb --fullscreen
```

---

## Deployment

### Building

```bash
cd apps/vizij-ws-app
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

### Update Values

```json
{
  "type": "update",
  "values": {
    "standard/left_eye/pos/x": 0.5,
    "standard/left_eye/pos/y": 0.3,
    "standard/right_eye/pos/x": 0.5,
    "standard/right_eye/pos/y": 0.3
  }
}
```

### Reset

```json
{
  "type": "reset"
}
```

### Path Format

Paths follow the Vizij rig convention. The app automatically prefixes paths with `rig/{faceId}/`, so you only need to send the feature path.

**Common eye gaze paths:**

| Path                       | Description          | Range                  |
| -------------------------- | -------------------- | ---------------------- |
| `standard/left_eye/pos/x`  | Left eye horizontal  | -1 (left) to 1 (right) |
| `standard/left_eye/pos/y`  | Left eye vertical    | -1 (down) to 1 (up)    |
| `standard/right_eye/pos/x` | Right eye horizontal | -1 (left) to 1 (right) |
| `standard/right_eye/pos/y` | Right eye vertical   | -1 (down) to 1 (up)    |

Click the **Debug** button in the app to see all available paths for your loaded avatar.

---

## Troubleshooting

### "WebSocket connection failed"

1. Ensure the app is running and a model is loaded
2. Check that the port is not in use: `netstat -an | grep 9000`
3. Wait for "Runtime: ready" status before connecting

### "Model not moving"

1. Open DevTools (F12) and check for errors
2. Click **Debug** to see available paths
3. Verify paths match the format shown in Debug output
4. Ensure values are in valid range (typically -1 to 1)

### Build errors

**Windows:** Install Visual Studio Build Tools with "Desktop development with C++"

**Linux:**

```bash
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libssl-dev \
  libgtk-3-dev
```

---

## License

See the repository root for license information.
