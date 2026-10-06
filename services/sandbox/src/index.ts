import { spawn } from "node:child_process";
import { z } from "zod";

const requestSchema = z.object({
  image: z.string().regex(/^[a-z0-9./:_-]+$/),
  command: z.array(z.string().max(4_096)).min(1).max(50),
  timeoutMs: z.number().int().min(100).max(300_000).default(30_000),
  network: z.enum(["none"]).default("none"),
});
export type SandboxRequest = z.infer<typeof requestSchema>;

export interface SandboxResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const MAX_LOG_BYTES = 1_000_000;

export class DockerSandbox {
  readonly #images: ReadonlySet<string>;

  constructor(allowedImages: readonly string[]) {
    this.#images = new Set(allowedImages);
  }

  run(input: SandboxRequest, signal?: AbortSignal): Promise<SandboxResult> {
    const request = requestSchema.parse(input);
    if (!this.#images.has(request.image)) throw new Error("Sandbox image is not allowlisted");
    return new Promise((resolve, reject) => {
      const child = spawn(
        "docker",
        [
          "run",
          "--rm",
          "--network=none",
          "--read-only",
          "--cap-drop=ALL",
          "--security-opt=no-new-privileges",
          "--pids-limit=128",
          "--cpus=1",
          "--memory=512m",
          "--tmpfs=/tmp:rw,noexec,nosuid,size=64m",
          request.image,
          ...request.command,
        ],
        {
          env: { ...process.env, PATH: process.env.PATH ?? "" },
          stdio: "pipe",
          signal,
        },
      );
      child.stdin.end();
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, request.timeoutMs);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout = `${stdout}${chunk}`.slice(0, MAX_LOG_BYTES);
      });
      child.stderr.on("data", (chunk: string) => {
        stderr = `${stderr}${chunk}`.slice(0, MAX_LOG_BYTES);
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("close", (exitCode) => {
        clearTimeout(timer);
        resolve({ exitCode, stdout, stderr, timedOut });
      });
    });
  }
}
