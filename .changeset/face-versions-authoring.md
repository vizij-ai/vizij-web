---
"vizij-authoring": minor
---

The export dialog edits the face's hardware and software versions, and the export writes them into the bundle's metadata as `hardwareVersion` and `softwareVersion`, trimmed, leaving a blank one out. Loading a face reads them back from its bundle, and changing one marks the face unsaved. A Vizij device reports them to Semio Studio as its model, the face ID standing in for a hardware version the face does not state.
