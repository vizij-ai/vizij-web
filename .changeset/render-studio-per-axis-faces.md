---
"@vizij/render": major
---

The loader and the exporter read Semio Studio's faces. An element's compound features — translation, rotation, scale, `color`, `emissive`, `specular`, `fillColor`, `strokeColor` — may be carried per axis (`translation.x`, `rotation.r`, `color.g`), each axis a number feature on an animatable of its own or on a component `<id>.<axis>` of a compound one, whole, or both, a component given per axis standing over the whole value's. Such a face loads, `buildSceneGraph` applies its per-axis features to the node's transform and the material, and `exportScene` writes its `RobotData` back unchanged. A rotation given as `{ r, p, y }` (roll, pitch, yaw) applies as the euler `{ x, y, z }`, in ZYX order.

Breaking: `translation` and `rotation` are optional in the `Group`, `Shape`, `Ellipse` and `Rectangle` features, since a per-axis face has neither whole; each type gains its per-axis keys (`PerAxisFeatures`, `PerAxisTransformFeatures`, `VectorAxis`, `RotationAxis`, `ColorAxis`). A loaded element still carries each of translation and rotation, whole or by at least one axis, and the loader names the features an element lacks.
