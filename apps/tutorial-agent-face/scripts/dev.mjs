import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const useHttps = args.includes("--https");
const forwardedArgs = args.filter((arg) => arg !== "--https");
const require = createRequire(import.meta.url);
const viteBin = resolve(
  dirname(require.resolve("vite/package.json")),
  "bin/vite.js",
);

const child = spawn(process.execPath, [viteBin, ...forwardedArgs], {
  stdio: "inherit",
  env: {
    ...process.env,
    ...(useHttps ? { VITE_DEV_HTTPS: "true" } : {}),
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
