# Authoring Rebuild — IA Workflow, Expanded (IA · iteration 2)

> Builds on `08-workflow-decision-tree.md` (the core gating view). Still no mockups — this
> refines the *logic*. It resolves several of iteration 1's open questions into structure:
> **entry-by-intent**, the **"get a face"** and **"rig it"** sub-trees, the **project /
> artifact model**, and a **state → enabled-activities** matrix. All diagrams are editable
> Semio-themed mermaid and render inline on GitHub.

## 1. Refined top-level flow (two ways in + prerequisite back-fill)

Iteration 1 assumed a single linear start. In reality there are **two entry modes** that
converge on the same shared target, and a returning user often enters **by intent** (they
open the tool *to do a thing*), so missing prerequisites get **back-filled** rather than
blocking. Preview/Drive is reachable **anytime**, not just at the end.

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontFamily":"Questrial, Gilroy, sans-serif","primaryColor":"#50C4B6","primaryBorderColor":"#2AA499","primaryTextColor":"#FFFFFF","lineColor":"#555555","textColor":"#333333","background":"#FFFFFF","clusterBkg":"#F7F8F8","clusterBorder":"#50C4B6"}}}%%
flowchart TD
  S([Open Vizij]):::neutral --> E{Entry mode}:::highlight
  E -->|New / guided| GET{Have a face?}:::highlight
  E -->|Open a project| OPEN[Open project<br/>face + its rigs/anims/behaviors]:::neutral --> FT
  E -->|By intent — 'animate Toasty'| BF[Resolve prerequisites<br/>for the chosen activity]:::neutral --> GET
  GET -->|No| FD[Face Designer<br/>build a face]:::primary --> FT
  GET -->|Yes| LF[Get a face<br/>library · recent · import → §2]:::neutral --> FT
  FT[[Shared target: the face]]:::emphasis --> NEED{Does this activity<br/>need a rig?}:::highlight
  NEED -->|No rig yet → rig it| RIG[Rig Designer → §3]:::primary --> MAKE
  NEED -->|Has rig / skip| MAKE{Make…}:::highlight
  MAKE -->|Animations| ANIM[Animation Designer]:::primary --> DRIVE
  MAKE -->|Behaviors| BEH[Behavior Designer]:::primary --> DRIVE
  MAKE -->|Just drive it| DRIVE
  DRIVE[[Preview / Drive — anytime]]:::secondary --> EXP[Export / Share]:::secondary
  FT -. preview .-> DRIVE
  DRIVE -. iterate .-> MAKE
  MAKE -. edit face .-> FD
  MAKE -. add control .-> RIG
  classDef primary fill:#50C4B6,stroke:#2AA499,stroke-width:2px,color:#FFFFFF,rx:8,ry:8;
  classDef secondary fill:#F56B29,stroke:#EC4D00,stroke-width:2px,color:#FFFFFF,rx:8,ry:8;
  classDef highlight fill:#FF9E00,stroke:#F78600,stroke-width:2px,color:#333333,rx:8,ry:8;
  classDef neutral fill:#F7F8F8,stroke:#888888,stroke-width:2px,color:#333333,rx:8,ry:8;
  classDef emphasis fill:#48E2CE,stroke:#2AA499,stroke-width:2px,color:#111111,rx:8,ry:8;
```

## 2. Sub-tree — getting a face

"Load a face" hides several sources, plus the import-correctness step.

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontFamily":"Questrial, Gilroy, sans-serif","primaryColor":"#50C4B6","primaryBorderColor":"#2AA499","primaryTextColor":"#FFFFFF","lineColor":"#555555","textColor":"#333333","background":"#FFFFFF","clusterBkg":"#F7F8F8","clusterBorder":"#50C4B6"}}}%%
flowchart TD
  G([Need a face]):::neutral --> Q{Source?}:::highlight
  Q -->|Template / preset| NEW[Start from a template]:::primary --> RDY
  Q -->|From scratch| SCR[Compose components<br/>Face Designer]:::primary --> RDY
  Q -->|Import 3D| IMP[Import GLB/glTF<br/>Blender etc.]:::primary --> OR{Orientation /<br/>discrepancies OK?}:::highlight
  OR -->|fix| OR
  OR -->|ok| RDY
  Q -->|Existing| WH{From where?}:::highlight
  WH -->|My library / recent| MINE[Local library]:::neutral --> RDY
  WH -->|Shared / community| COMM[Community library<br/>provenance · version]:::neutral --> RDY
  WH -->|Bundle file| BND[Open .glb bundle]:::neutral --> RDY
  RDY[[Face is the target]]:::emphasis
  classDef primary fill:#50C4B6,stroke:#2AA499,stroke-width:2px,color:#FFFFFF,rx:8,ry:8;
  classDef highlight fill:#FF9E00,stroke:#F78600,stroke-width:2px,color:#333333,rx:8,ry:8;
  classDef neutral fill:#F7F8F8,stroke:#888888,stroke-width:2px,color:#333333,rx:8,ry:8;
  classDef emphasis fill:#48E2CE,stroke:#2AA499,stroke-width:2px,color:#111111,rx:8,ry:8;
```

