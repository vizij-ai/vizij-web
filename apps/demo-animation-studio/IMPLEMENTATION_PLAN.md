# Vizij Animation Player Showcase — Implementation Plan

Goal
Build a comprehensive demo application that demonstrates the full capability of the Vizij animation player from initialization to runtime control and visualization:

- Configure engine (Config) before initialization
- Load animations (core or StoredAnimation) from built-in presets and user-import
- Create and manage Players
- Add and manage Instances with InstanceCfg (weight, time_scale, start_offset, enabled)
- Playback controls: Play/Pause/Stop, Seek, SetSpeed, LoopMode (Once/Loop/PingPong), SetWindow
- Showcase all Value kinds with and without interpolation (control points set/unset)
- Visualize Outputs and Events over time (charts, widgets, logs)
- Manage Prebind mapping and inspect bindings live
- Export/import demo sessions

Repository Location
- New app: `vizij-web/apps/demo-animation-studio/` (keeps existing `demo-animation` minimal app intact)

Architecture Overview
- Runtime engine: `@vizij/animation-wasm` (init, Engine wrapper, types)
- React integration: `@vizij/animation-react` (provider, per-target store, hooks)
- App UI: React (Vite), custom lightweight charts and widgets
- Data: StoredAnimation presets covering all Value kinds and easing variants

Top-level UI Layout
- Top Toolbar (Transport)
  - Play/Pause/Stop, LoopMode, SetSpeed, Seek (scrubber + time input), SetWindow
  - ABI/version indicator (from `abi_version()`), updateHz throttle, init status
- Left Sidebar Panels
  1) Engine Config: pre-init Config editor (scratch sizes, max_events_per_tick, features)
  2) Animations: select presets, import JSON, show clip summary
  3) Players & Instances: create players, attach animations as instances, edit InstanceCfg
  4) Prebind Manager: canonical path → key mapping UI, live binding inspection
- Main Tabs
  - Live Outputs: latest values per target with type-specific widgets
  - History Charts: time-series visualization per target (Scalar/Vec*; Color; Quat; Transform)
  - Events Log: CoreEvent stream with filters (Playback*, KeypointReached, PerformanceWarning, etc.)
  - Interpolation Explorer: compare curves “with transitions” vs “unset/default” for the same track(s)
- Right Inspector
  - Focused target details, recent changes, quick pin to charts

Feature Areas and Deliverables

A) Scaffolding and Layout
- Create Vite React app in `apps/demo-animation-studio`
- Wire `AnimationProvider` at root with:
  - `animations`: initial preset(s)
  - `prebind`: identity (configurable later)
  - `autostart`: true; `updateHz`: 60 by default (configurable)
- Implement responsive layout: Toolbar, Sidebars, Tabs, Inspector

B) Engine Config and Initialization
- Form to edit `Config` fields:
  - `scratch_samples`, `scratch_values_scalar`, `scratch_values_vec`, `scratch_values_quat`
  - `max_events_per_tick`, `features.reserved0`
- Init lifecycle:
  - Show `abi_version()` and init status
  - Apply config requires re-init; disable transport until ready

C) Animation Management
- Built-in Presets (with/without transitions) covering all Value kinds:
  - Scalar: ramp, sine
  - Vec2/Vec3/Vec4: ramps and pulses
  - Quat: shortest-arc rotation vs simple axis comparison
  - Color: RGBA ramp (HSL as authoring example)
  - Transform: TRS composition (translation path, rotation sweep, scale pulse)
  - Bool: step changes
  - Text: discrete steps
- JSON Import:
  - File upload and text paste
  - Validate structure (user-friendly errors)
- Clip summary (duration, tracks, targets) and preview snippet

D) Players & Instances
- Create/Delete Players (name)
- Add/Remove Instances bound to selected animation
- Edit `InstanceCfg` live:
  - `weight` (0..1)
  - `time_scale`
  - `start_offset`
  - `enabled` toggle
- View Player → Instances tree, instance status, and quick controls

E) Playback Controls (Transport)
- Send per-player `Inputs.PlayerCommand`:
  - Play/Pause/Stop, SetSpeed, Seek
  - SetLoopMode (Once/Loop/PingPong)
  - SetWindow (start_time, end_time?)
- Time readout and per-player selection for transport targeting
- Keyboard shortcuts (Phase 3):
  - Space: Play/Pause
  - Arrow keys: Seek
  - L: Cycle loop modes

F) Prebind Manager
- Enumerate canonical targets from loaded clips
- Rule-based mapping editor (exact/regex) path → key
- Validate collisions; show resolved keys and sample outputs
- Apply resolver through provider prop

G) Outputs Visualization
- Latest Value widgets by type:
  - Scalar/Bool/Text: badges/labels
  - Vec*, Color: vector lines and color swatches
  - Quat: (x,y,z,w), magnitude indicator; (Phase 3) visualize orientation
  - Transform: TRS sub-panels
