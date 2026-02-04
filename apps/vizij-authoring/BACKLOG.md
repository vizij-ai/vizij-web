# Backlog

This file tracks unimplemented features, known bugs, and technical debt for the `vizij-authoring` application.

## Features & Enhancements

- [ ] Add shapes
- [ ] Copy variables from reference face to main face
- [ ] Add Dependency panel showing the variables and how they connect to shapes
- [ ] Save / load animations
- [ ] Create variable "Folder"
- [ ] Create a "Shared" variables section in the Variables panel when both shapes use the same variable. Editing the variable should update both faces


## Feature Parity

- [ ] Add variable definition
- [ ] Add preset definition
- [ ] Import / export variable set definition (pose, rig, etc.)
- [ ] Add idle behavior setting and editing
- [ ] Add "inputs" like sin/cos/tan curves, random noise, etc
- [ ] Edit face-id
- [ ] "Input Coverage"
- [ ] 


## Bugs

- [ ] Inspector currently lists all variables of a shape under the variables it is connected to. It should instead only list rigs / poses that affect the shape.
- [ ] Pose sliders only work sometimes / are buggy
- [ ] Creating a material without an attached shape fails
- [ ] Selecting a variable to drive doesn't work, the hierarchy is breaking
- [ ] Debug panel needs revision
- [ ] Edit > Undo and Redo does nothing
- [ ] Reference face hierarchy is not shown



### Visual Bugs

- [ ] There's still a lot of blue
- [ ] There's a lot of old css
- [ ] Keep panel titles stuck to top when scrolling
- [ ] Consistent add UI for variables and materials
- [ ] Intentional iconography and colors


## Technical Debt

- [ ] **Implement `buildPoseGraphSpec` wrapper in `PoseGraphService`**
  - *Context*: `src/poseRig/services/poseGraphService.ts:42`. Currently has a TODO/throw placeholder.
