import { Ellipse } from "./ellipse";
import { Rectangle } from "./rectangle";
import { Group } from "./group";

export type World = Record<string, Group | Ellipse | Rectangle>;
