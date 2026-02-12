import { register } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(resolve(here, "./node-ts-loader.mjs"), pathToFileURL(`${here}/`));
