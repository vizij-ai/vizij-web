import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";

function resolveSubjectAltNames() {
  const names = new Set(["DNS:localhost", "IP:127.0.0.1", "IP:::1"]);
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== "IPv4") {
        continue;
      }
      names.add(`IP:${entry.address}`);
    }
  }
  return [...names].join(",");
}

function createDevCertificate(keyPath, certPath) {
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-sha256",
      "-days",
      "30",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-subj",
      "/CN=localhost",
      "-addext",
      `subjectAltName=${resolveSubjectAltNames()}`,
    ],
    {
      stdio: "ignore",
    },
  );
}

export function resolveDevHttpsOptions() {
  const useHttps =
    process.argv.includes("--https") || process.env.VITE_DEV_HTTPS === "true";
  if (!useHttps) {
    return undefined;
  }

  const certDir = resolve(import.meta.dirname, ".vite", "https");
  const keyPath = resolve(certDir, "tutorial-agent-face.key");
  const certPath = resolve(certDir, "tutorial-agent-face.crt");

  if (!existsSync(certDir)) {
    mkdirSync(certDir, { recursive: true });
  }

  if (!existsSync(keyPath) || !existsSync(certPath)) {
    createDevCertificate(keyPath, certPath);
  }

  return {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
  };
}
