import { z } from "zod";

export const riskClassSchema = z.enum(["R0", "R1", "R2", "R3"]);
export type RiskClass = z.infer<typeof riskClassSchema>;

export const capabilitySchema = z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+$/);
export type Capability = z.infer<typeof capabilitySchema>;

export const taskStatusSchema = z.enum([
  "requested",
  "classified",
  "context_built",
  "planned",
  "authorized",
  "queued",
  "running",
  "observing",
  "paused",
  "waiting_approval",
  "waiting_external",
  "retrying",
  "verifying",
  "completed",
  "failed",
  "cancelled",
  "denied",
  "expired",
  "blocked",
]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const verificationStatusSchema = z.enum(["pending", "running", "passed", "failed"]);
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

export const retryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(20).default(5),
  initialDelayMs: z.number().int().min(100).max(60_000).default(1_000),
  maxDelayMs: z.number().int().min(1_000).max(3_600_000).default(60_000),
  multiplier: z.number().min(1).max(10).default(2),
});
export type RetryPolicy = z.infer<typeof retryPolicySchema>;

export const safetyLimitsSchema = z.object({
  maxSteps: z.number().int().min(1).max(1_000).default(100),
  maxRetries: z.number().int().min(0).max(20).default(5),
  maxDurationMs: z.number().int().min(1_000).max(86_400_000).default(3_600_000),
  maxCostUsd: z.number().min(0).max(10_000).default(2),
  maxToolCalls: z.number().int().min(0).max(1_000).default(100),
  maxConcurrentWorkers: z.number().int().min(1).max(100).default(1),
});
export type SafetyLimits = z.infer<typeof safetyLimitsSchema>;

export const taskSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  parentTaskId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable(),
  objective: z.string().trim().min(1).max(20_000),
  status: taskStatusSchema,
  priority: z.number().int().min(0).max(100),
  type: z.string().trim().min(1).max(100),
  input: z.record(z.string(), z.unknown()),
  expectedOutput: z.string().max(10_000),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(2_000)).max(100),
  dependencies: z.array(z.string().uuid()).max(100),
  assignedAgent: z.string().max(100).nullable(),
  riskClass: riskClassSchema,
  requiredCapabilities: z.array(capabilitySchema).max(100),
  retryPolicy: retryPolicySchema,
  safetyLimits: safetyLimitsSchema,
  attemptCount: z.number().int().min(0),
  timeoutMs: z.number().int().min(1_000).max(86_400_000),
  idempotencyKey: z.string().min(8).max(255),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  failureReason: z.string().max(10_000).nullable(),
  verificationStatus: verificationStatusSchema,
});
export type Task = z.infer<typeof taskSchema>;

export const eventFamilySchema = z.enum([
  "conversation.created",
  "message.created",
  "model.requested",
  "model.completed",
  "model.failed",
  "plan.created",
  "plan.updated",
  "task.created",
  "task.started",
  "task.paused",
  "task.failed",
  "task.retrying",
  "tool.requested",
  "tool.allowed",
  "tool.denied",
  "tool.approval_required",
  "tool.approved",
  "tool.executed",
  "tool.failed",
  "sandbox.created",
  "sandbox.destroyed",
  "artifact.created",
  "memory.candidate_created",
  "memory.stored",
  "memory.updated",
  "approval.requested",
  "approval.resolved",
  "verification.started",
  "verification.passed",
  "verification.failed",
]);
export type EventFamily = z.infer<typeof eventFamilySchema>;

export interface TraceContext {
  requestId: string;
  traceId: string;
  ownerId: string;
  projectId?: string;
  taskId?: string;
  agentId?: string;
}

export interface Usage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}
