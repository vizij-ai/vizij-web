/* eslint-disable import/order */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { URL, fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const TS_EXTENSIONS = new Set([".ts", ".tsx"]);

const compilerOptions = {
  module: ts.ModuleKind.ES2020,
  target: ts.ScriptTarget.ES2020,
  jsx: ts.JsxEmit.ReactJSX,
  esModuleInterop: true,
};

function isTypeScriptSpecifier(specifier) {
  try {
    const { pathname } = new URL(specifier);
    const ext = path.extname(pathname);
    return TS_EXTENSIONS.has(ext);
  } catch {
    const cleaned = specifier.split("?")[0].split("#")[0];
    const ext = path.extname(cleaned);
    return TS_EXTENSIONS.has(ext);
  }
}

export async function resolve(specifier, context, defaultResolve) {
  if (isTypeScriptSpecifier(specifier)) {
    const parentURL = context.parentURL ?? import.meta.url;
    const url = new URL(specifier, parentURL);
    return { url: url.href, format: "module", shortCircuit: true };
  }
  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  if (isTypeScriptSpecifier(url)) {
    const filename = fileURLToPath(url);
    const source = await readFile(filename, "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        ...compilerOptions,
        sourceMap: false,
      },
      fileName: filename,
    });
    return { format: "module", source: outputText, shortCircuit: true };
  }
  return defaultLoad(url, context, defaultLoad);
}
