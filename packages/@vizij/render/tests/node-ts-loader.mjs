/* eslint-disable import/order */
import { readFile, access } from "node:fs/promises";
import { createRequire } from "node:module";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
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

function isRelativeOrFileSpecifier(specifier) {
  return (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("file://")
  );
}

async function resolveTypeScriptCandidate(specifier, parentURL) {
  if (
    !isRelativeOrFileSpecifier(specifier) ||
    isTypeScriptSpecifier(specifier)
  ) {
    return null;
  }

  const baseURL = new URL(specifier, parentURL);
  const basePath = fileURLToPath(baseURL);
  const candidates = [
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
  ];

  for (const candidatePath of candidates) {
    try {
      await access(candidatePath);
      return pathToFileURL(candidatePath);
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

export async function resolve(specifier, context, defaultResolve) {
  if (isTypeScriptSpecifier(specifier)) {
    const parentURL = context.parentURL ?? import.meta.url;
    const url = new URL(specifier, parentURL);
    return { url: url.href, format: "module", shortCircuit: true };
  }

  const parentURL = context.parentURL ?? import.meta.url;
  const resolvedTs = await resolveTypeScriptCandidate(specifier, parentURL);
  if (resolvedTs) {
    return { url: resolvedTs.href, format: "module", shortCircuit: true };
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
