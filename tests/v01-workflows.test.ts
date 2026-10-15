import { describe, expect, it } from "vitest";
import { planObjective, planSchema } from "@jarvis/agents";
import { actionDigest, evaluatePolicy } from "@jarvis/security";
import { buildReport, verifyTask } from "../services/worker/src/runtime";
import type { LeasedTask, TaskExecutionResult } from "../services/worker/src/index";

const ownerId = "3c60552d-1393-45eb-9dcf-dbe5e71312f6";

describe("natural-language task planning", () => {
  it("turns a public URL objective into a typed, executable plan", () => {
    const plan = planObjective("Research https://example.com/reference and report the evidence");
    expect(planSchema.parse(plan)).toEqual(plan);
    expect(plan.steps[0]?.action).toMatchObject({
      toolName: "web.fetch",
      riskClass: "R0",
      capabilities: ["web.fetch"],
      input: { url: "https://example.com/reference" },
    });
    expect(plan.acceptanceCriteria.length).toBeGreaterThan(0);
  });

  it("extracts a GitHub blob read without granting write capability", () => {
    const plan = planObjective(
      "Inspect https://github.com/acme/widgets/blob/main/src/index.ts and explain it",
    );
    expect(plan.steps[0]?.action).toMatchObject({
      toolName: "github.file.read",
      riskClass: "R0",
      capabilities: ["repo.read"],
      input: {
        owner: "acme",
        repository: "widgets",
        reference: "main",
        path: "src/index.ts",
      },
    });
  });

  it("requires exact approval for sandbox execution", () => {
    const plan = planObjective("sandbox: console.log(6 * 7)");
    const action = plan.steps[0]?.action;
    expect(action).not.toBeNull();
    if (!action) throw new Error("Expected sandbox action");
    expect(action.riskClass).toBe("R2");
    expect(
      evaluatePolicy({ ownerId, capabilities: new Set(action.capabilities) }, action).decision,
    ).toBe("approval_required");
    expect(actionDigest(action)).toHaveLength(64);
  });
});

describe("durable final reporting and verification", () => {
  const plan = planObjective("sandbox: console.log('safe')");
  const task: LeasedTask = {
    id: "0f0ee706-12c7-4f3c-a7bf-eebcf4bf5822",
    ownerId,
    objective: plan.objective,
    status: "running",
    attemptCount: 0,
    safetyLimits: {
      maxSteps: 100,
      maxRetries: 5,
      maxDurationMs: 3_600_000,
      maxCostUsd: 2,
      maxToolCalls: 100,
      maxConcurrentWorkers: 1,
    },
    retryPolicy: {
      maxAttempts: 5,
      initialDelayMs: 1_000,
      maxDelayMs: 60_000,
      multiplier: 2,
    },
    plan,
    checkpoint: null,
    toolCallCount: 0,
    spentUsd: "0",
    createdAt: new Date(),
    startedAt: new Date(),
  };

  it("builds an evidence-based report and redacts credentials", () => {
    const evidence = [
      {
        stepId: "execute",
        toolName: "sandbox.execute",
        output: {
          exitCode: 0,
          stdout: "safe",
          stderr: "api_key=abcdefghijklmnop",
          timedOut: false,
        },
      },
    ];
    const report = buildReport(task, evidence);
    expect(report).toContain(task.objective);
    expect(report).toContain("safe");
    expect(report).not.toContain("abcdefghijklmnop");
    expect(report).toContain("[REDACTED]");
  });

  it("independently rejects a failed sandbox result", async () => {
    const result: TaskExecutionResult = {
      report: buildReport(task, [
        {
          stepId: "execute",
          toolName: "sandbox.execute",
          output: { exitCode: 1, stdout: "", stderr: "failed", timedOut: false },
        },
      ]),
      evidence: [
        {
          stepId: "execute",
          toolName: "sandbox.execute",
          output: { exitCode: 1, stdout: "", stderr: "failed", timedOut: false },
        },
      ],
      checkpoint: { nextStep: 2 },
    };
    const checks = await verifyTask(task, result, new AbortController().signal);
    expect(checks.find((check) => check.name === "tool-results")?.passed).toBe(false);
  });
});
