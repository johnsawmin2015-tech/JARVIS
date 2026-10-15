import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

const root = resolve(import.meta.dirname, "..");
const environmentFile = resolve(root, ".env.local");
if (existsSync(environmentFile)) loadEnvFile(environmentFile);

const next = resolve(root, "node_modules/next/dist/bin/next");
const child = spawn(process.execPath, [next, "dev", "apps/web"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}

child.once("error", (error) => {
  console.error("Unable to start JARVIS:", error.message);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
