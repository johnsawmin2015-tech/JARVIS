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
        action: z
          .object({
            toolName: z.enum(["web.fetch", "file.read", "github.file.read", "sandbox.execute"]),
            input: z.record(z.string(), z.unknown()),
            target: z.string().min(1).max(2_000),
            reason: z.string().min(1).max(2_000),
            expectedEffect: z.string().min(1).max(2_000),
            riskClass: riskClassSchema,
            capabilities: z.array(capabilitySchema).min(1).max(20),
            credentialReferences: z.array(z.string().max(255)).max(20),
            rollback: z.string().max(2_000).nullable(),
            promptedByUntrustedContent: z.boolean(),
          })
          .nullable(),
      }),
    )
    .min(1)
    .max(100),
});
export type Plan = z.infer<typeof planSchema>;

export function planObjective(
  objectiveInput: string,
  suppliedCriteria: readonly string[] = [],
): Plan {
  const objective = z.string().trim().min(3).max(20_000).parse(objectiveInput);
  const acceptanceCriteria =
    suppliedCriteria.length > 0
      ? [...suppliedCriteria]
      : [
          "The final report directly addresses the objective",
          "Every executed action includes observable evidence",
          "Limitations and unverified claims are stated explicitly",
        ];
  const url = objective.match(/https:\/\/[^\s<>"']+/)?.[0];
  const github = url ? parseGitHubBlobUrl(url) : null;
  const sandboxCode = objective.match(/^sandbox:\s*([\s\S]+)$/i)?.[1]?.trim();
  const filePath = objective.match(
    /\b(?:read|inspect|summarize)\s+(?:the\s+)?(?:file\s+)?["']?([A-Za-z0-9_./-]+\.(?:md|txt|json|ts|tsx|js|mjs|py|go|rs))["']?/i,
  )?.[1];

  let action: Plan["steps"][number]["action"] = null;
  if (sandboxCode) {
    action = {
      toolName: "sandbox.execute",
      input: { language: "javascript", code: sandboxCode.slice(0, 10_000) },
      target: "isolated JavaScript sandbox",
      reason: "Execute the explicitly supplied sandbox program",
      expectedEffect:
        "Run code without host credentials or network access and capture bounded logs",
      riskClass: "R2",
      capabilities: ["sandbox.execute"],
      credentialReferences: [],
      rollback: "The ephemeral container is automatically destroyed",
      promptedByUntrustedContent: false,
    };
  } else if (github) {
    action = {
      toolName: "github.file.read",
      input: github,
      target: `${github.owner}/${github.repository}/${github.path}`,
      reason: "Read the requested repository file",
      expectedEffect: "Retrieve a bounded, read-only snapshot for analysis",
      riskClass: "R0",
      capabilities: ["repo.read"],
      credentialReferences: ["GITHUB_TOKEN"],
      rollback: null,
      promptedByUntrustedContent: false,
    };
  } else if (filePath) {
    action = {
      toolName: "file.read",
      input: { path: filePath },
      target: filePath,
      reason: "Read the requested workspace file",
      expectedEffect: "Retrieve bounded UTF-8 content from the configured workspace",
      riskClass: "R0",
      capabilities: ["filesystem.read"],
      credentialReferences: [],
      rollback: null,
      promptedByUntrustedContent: false,
    };
  } else if (url) {
    action = {
      toolName: "web.fetch",
      input: { url },
      target: url,
      reason: "Retrieve the requested public source",
      expectedEffect: "Fetch bounded public content without redirects or private-network access",
      riskClass: "R0",
      capabilities: ["web.fetch"],
      credentialReferences: [],
      rollback: null,
      promptedByUntrustedContent: false,
    };
  }

  return planSchema.parse({
    objective,
    assumptions: action
      ? ["The requested target is accessible within configured tool policy"]
      : ["The objective can be answered without an external side effect"],
    acceptanceCriteria,
    riskClass: action?.riskClass ?? "R0",
    requiredCapabilities: action?.capabilities ?? [],
    expectedArtifacts: ["Final task report", ...(action ? ["Validated tool evidence"] : [])],
    steps: [
      {
        id: "execute",
        description: action?.expectedEffect ?? "Produce a bounded report from the stated objective",
        dependencies: [],
        acceptanceCriteria,
        action,
      },
      {
        id: "verify",
        description: "Independently verify acceptance criteria and execution evidence",
        dependencies: ["execute"],
        acceptanceCriteria: ["Every verification check includes concrete evidence"],
        action: null,
      },
    ],
  });
}

function parseGitHubBlobUrl(
  value: string,
): { owner: string; repository: string; reference: string; path: string } | null {
  try {
    const url = new URL(value);
    if (url.hostname !== "github.com") return null;
    const [owner, repository, marker, reference, ...path] = url.pathname.split("/").filter(Boolean);
    if (!owner || !repository || marker !== "blob" || !reference || path.length === 0) return null;
    return { owner, repository, reference, path: path.join("/") };
  } catch {
    return null;
  }
}

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
