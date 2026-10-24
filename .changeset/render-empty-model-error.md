---
"@vizij/render": patch
---

An aggressive import of a GLB that has no `RobotData` and no mesh, ellipse or rectangle fails with `EmptyModelError` ("The GLB has no RobotData and no mesh, ellipse or rectangle to import"), not with an error asking for root bounds: the file holds no face to frame.
