import { Ellipse } from "./ellipse";
import { Rectangle } from "./rectangle";
import { Group } from "./group";
import { Shape } from "./shape";

export type World = Record<string, Group | Ellipse | Rectangle | Shape>;
