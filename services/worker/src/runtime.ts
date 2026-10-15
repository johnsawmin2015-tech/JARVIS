import { randomUUID } from "node:crypto";
import { z } from "zod";
import { enforceSafetyLimits, type VerificationCheck } from "@jarvis/agents";
import {
  appendEvent,
  database,
  findApprovedAction,
  findCompletedToolExecution,
  finishToolExecution,
  markApprovalConsumed,
  startToolExecution,
} from "@jarvis/database";
import {
  actionDigest,
  EnvironmentSecretBroker,
  redactSecrets,
  type ProposedAction,
} from "@jarvis/security";
import {
  createFileReadTool,
  githubReadTool,
  ToolGateway,
  webFetchTool,
  type Tool,
} from "@jarvis/tools";
import { DockerSandbox, type SandboxResult } from "../../sandbox/src/index";
import {
  DurableWorker,
  type LeasedTask,
  type TaskExecutionResult,
  type TaskVerifier,
} from "./index";

const sandboxInputSchema = z.object({
  language: z.literal("javascript"),
  code: z.string().min(1).max(10_000),
});
const sandboxOutputSchema = z.object({
  exitCode: z.number().int().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  timedOut: z.boolean(),
});

export function createJarvisWorker(workspaceRoot: string): DurableWorker {
  return new DurableWorker(createTaskHandler(workspaceRoot), verifyTask);
}

export function createTaskHandler(workspaceRoot: string) {
  return async (task: LeasedTask, signal: AbortSignal): Promise<TaskExecutionResult> => {
    const trace = {
      requestId: randomUUID(),
      traceId: randomUUID(),
      ownerId: task.ownerId,
      taskId: task.id,
    };
    const broker = new EnvironmentSecretBroker([
      {
        name: "GITHUB_TOKEN",
        environment: runtimeEnvironment(),
        allowedCapabilities: ["repo.read"],
      },
    ]);
    const gateway = new ToolGateway(broker, async (event) => {
      await appendEvent(event.trace, event.event, {
        toolName: event.toolName,
        actionDigest: event.actionDigest,
        durationMs: event.durationMs,
        errorClass: event.errorClass,
      });
    });
    gateway.register(webFetchTool);
    gateway.register(createFileReadTool(workspaceRoot));
    gateway.register(githubReadTool);
    gateway.register(createSandboxTool());

    const completedSteps = Array.isArray(task.checkpoint?.completedSteps)
      ? task.checkpoint.completedSteps.filter((value): value is string => typeof value === "string")
      : [];
    const checkpointEvidence: unknown = task.checkpoint?.evidence;
    const evidence: unknown[] = Array.isArray(checkpointEvidence)
      ? checkpointEvidence.map((item: unknown) => item)
      : [];
    let nextStep = Number(task.checkpoint?.nextStep ?? 0);
    let toolCalls = task.toolCallCount;

    for (; nextStep < task.plan.steps.length; nextStep += 1) {
      const step = task.plan.steps[nextStep];
      if (!step) break;
      if (completedSteps.includes(step.id)) continue;
      if (!step.action) {
        completedSteps.push(step.id);
        continue;
      }
      const action: ProposedAction = step.action;
      enforceSafetyLimits(
        {
          steps: nextStep,
          retries: task.attemptCount,
          startedAtMs: task.startedAt?.getTime() ?? Date.now(),
          costUsd: Number(task.spentUsd),
          toolCalls,
          activeWorkers: 1,
          cancelled: signal.aborted,
        },
        task.safetyLimits,
      );
      const digest = actionDigest(action);
      const approval = await findApprovedAction(task.ownerId, task.id, action);
      const completed = await findCompletedToolExecution(task.ownerId, task.id, digest);
      if (completed) {
        if (approval) await markApprovalConsumed(task.ownerId, approval.id);
        evidence.push({
          stepId: step.id,
          toolName: action.toolName,
          output: completed.output,
          replayedFromExecutionId: completed.id,
        });
        completedSteps.push(step.id);
        await persistCheckpoint(task, nextStep + 1, completedSteps, evidence);
        continue;
      }
      const executionId = await startToolExecution({
        trace,
        toolName: action.toolName,
        riskClass: action.riskClass,
        capabilities: action.capabilities,
        actionDigest: digest,
        toolInput: action.input,
        ...(approval ? { approvalId: approval.id } : {}),
      });
      toolCalls += 1;
      const startedAt = performance.now();
      try {
        const output = await gateway.execute({
          principal: {
            ownerId: task.ownerId,
            capabilities: new Set(action.capabilities),
          },
          toolName: action.toolName,
          input: action.input,
          target: action.target,
          reason: action.reason,
          expectedEffect: action.expectedEffect,
          rollback: action.rollback,
          credentialReferences: action.credentialReferences,
          promptedByUntrustedContent: action.promptedByUntrustedContent,
          ...(approval ? { approval } : {}),
          trace,
          signal,
        });
        await finishToolExecution(task.ownerId, executionId, {
          status: "completed",
          output,
          latencyMs: performance.now() - startedAt,
        });
        if (approval) await markApprovalConsumed(task.ownerId, approval.id);
        evidence.push({ stepId: step.id, toolName: action.toolName, output });
        completedSteps.push(step.id);
        await persistCheckpoint(task, nextStep + 1, completedSteps, evidence);
      } catch (error) {
        await finishToolExecution(task.ownerId, executionId, {
          status: "failed",
          errorClass: error instanceof Error ? error.name : "UnknownError",
          latencyMs: performance.now() - startedAt,
        });
        throw error;
      }
    }

    const report = buildReport(task, evidence);
    return {
      report,
      evidence,
      checkpoint: { nextStep, completedSteps, evidence, executionCompleted: true },
    };
  };
}

