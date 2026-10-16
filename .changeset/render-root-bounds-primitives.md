---
"@vizij/render": minor
---

`deriveRootBounds` measures ellipse and rectangle elements: a node whose RobotData is an `ellipse` or a `rectangle` carries no mesh, and counts as the shape it is drawn from — a circle of radius 1 or a 1 × 1 square in the XY plane under its world matrix, which its scale stretches to the element's `width` and `height`. It takes any `Object3D`, such as the root `buildSceneGraph` returns.