## 3. Sub-tree — rig it

The "rig it now?" branch hides a real sub-decision: build a face-specific control, align to
a community standard, or reuse an existing rig.

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontFamily":"Questrial, Gilroy, sans-serif","primaryColor":"#50C4B6","primaryBorderColor":"#2AA499","primaryTextColor":"#FFFFFF","lineColor":"#555555","textColor":"#333333","background":"#FFFFFF","clusterBkg":"#F7F8F8","clusterBorder":"#50C4B6"}}}%%
flowchart TD
  R([Rig the face]):::neutral --> T{Rig type?}:::highlight
  T -->|Face-specific control| FS[Map inputs → face elements<br/>f → d]:::primary --> PV
  T -->|Align to a standard| ST[Pick a standard<br/>map c → f]:::primary --> CV{Coverage complete?}:::highlight
  CV -->|gaps remain| ST
  CV -->|complete| PV
  T -->|Reuse a rig| RU[Import a rig]:::primary --> RM[Remap to this face]:::primary --> PV
  PV[[Preview against the face]]:::emphasis --> PUB[Publish rig<br/>face-specific / standard]:::secondary
  classDef primary fill:#50C4B6,stroke:#2AA499,stroke-width:2px,color:#FFFFFF,rx:8,ry:8;
  classDef secondary fill:#F56B29,stroke:#EC4D00,stroke-width:2px,color:#FFFFFF,rx:8,ry:8;
  classDef highlight fill:#FF9E00,stroke:#F78600,stroke-width:2px,color:#333333,rx:8,ry:8;
  classDef neutral fill:#F7F8F8,stroke:#888888,stroke-width:2px,color:#333333,rx:8,ry:8;
  classDef emphasis fill:#48E2CE,stroke:#2AA499,stroke-width:2px,color:#111111,rx:8,ry:8;
```

## 4. Project & artifact model (what contains what)

A **project centers on one face** (multi-face is a later question, §7). The face has many
rigs; animations target a rig; behaviors compose animations + speech/logic; standards are
referenced by rigs. This is *why* the gating exists — each artifact depends on the one below.

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontFamily":"Questrial, Gilroy, sans-serif","primaryColor":"#50C4B6","primaryBorderColor":"#2AA499","primaryTextColor":"#FFFFFF","lineColor":"#555555","textColor":"#333333","background":"#FFFFFF","clusterBkg":"#F7F8F8","clusterBorder":"#50C4B6"}}}%%
flowchart LR
  FACE[[Face — the target]]:::emphasis -->|has many| RIG[Rig]:::primary
  STD[(Standard)]:::neutral -. referenced by .-> RIG
  RIG -->|targeted by| ANIM[Animation]:::primary
  ANIM -->|composed into| BEH[Behavior]:::primary
  SPEECH[(Speech)]:::neutral -. part of .-> BEH
  BEH -->|run by| CTRL[Face Controller]:::secondary
  ANIM -->|played by| CTRL
  classDef primary fill:#50C4B6,stroke:#2AA499,stroke-width:2px,color:#FFFFFF,rx:8,ry:8;
  classDef secondary fill:#F56B29,stroke:#EC4D00,stroke-width:2px,color:#FFFFFF,rx:8,ry:8;
  classDef neutral fill:#F7F8F8,stroke:#888888,stroke-width:2px,color:#333333,rx:8,ry:8;
  classDef emphasis fill:#48E2CE,stroke:#2AA499,stroke-width:2px,color:#111111,rx:8,ry:8;
```

