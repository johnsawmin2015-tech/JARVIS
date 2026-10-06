import { randomUUID } from "node:crypto";
import { appendEvent, database } from "@jarvis/database";
import {
  assertTransition,
  enforceSafetyLimits,
  verificationPassed,
  type VerificationCheck,
} from "@jarvis/agents";
import { safetyLimitsSchema, type TaskStatus } from "@jarvis/shared";

interface LeasedTask {
  id: string;
  ownerId: string;
  objective: string;
  status: TaskStatus;
  attemptCount: number;
  safetyLimits: unknown;
  createdAt: Date;
}

export type TaskHandler = (task: LeasedTask, signal: AbortSignal) => Promise<unknown>;
export type TaskVerifier = (
  task: LeasedTask,
  result: unknown,
  signal: AbortSignal,
) => Promise<VerificationCheck[]>;

export class DurableWorker {
  readonly #workerId = randomUUID();
  readonly #handle: TaskHandler;
  readonly #verify: TaskVerifier;

  constructor(handle: TaskHandler, verify: TaskVerifier) {
    this.#handle = handle;
    this.#verify = verify;
  }

  async runOnce(signal: AbortSignal): Promise<boolean> {
    const task = await this.#lease();
    if (!task) return false;
    const trace = {
      requestId: randomUUID(),
      traceId: randomUUID(),
      ownerId: task.ownerId,
      taskId: task.id,
    };
    try {
      assertTransition(task.status, "running");
      enforceSafetyLimits(
        {
          steps: 0,
          retries: task.attemptCount,
          startedAtMs: task.createdAt.getTime(),
          costUsd: 0,
          toolCalls: 0,
          activeWorkers: 1,
          cancelled: signal.aborted,
        },
        safetyLimitsSchema.parse(task.safetyLimits),
      );
      await appendEvent(trace, "task.started", { workerId: this.#workerId });
      const result = await this.#handle(task, signal);
      await database()`
        UPDATE tasks
        SET status = 'verifying', checkpoint = ${database().json({ executionCompleted: true })}
        WHERE id = ${task.id} AND owner_id = ${task.ownerId} AND lease_owner = ${this.#workerId}
      `;
      await appendEvent(trace, "verification.started", {});
      const checks = await this.#verify(task, result, signal);
      const passed = verificationPassed(checks);
      await database()`
        UPDATE tasks
        SET status = ${passed ? "completed" : "failed"}::task_status,
          verification_status = ${passed ? "passed" : "failed"}::verification_status,
          failure_reason = ${passed ? null : "Independent verification failed"},
          completed_at = now(), lease_owner = null, lease_expires_at = null
        WHERE id = ${task.id} AND owner_id = ${task.ownerId} AND lease_owner = ${this.#workerId}
      `;
      await appendEvent(trace, passed ? "verification.passed" : "verification.failed", { checks });
    } catch (error) {
      await database()`
        UPDATE tasks
        SET status = 'failed', failure_reason = ${safeError(error)}, completed_at = now(),
          lease_owner = null, lease_expires_at = null
        WHERE id = ${task.id} AND owner_id = ${task.ownerId} AND lease_owner = ${this.#workerId}
      `;
      await appendEvent(trace, "task.failed", { errorClass: errorClass(error) });
    }
    return true;
  }

  async #lease(): Promise<LeasedTask | undefined> {
    const sql = database();
    return sql.begin(async (transaction) => {
      const [task] = await transaction<LeasedTask[]>`
        SELECT id, owner_id, objective, status, attempt_count, safety_limits, created_at
        FROM tasks
        WHERE status IN ('authorized', 'queued', 'retrying')
          AND (lease_expires_at IS NULL OR lease_expires_at < now())
        ORDER BY priority DESC, created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      if (!task) return undefined;
      await transaction`
        UPDATE tasks
        SET status = 'running', started_at = COALESCE(started_at, now()),
          attempt_count = attempt_count + 1, lease_owner = ${this.#workerId},
          lease_expires_at = now() + interval '2 minutes'
        WHERE id = ${task.id}
      `;
      return task;
    });
  }
}

function errorClass(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown failure";
  return message.replaceAll(
    /\b(?:sk-[A-Za-z0-9_-]{16,}|(?:token|password|secret)\s*[:=]\s*\S+)/gi,
    "[REDACTED]",
  );
}
