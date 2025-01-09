import { Ellipse } from "./ellipse";
import { Group } from "./group";
import { Root } from "./root";

export type World = Record<string, Group | Ellipse | Root>;
