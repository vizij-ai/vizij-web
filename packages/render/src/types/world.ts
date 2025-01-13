import { Ellipse } from "./ellipse";
import { Group } from "./group";

export type World = Record<string, Group | Ellipse>;
