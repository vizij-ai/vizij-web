import type { Ellipse } from "./ellipse";
import type { Rectangle } from "./rectangle";
import type { Group } from "./group";
import type { Shape } from "./shape";

export type World = Record<string, Group | Ellipse | Rectangle | Shape>;
