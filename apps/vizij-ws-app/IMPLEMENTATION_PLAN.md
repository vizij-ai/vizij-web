# Implementation Plan: GLB CLI Argument & Runtime Provider Migration

## Overview

Update the Tauri vizij-ws-app to:

1. Accept a GLB file path or URL via command line argument (`--glb`)
2. Use the modern `@vizij/runtime-react` architecture (with orchestrator/node graph support)
3. Maintain WebSocket functionality for external control

## Background

The app currently uses the basic `vizij` package with manual GLB loading. This doesn't support:

- Node graphs embedded in GLB files (VIZIJ_bundle extension)
- Orchestrator-based animation/control
- IR graph compilation

The `vizij-showcase` app demonstrates the modern approach using `@vizij/runtime-react` which automatically handles bundle extraction, orchestrator registration, and node graph compilation.

## Implementation Steps

### Step 1: Update Dependencies

**File:** `package.json`

Replace `vizij` with the modern stack:

- Remove: `"vizij": "*"`
- Add:
  - `"@vizij/runtime-react": "workspace:*"`
  - `"@vizij/render": "workspace:*"` (peer dep)
  - `"@react-three/fiber": "^8.17.10"` (peer dep)
  - `"@react-three/drei": "^9.115.0"` (peer dep)
  - `"three": "^0.170.0"` (peer dep)

### Step 2: Add CLI Argument in Rust

**File:** `src-tauri/src/lib.rs`

Add `--glb` argument to clap Args struct:

```rust
#[derive(Parser, Debug)]
struct Args {
    #[arg(short, long, default_value_t = 9000)]
    port: u16,

    #[arg(short, long)]
    glb: Option<String>,  // Path or URL to GLB file
}
```

Store in `AppState` and create Tauri command `get_glb_source()` to retrieve it.

### Step 3: Add Rust Command for Local File Reading

**File:** `src-tauri/src/lib.rs`

Create command to read local GLB file and return as base64:

```rust
#[tauri::command]
async fn read_glb_file(path: String) -> Result<String, String> {
    // Read file, return as base64 for blob creation in frontend
}
```

This allows the frontend to create a Blob from local files.

### Step 4: Create Asset Bundle Helper

**File:** `src/lib/createAssetBundle.ts` (new)

Create helper to build `VizijAssetBundle` from CLI source:

- If source starts with `http://` or `https://`: use `kind: "url"`
- Otherwise: read via Tauri command, create blob, use `kind: "blob"`

### Step 5: Refactor App.tsx

**File:** `src/App.tsx`

Update to:

1. Fetch GLB source from Rust via `get_glb_source()` command
2. Create asset bundle using helper
3. Wrap content with `VizijRuntimeProvider` instead of `VizijContext.Provider`

### Step 6: Refactor Content Component

**File:** `src/content.tsx`

Replace manual loading with runtime provider pattern:

- Remove: `loadGLTF`, `useVizijStore`, `addWorldElements` usage
- Use: `VizijRuntimeFace` for rendering
- Use: `useVizijRuntime()` for status and `setInput()`

### Step 7: Update WebSocket Data Sync Hook

**File:** `src/use-synced-data.ts`

Update to use `setInput()` from `useVizijRuntime()` instead of `updateValues()`:

- The runtime provider handles orchestrator input routing
- Format: `setInput("path/to/value", valueJSON)`

### Step 8: Handle Loading States

**File:** `src/content.tsx`

Use `useVizijRuntime()` status for loading states:

- `loading`: Show loading indicator
- `ready`: Show 3D viewer
- `error`: Show error message with retry option

## File Changes Summary

| File                           | Action                                               |
| ------------------------------ | ---------------------------------------------------- |
| `package.json`                 | Update dependencies                                  |
| `src-tauri/src/lib.rs`         | Add --glb arg, get_glb_source cmd, read_glb_file cmd |
| `src/App.tsx`                  | Add VizijRuntimeProvider, fetch GLB source           |
| `src/content.tsx`              | Refactor to use VizijRuntimeFace, useVizijRuntime    |
| `src/use-synced-data.ts`       | Update to use setInput()                             |
| `src/lib/createAssetBundle.ts` | New file - asset bundle creation helper              |

## Expected Behavior

- **With --glb argument:** Load the specified GLB immediately (URL or local path)
- **Without --glb argument:** Show UI with file picker button (current behavior preserved)
- **After loading:** Display 3D viewer with WebSocket status overlay

## Verification

1. **Build check:** `pnpm build` in vizij-ws-app
2. **Run with URL:** `pnpm dev -- -- --glb "https://example.com/model.glb"` - should load directly
3. **Run with local path:** `pnpm dev -- -- --glb "C:\path\to\model.glb"` - should load directly
4. **Run without arg:** `pnpm dev` - should show file picker UI
5. **WebSocket test:** Connect to ws://localhost:9000, send update message, verify model responds