## 5. Entry-by-intent — prerequisite back-fill

When a user enters *to do a specific thing*, don't dead-end them. Check prerequisites and
offer to create what's missing, then drop them into the activity.

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontFamily":"Questrial, Gilroy, sans-serif","primaryColor":"#50C4B6","primaryBorderColor":"#2AA499","primaryTextColor":"#FFFFFF","lineColor":"#555555","textColor":"#333333","background":"#FFFFFF","clusterBkg":"#F7F8F8","clusterBorder":"#50C4B6"}}}%%
flowchart TD
  I([Intent: 'design an animation']):::neutral --> P{Prerequisites?}:::highlight
  P -->|No face| NF[Offer: load or create a face → §2]:::secondary --> P
  P -->|Face, no rig| NR[Offer: needs a control —<br/>make or import a rig? → §3]:::secondary --> P
  P -->|Ready| GO[Open Animation Designer]:::primary
  classDef primary fill:#50C4B6,stroke:#2AA499,stroke-width:2px,color:#FFFFFF,rx:8,ry:8;
  classDef secondary fill:#F56B29,stroke:#EC4D00,stroke-width:2px,color:#FFFFFF,rx:8,ry:8;
  classDef highlight fill:#FF9E00,stroke:#F78600,stroke-width:2px,color:#333333,rx:8,ry:8;
  classDef neutral fill:#F7F8F8,stroke:#888888,stroke-width:2px,color:#333333,rx:8,ry:8;
```

## 6. State → enabled activities

Availability is a function of project state. This is the precise, implementable form of the
gating logic (drives which activities the shell's path enables, and the back-fill prompts).

| Project state | Face Designer | Rig Designer | Animation Designer | Behavior Designer | Controller (drive) |
| --- | --- | --- | --- | --- | --- |
| Empty | create a face | — | — | — | — |
| Face, no rig | ✓ edit | ✓ create | limited¹ | limited¹ | ✓ preview face |
| Face + rig | ✓ | ✓ | ✓ | needs animations² | ✓ |
| Face + rig + animation | ✓ | ✓ | ✓ | ✓ | ✓ |
| + behaviors | ✓ | ✓ | ✓ | ✓ | ✓ drive behaviors |

¹ *Without a rig you can only drive low-level properties directly (`d`) — possible but
tedious; the tool nudges toward rigging.*
² *A behavior sequences animations, so it wants at least one animation (or a live/standard
input) to be meaningful.*

## 7. Resolved vs. still-open

**Resolved from iteration 1 (`08`):**
- Skip-rigging path → §6 row "Face, no rig" (limited direct `d` control; nudged to rig).
- Standards vs. face-specific → §3 sub-tree.
- Entry-by-intent → §1 + §5.
- Where faces come from → §2 sub-tree (library/community/import/bundle).
- Always-available preview → §1 (Drive reachable from the target anytime).

**Still open (next iterations):**
1. **Multi-face projects.** §4 assumes one face per project; the Controller can drive many.
   Is multi-face a project of projects, a scene, or out of v1 scope?
2. **Animation ↔ rig coupling.** If an animation targets rig A and you switch to rig B, what
   happens? Re-target, warn, or version-pin (ties to `06`)?
3. **Behavior inputs beyond animations.** Behaviors can react to live/sensor inputs (`04`
   B5–B7) — needs its own sub-tree (sources, triggers, conditions).
4. **Collections UI.** Managing many rigs/animations/behaviors per face (browse, duplicate,
   compare, set-active) — a distinct IA piece.
5. **Standard authoring vs. consuming.** §3 covers *consuming* a standard; an Abstraction
   Rigger *authoring* a new standard is a deeper flow.
6. **Save/version checkpoints.** Where autosave, named versions, and publish fit into these
   flows (ties to `06` tool fundamentals).

## What this feeds

- The shell's **activity path** (`07`) — enable/disable states and back-fill prompts come
  straight from §1 and §6.
- The **next IA iterations** above (multi-face, behavior inputs, collections, standard
  authoring) — all still *before* mockups.
