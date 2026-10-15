import { closeDatabase } from "@jarvis/database";
import { createJarvisWorker } from "./runtime";

const controller = new AbortController();
const worker = createJarvisWorker(process.env.JARVIS_WORKSPACE_ROOT ?? process.cwd());
const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 1_000);

process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

try {
  while (!controller.signal.aborted) {
    const worked = await worker.runOnce(controller.signal);
    if (!worked) await pause(pollIntervalMs, controller.signal);
  }
} finally {
  await closeDatabase();
}

function pause(durationMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, durationMs);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
