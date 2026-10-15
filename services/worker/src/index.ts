import { createHash, randomUUID } from "node:crypto";
import { appendEvent, database } from "@jarvis/database";
import {
  assertTransition,
  enforceSafetyLimits,
  retryDelayMs,
  verificationPassed,
  type Plan,
  type VerificationCheck,
} from "@jarvis/agents";
import {
  retryPolicySchema,
  safetyLimitsSchema,
  type RetryPolicy,
  type SafetyLimits,
  type TaskStatus,
} from "@jarvis/shared";

export interface LeasedTask {
  id: string;
  ownerId: string;
  objective: string;
  status: TaskStatus;
  attemptCount: number;
  safetyLimits: SafetyLimits;
  retryPolicy: RetryPolicy;
  plan: Plan;
  checkpoint: Record<string, unknown> | null;
  toolCallCount: number;
  spentUsd: string;
  createdAt: Date;
  startedAt: Date | null;
}

export interface TaskExecutionResult {
  report: string;
  evidence: unknown[];
  checkpoint: Record<string, unknown>;
}

export type TaskHandler = (task: LeasedTask, signal: AbortSignal) => Promise<TaskExecutionResult>;
export type TaskVerifier = (
  task: LeasedTask,
  result: TaskExecutionResult,
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
          steps: Number(task.checkpoint?.nextStep ?? 0),
          retries: task.attemptCount,
          startedAtMs: task.startedAt?.getTime() ?? Date.now(),
          costUsd: Number(task.spentUsd),
          toolCalls: task.toolCallCount,
          activeWorkers: 1,
          cancelled: signal.aborted,
        },
        task.safetyLimits,
      );
      await appendEvent(trace, "task.started", { workerId: this.#workerId });
      const result = await this.#handle(task, signal);
      await database()`
        UPDATE tasks
        SET status = 'verifying', checkpoint = ${database().json(result.checkpoint as never)},
          result = ${database().json({ evidence: result.evidence } as never)}
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
          final_report = ${result.report},
          completed_at = now(), lease_owner = null, lease_expires_at = null
        WHERE id = ${task.id} AND owner_id = ${task.ownerId} AND lease_owner = ${this.#workerId}
      `;
      await appendEvent(trace, passed ? "verification.passed" : "verification.failed", { checks });
      if (passed) {
        const digest = createHash("sha256").update(result.report).digest("hex");
        await database()`
          INSERT INTO artifacts (
            owner_id, task_id, name, media_type, storage_key, sha256
          )
          VALUES (
            ${task.ownerId}, ${task.id}, 'Final task report', 'text/markdown',
            ${`database:task:${task.id}:report`}, ${digest}
          )
          ON CONFLICT (task_id, name)
            WHERE task_id IS NOT NULL AND name = 'Final task report'
          DO UPDATE SET sha256 = EXCLUDED.sha256, created_at = now()
        `;
        await appendEvent(trace, "memory.candidate_created", {
          sourceType: "task",
          sourceId: task.id,
          verifiedBy: "independent-task-verifier",
        });
        await database()`
          INSERT INTO memories (
            owner_id, type, content, source_type, source_id, source_timestamp, confidence,
            importance, sensitivity, scope, status, verified
          )
          VALUES (
            ${task.ownerId}, 'execution', ${result.report}, 'system', ${task.id}, now(), 1, 0.7,
            'personal', 'owner', 'stored', true
          )
          ON CONFLICT (owner_id, source_id, type)
            WHERE source_type = 'system' AND type = 'execution'
          DO UPDATE SET content = EXCLUDED.content, updated_at = now(), verified = true
        `;
        await appendEvent(trace, "artifact.created", { name: "Final task report", sha256: digest });
        await appendEvent(trace, "memory.stored", { sourceType: "task", sourceId: task.id });
      }
    } catch (error) {
      const retryPolicy = retryPolicySchema.parse(task.retryPolicy);
      const currentAttempt = task.attemptCount + 1;
      const canRetry = currentAttempt < retryPolicy.maxAttempts && !signal.aborted;
      const delay = retryDelayMs(currentAttempt, retryPolicy);
      await database()`
        UPDATE tasks
        SET status = ${canRetry ? "retrying" : "failed"}::task_status,
          failure_reason = ${safeError(error)}, completed_at = ${canRetry ? null : new Date()},
          lease_owner = null,
          lease_expires_at = ${canRetry ? new Date(Date.now() + delay) : null}
        WHERE id = ${task.id} AND owner_id = ${task.ownerId} AND lease_owner = ${this.#workerId}
      `;
      await appendEvent(trace, canRetry ? "task.retrying" : "task.failed", {
        errorClass: errorClass(error),
        retryInMs: canRetry ? delay : null,
      });
    }
    return true;
  }

  async #lease(): Promise<LeasedTask | undefined> {
    const sql = database();
    return sql.begin(async (transaction) => {
      const [task] = await transaction<LeasedTask[]>`
        SELECT id, owner_id, objective, status, attempt_count, safety_limits, retry_policy, plan,
          checkpoint, tool_call_count, spent_usd, created_at
          , started_at
        FROM tasks
        WHERE status IN ('authorized', 'queued', 'retrying')
          AND (lease_expires_at IS NULL OR lease_expires_at < now())
        ORDER BY priority DESC, created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      if (!task) return undefined;
      task.safetyLimits = safetyLimitsSchema.parse(task.safetyLimits);
      task.retryPolicy = retryPolicySchema.parse(task.retryPolicy);
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
