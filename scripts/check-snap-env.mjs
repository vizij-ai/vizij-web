import fs from "fs";

const snapEnv = Boolean(
  process.env.SNAP || process.env.SNAP_NAME || process.env.SNAP_VERSION,
);
const vscodeSnapEnv = Boolean(
  process.env.VSCODE_SNAP_ORIG || process.env.SNAP_INSTANCE_NAME,
);

function readlinkSafe(p) {
  try {
    return fs.readlinkSync(p);
  } catch {
    return null;
  }
}

function readFileSafe(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function looksSnapPath(s) {
  return s.includes("/snap/") || s.includes("snap/") || s.includes("snap.");
}

function processInfo(pid) {
  const exe = readlinkSafe(`/proc/${pid}/exe`) ?? "";
  const cmdline = readFileSafe(`/proc/${pid}/cmdline`).replace(/\0/g, " ");
  const stat = readFileSafe(`/proc/${pid}/stat`);
  const ppid = stat ? Number(stat.split(" ")[3]) : 0;
  return { pid, ppid, exe, cmdline };
}

let parentIsSnap = false;
let cursor = process.pid;
for (let i = 0; i < 6; i += 1) {
  const info = processInfo(cursor);
  if (!info.pid) break;
  if (looksSnapPath(info.exe) || looksSnapPath(info.cmdline)) {
    parentIsSnap = true;
    break;
  }
  if (!info.ppid || info.ppid === cursor) break;
  cursor = info.ppid;
}

const snapCorePresent = fs.existsSync("/snap/core20/current");
const mountInfoShowsSnap = readFileSafe("/proc/self/mountinfo").includes(
  "/snap/",
);

const likelySnap =
  snapEnv ||
  vscodeSnapEnv ||
  parentIsSnap ||
  (snapCorePresent && mountInfoShowsSnap);

if (likelySnap) {
  const lines = [
    "\n[dev:vizij-ws-app] Snap-based environment detected (often VS Code Snap).",
    "This can cause Tauri to fail with:",
    "  /snap/core20/.../libpthread.so.0: undefined symbol: __libc_pthread_init, version GLIBC_PRIVATE",
    "Fix: run from a non-snap terminal (e.g., apt-installed gnome-terminal) and re-run:",
    "  pnpm run dev:vizij-ws-app",
    "",
  ];
  console.error(lines.join("\n"));
  process.exit(1);
}