- History Charts:
  - Ring buffer (configurable history window)
  - Scalar/Bool/Text: single/multi-line (map Bool→0/1; Text via markers)
  - Vec*/Color: multiple series per component/channel
  - Quat: show w or angle magnitude; (Phase 3) advanced views
  - Transform: translation/rotation/scale charts
- Event Log:
  - Timestamped table; filter by type; pause/resume logging
  - Export events JSON

H) Interpolation Explorer
- Select track(s), render two variants:
  - With control points (provided)
  - Without transitions (default curve)
- Overlay charts and display control point values

I) Session Persistence
- Export session JSON (engine config, animations, players, instances, prebind rules, chart preferences)
- Import/restore session
- (Phase 3) Optional: localStorage autosave; URL hash compact state

J) Diagnostics and Performance
- Display changes/events per tick, updateHz, chart decimation options
- Keep charts efficient; cap series count and history

K) Documentation and Examples
- App README with screenshots and feature guide
- Example recipes:
  - Blending with two instances and different weights
  - Loop modes & SetWindow demonstration
  - Vector/color charts
  - Interpolation differences (with vs without transitions)

Data & Presets Coverage
- Ensure presets cover every Value kind defined in core:
  - Scalar, Vec2, Vec3, Vec4, Quat, Color (RGBA), Transform, Bool, Text
- Provide both default transitions and explicit control points
- Include overlapping targets to demonstrate blending via weights
- Include varied durations to showcase seek and windowing

Technical Roadmap (Tasks by Layer)

1) App Bootstrap
- Create `apps/demo-animation-studio`
- Root provider wiring, identity prebind, initial presets

2) Engine Config Panel
- Editable form; re-init flow; ABI status indicator

3) Animation Presets & Import
- Presets module covering all Value kinds (with/without transitions)
- Import UI + validation feedback

4) Players & Instances
- Create players, attach/remove instances, edit InstanceCfg
- Per-player targeting in transport

5) Transport & Inputs Wiring
- Send `Inputs` (`PlayerCommand` & `InstanceUpdate`) via provider step/update
- UI controls for speed, seek, loop mode, window

6) Prebind Manager
- Canonical paths listing, mapping editor, apply & verify

7) Outputs & Charts
- Latest Value widgets; time-series ring buffer; charts per type
- Event log with filters and export

8) Interpolation Explorer
- Dual-variant charts; display control points and defaults

9) Session Persistence
- Export/import; (Phase 3) local autosave and URL hash

10) QA & Performance
- Throttle updates, decimation, series limits, browser compatibility

11) Documentation
- App README + usage walkthroughs
- Reference to `@vizij/animation-wasm` and `@vizij/animation-react` READMEs

MVP Scope and Phases

Phase 1 (MVP)
- App skeleton & provider
- Presets for Scalar, Vec3, Color, Transform (with/without transitions)
- Basic Engine Config panel
- Players/Instances add/remove & simple InstanceCfg
- Transport: Play/Pause/Stop, speed, seek, loop mode
- Live outputs list; simple charts for Scalar/Vec3
- Event log (basic)
- Identity prebind

Phase 2
- Full Value coverage; richer charts and widgets
- Prebind manager UI with mapping rules
- Interpolation explorer
- Session export/import
- Inspector panel and pinning
- SetWindow controls with chart overlay
- Diagnostics panel

Phase 3 (Polish)
- Keyboard shortcuts
- Advanced quat/transform visualizations
- Chart export (image/CSV)
- In-app docs and workflows

Acceptance Criteria
- Full lifecycle demonstrated: configure → init → load → create players → add instances → control playback & modes → visualize outputs & events
- Presets and import cover all Value kinds and demonstrate transitions vs defaults
- Real-time charts accurately reflect outputs with configurable history window
- Prebind mapping allows subscription by user-friendly keys
- Session export/import reproduces state reliably
- Documentation guides users through all major features

Dependencies & Notes
- Use existing `@vizij/animation-react` provider and `@vizij/animation-wasm` Engine/types
- Prefer lightweight chart implementation first (custom Canvas/SVG); revisit libraries only if needed
- Vite wasm handling validated in current demo; studio will reuse pattern
- Maintain minimal coupling so panels/components can be reused elsewhere

Proposed Repository Structure
```
vizij-web/apps/demo-animation-studio/
  src/
    presets/                # StoredAnimation presets (TS objects or JSON)
    components/
      ConfigPanel.tsx
      AnimationsPanel.tsx
      PlayersPanel.tsx
      TransportBar.tsx
      PrebindPanel.tsx
      OutputsView/
        LatestValues.tsx
        ChartsView.tsx
      EventsLog.tsx
      InterpExplorer.tsx
      Inspector.tsx
    state/
      store.ts              # UI state, selectors (if needed)
    styles/
    App.tsx
    main.tsx
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  README.md
```

Initial Task Checklist
- Scaffold new app and baseline layout
- Integrate provider, identity prebind
- Add core presets (Scalar, Vec3, Color, Transform) with/without transitions
- Engine Config panel (basic)
- Players/Instances manager (basic)
- Transport wiring
- Live outputs list and basic charts
- Event log (basic)
- App README (MVP)
