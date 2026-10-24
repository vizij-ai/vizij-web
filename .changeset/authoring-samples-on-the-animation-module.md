---
"vizij-authoring": patch
---

The timeline's scrub preview, inserting a key on a curve, saving a frame as a pose and the GLB bake read an animation's values from Arora's animation module, the engine the face plays it with, where they evaluated the curves in JavaScript. A player of the animation on a device of its own is stepped across the times asked for and its outputs collected; nothing writes them to the face's inputs. The shipped faces' animations bake and preview to the same values, within a float32 rounding. At a keyframe that ends a `step` segment, the preview, a pose and the bake read that keyframe's value, as the face plays it, where they read the held value; of two keyframes at time zero they read the second. A keyframe whose time or value is not a finite number fails the sampling, naming its track, and the Save Frame dialog says that it could not sample.
