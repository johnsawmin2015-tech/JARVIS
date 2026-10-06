import { z } from "zod";
import {
  capabilitySchema,
  riskClassSchema,
  safetyLimitsSchema,
  taskStatusSchema,
  type SafetyLimits,
  type TaskStatus,
} from "@jarvis/shared";

export const planSchema = z.object({
  objective: z.string().trim().min(1),
  assumptions: z.array(z.string().trim().min(1)).max(50),
  acceptanceCriteria: z.array(z.string().trim().min(1)).min(1).max(100),
  riskClass: riskClassSchema,
  requiredCapabilities: z.array(capabilitySchema).max(100),
  expectedArtifacts: z.array(z.string().trim().min(1)).max(100),
  steps: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        description: z.string().trim().min(1).max(2_000),
        dependencies: z.array(z.string()).max(100),
        acceptanceCriteria: z.array(z.string().trim().min(1)).min(1).max(50),
      }),
    )
    .min(1)
    .max(100),
});
export type Plan = z.infer<typeof planSchema>;

const transitions: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  requested: ["classified", "cancelled", "denied"],
  classified: ["context_built", "cancelled", "denied"],
  context_built: ["planned", "cancelled", "failed"],
  planned: ["authorized", "waiting_approval", "denied", "cancelled"],
  authorized: ["queued", "running", "cancelled"],
  queued: ["running", "cancelled", "expired"],
  running: ["observing", "paused", "waiting_approval", "waiting_external", "failed", "cancelled"],
  observing: ["running", "verifying", "retrying", "failed", "cancelled"],
  paused: ["queued", "cancelled", "expired"],
  waiting_approval: ["authorized", "denied", "cancelled", "expired"],
  waiting_external: ["queued", "failed", "cancelled", "expired"],
  retrying: ["queued", "running", "failed", "cancelled"],
  verifying: ["completed", "retrying", "failed", "blocked"],
  completed: [],
  failed: [],
  cancelled: [],
  denied: [],
  expired: [],
  blocked: ["queued", "cancelled", "expired"],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(fromInput: TaskStatus, toInput: TaskStatus): void {
  const from = taskStatusSchema.parse(fromInput);
  const to = taskStatusSchema.parse(toInput);
  if (!canTransition(from, to)) throw new Error(`Invalid task transition: ${from} -> ${to}`);
}

export interface ExecutionCounters {
  steps: number;
  retries: number;
  startedAtMs: number;
  costUsd: number;
  toolCalls: number;
  activeWorkers: number;
  cancelled: boolean;
}

export function enforceSafetyLimits(
  counters: ExecutionCounters,
  limitsInput: SafetyLimits,
  nowMs = Date.now(),
): void {
  const limits = safetyLimitsSchema.parse(limitsInput);
  if (counters.cancelled) throw new Error("Task cancelled");
  if (counters.steps >= limits.maxSteps) throw new Error("Maximum task steps reached");
  if (counters.retries > limits.maxRetries) throw new Error("Maximum task retries reached");
  if (nowMs - counters.startedAtMs >= limits.maxDurationMs)
    throw new Error("Maximum task duration reached");
  if (counters.costUsd >= limits.maxCostUsd) throw new Error("Maximum task cost reached");
  if (counters.toolCalls >= limits.maxToolCalls) throw new Error("Maximum tool calls reached");
  if (counters.activeWorkers > limits.maxConcurrentWorkers)
    throw new Error("Maximum concurrent workers reached");
}

export function retryDelayMs(
  attempt: number,
  policy: { initialDelayMs: number; maxDelayMs: number; multiplier: number },
): number {
  const exponential = policy.initialDelayMs * policy.multiplier ** Math.max(0, attempt - 1);
  return Math.min(policy.maxDelayMs, Math.round(exponential));
}

export interface VerificationCheck {
  name: string;
  type: "structural" | "functional" | "semantic" | "evidence" | "security";
  passed: boolean;
  evidence: string;
}

export function verificationPassed(checks: readonly VerificationCheck[]): boolean {
  return (
    checks.length > 0 && checks.every((check) => check.passed && check.evidence.trim().length > 0)
  );
}