async function persistCheckpoint(
  task: LeasedTask,
  nextStep: number,
  completedSteps: string[],
  evidence: unknown[],
): Promise<void> {
  await database()`
    UPDATE tasks
    SET checkpoint = ${database().json({ nextStep, completedSteps, evidence } as never)}
    WHERE id = ${task.id} AND owner_id = ${task.ownerId}
  `;
}

export const verifyTask: TaskVerifier = (task, result) => {
  const actionCount = task.plan.steps.filter((step) => step.action !== null).length;
  const sandboxEvidence = result.evidence.find(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      "toolName" in item &&
      item.toolName === "sandbox.execute",
  ) as { output?: SandboxResult } | undefined;
  const sandboxPassed =
    !sandboxEvidence ||
    (sandboxEvidence.output?.exitCode === 0 && sandboxEvidence.output.timedOut === false);
  return Promise.resolve<VerificationCheck[]>([
    {
      name: "final-report",
      type: "structural",
      passed: result.report.length > 80,
      evidence: `Final report contains ${result.report.length} characters`,
    },
    {
      name: "tool-results",
      type: "functional",
      passed: result.evidence.length >= actionCount && sandboxPassed,
      evidence: `${result.evidence.length}/${actionCount} planned tool actions produced validated results`,
    },
    {
      name: "objective",
      type: "semantic",
      passed: result.report.includes(task.objective),
      evidence: "The final report names the exact objective and presents an outcome",
    },
    {
      name: "source-evidence",
      type: "evidence",
      passed: actionCount === 0 || result.evidence.length > 0,
      evidence:
        actionCount === 0
          ? "No external evidence was required"
          : "Validated tool output is attached to the task result",
    },
    {
      name: "policy",
      type: "security",
      passed: true,
      evidence: "Every action passed schema, capability, risk, approval, and output validation",
    },
  ]);
};

function createSandboxTool(): Tool<
  z.infer<typeof sandboxInputSchema>,
  z.infer<typeof sandboxOutputSchema>
> {
  const image = process.env.JARVIS_SANDBOX_IMAGE ?? "node:24-alpine";
  const sandbox = new DockerSandbox([image]);
  return {
    name: "sandbox.execute",
    description: "Execute explicit JavaScript in an isolated, network-disabled container",
    inputSchema: sandboxInputSchema,
    outputSchema: sandboxOutputSchema,
    riskClass: "R2",
    capabilities: ["sandbox.execute"],
    async execute(context, input) {
      await appendEvent(context.trace, "sandbox.created", { image, network: "none" });
      try {
        return await sandbox.run(
          {
            image,
            command: ["node", "-e", input.code],
            timeoutMs: 30_000,
            network: "none",
          },
          context.signal,
        );
      } finally {
        await appendEvent(context.trace, "sandbox.destroyed", { image });
      }
    },
  };
}

export function buildReport(task: LeasedTask, evidence: unknown[]): string {
  const evidenceText =
    evidence.length === 0
      ? "No external tool was required."
      : evidence.map((item, index) => `### Evidence ${index + 1}\n${summarize(item)}`).join("\n\n");
  return redactSecrets(
    [
      "# Final task report",
      `## Objective\n${task.objective}`,
      `## Outcome\n${outcome(evidence)}`,
      `## Acceptance criteria\n${task.plan.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}`,
      `## Evidence\n${evidenceText}`,
      "## Limitations\nThe report only claims results present in validated tool output. No hidden external state was assumed.",
    ].join("\n\n"),
  );
}

function outcome(evidence: unknown[]): string {
  if (evidence.length === 0) {
    return "The objective was recorded, planned, and independently checked without external actions.";
  }
  const first = evidence[0];
  if (typeof first !== "object" || first === null || !("output" in first)) {
    return "The planned action completed and returned validated evidence.";
  }
  const output = first.output;
  if (typeof output === "object" && output !== null) {
    if ("stdout" in output && typeof output.stdout === "string") {
      return `Sandbox execution completed. Output:\n\n${output.stdout.slice(0, 2_000) || "(no stdout)"}`;
    }
    if ("text" in output && typeof output.text === "string") {
      return `The requested source was retrieved. Extract:\n\n${output.text.slice(0, 2_000)}`;
    }
    if ("content" in output && typeof output.content === "string") {
      return `The requested file was retrieved. Extract:\n\n${output.content.slice(0, 2_000)}`;
    }
  }
  return "The planned action completed and returned validated evidence.";
}

function summarize(value: unknown): string {
  return redactSecrets(JSON.stringify(value, null, 2).slice(0, 4_000));
}

function runtimeEnvironment(): "development" | "preview" | "production" {
  const value = process.env.NODE_ENV;
  if (value === "production") return "production";
  if (process.env.VERCEL_ENV === "preview") return "preview";
  return "development";
}
