import { randomUUID } from "node:crypto";
import type { Plan } from "@jarvis/agents";
import { actionDigest, type Approval, type ProposedAction } from "@jarvis/security";
import type { EventFamily, TaskStatus, TraceContext } from "@jarvis/shared";

export const DEMO_OWNER_ID = "00000000-0000-4000-8000-000000000001";

export function isDemoMode(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (environment.DEMO_MODE !== "true") return false;
  if (environment.NODE_ENV === "production") {
    throw new Error("DEMO_MODE=true is forbidden when NODE_ENV=production");
  }
  return true;
}

interface DemoTask {
  id: string;
  ownerId: string;
  objective: string;
  status: TaskStatus;
  priority: number;
  riskClass: string;
  verificationStatus: string;
  acceptanceCriteria: string[];
  plan: Plan | null;
  finalReport: string | null;
  failureReason: string | null;
  toolCallCount: number;
  spentUsd: string;
  createdAt: Date;
  completedAt: Date | null;
}

interface DemoMemory {
  id: string;
  ownerId: string;
  projectId: string | null;
  type: "working" | "episodic" | "semantic" | "project" | "goal" | "preference" | "execution";
  content: string;
  sourceType: "user" | "model" | "tool" | "document" | "system";
  sourceId: string;
  sourceTimestamp: Date;
  confidence: number;
  importance: number;
  sensitivity: "public" | "personal" | "confidential" | "restricted";
  scope: "conversation" | "project" | "owner";
  status: "candidate" | "validated" | "stored" | "archived" | "deleted";
  verified: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DemoApproval {
  id: string;
  ownerId: string;
  taskId: string | null;
  actionDigest: string;
  action: ProposedAction;
  status: Approval["status"];
  requestedAt: Date;
  resolvedAt: Date | null;
  expiresAt: Date;
  resolutionReason: string | null;
}

interface DemoEvent {
  id: string;
  ownerId: string;
  family: EventFamily;
  payload: unknown;
  requestId: string;
  traceId: string;
  occurredAt: Date;
}

interface DemoToolExecution {
  id: string;
  ownerId: string;
  taskId: string | null;
  toolName: string;
  actionDigest: string;
  status: string;
  input: unknown;
  output: unknown;
  latencyMs: number | null;
  errorClass: string | null;
  createdAt: Date;
}

interface DemoStore {
  conversations: Array<{
    id: string;
    ownerId: string;
    title: string;
    createdAt: Date;
  }>;
  messages: Array<{
    id: string;
    ownerId: string;
    conversationId: string;
    role: "user" | "assistant" | "system" | "tool";
    content: unknown;
    createdAt: Date;
  }>;
  tasks: DemoTask[];
  memories: DemoMemory[];
  approvals: DemoApproval[];
  events: DemoEvent[];
  artifacts: Array<{
    id: string;
    ownerId: string;
    title: string;
    detail: string;
    status: string;
    occurredAt: Date;
  }>;
  projects: Array<{
    id: string;
    ownerId: string;
    title: string;
    detail: string;
    status: string;
    occurredAt: Date;
  }>;
  toolExecutions: DemoToolExecution[];
  usage: {
    modelExecutions: number;
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
  };
  sequence: number;
}

const globalDemo = globalThis as typeof globalThis & {
  __jarvisDemoStore?: DemoStore;
};

export function resetDemoStore(): void {
  globalDemo.__jarvisDemoStore = seedStore();
}

export function demoEnsureOwner(email: string) {
  const configuredEmail = process.env.OWNER_EMAIL?.toLowerCase();
  if (!configuredEmail || email.toLowerCase() !== configuredEmail) {
    throw new Error("Demo account does not match configured owner");
  }
  return Promise.resolve({
    id: DEMO_OWNER_ID,
    email: configuredEmail,
    displayName: "Demo Owner",
  });
}

export function demoCreateConversation(ownerId: string, title: string): Promise<string> {
  assertOwner(ownerId);
  const value = {
    id: randomUUID(),
    ownerId,
    title: title.slice(0, 200),
    createdAt: new Date(),
  };
  store().conversations.push(value);
  return Promise.resolve(value.id);
}

export function demoSaveMessage(
  ownerId: string,
  conversationId: string,
  role: "user" | "assistant" | "system" | "tool",
  content: unknown,
): Promise<void> {
  assertOwner(ownerId);
  if (
    !store().conversations.some((item) => item.id === conversationId && item.ownerId === ownerId)
  ) {
    throw new Error("Conversation not found");
  }
  store().messages.push({
    id: randomUUID(),
    ownerId,
    conversationId,
    role,
    content,
    createdAt: new Date(),
  });
  return Promise.resolve();
}

export function demoListTasks(ownerId: string, limit: number): Promise<DemoTask[]> {
  if (ownerId !== DEMO_OWNER_ID) return Promise.resolve([]);
  return Promise.resolve(
    store()
      .tasks.filter((task) => task.ownerId === ownerId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, limit)
      .map(cloneTask),
  );
}

export function demoCreateTask(
  ownerId: string,
  task: {
    objective: string;
    plan: Plan;
    approvalAction?: ProposedAction;
  },
): Promise<{ taskId: string; approvalId: string | null }> {
  assertOwner(ownerId);
  const now = new Date();
  const taskId = randomUUID();
  const requiresApproval = task.approvalAction !== undefined;
  const row: DemoTask = {
    id: taskId,
    ownerId,
    objective: task.objective,
    status: requiresApproval ? "waiting_approval" : "completed",
    priority: 50,
    riskClass: task.plan.riskClass,
    verificationStatus: requiresApproval ? "pending" : "passed",
    acceptanceCriteria: [...task.plan.acceptanceCriteria],
    plan: structuredClone(task.plan),
    finalReport: requiresApproval ? null : demoFinalReport(task.objective, "No external tool ran."),
    failureReason: null,
    toolCallCount: 0,
    spentUsd: "0",
    createdAt: now,
    completedAt: requiresApproval ? null : now,
  };
  store().tasks.push(row);
  if (!task.approvalAction) {
    addDemoArtifact(taskId, task.objective, now);
    return Promise.resolve({ taskId, approvalId: null });
  }
  const approvalId = randomUUID();
  store().approvals.push({
    id: approvalId,
    ownerId,
    taskId,
    actionDigest: actionDigest(task.approvalAction),
    action: structuredClone(task.approvalAction),
    status: "pending",
    requestedAt: now,
    resolvedAt: null,
    expiresAt: new Date(now.getTime() + 30 * 60_000),
    resolutionReason: null,
  });
  return Promise.resolve({ taskId, approvalId });
}

export function demoGetTask(ownerId: string, taskId: string): Promise<DemoTask | undefined> {
  if (ownerId !== DEMO_OWNER_ID) return Promise.resolve(undefined);
  const task = store().tasks.find((item) => item.id === taskId && item.ownerId === ownerId);
  return Promise.resolve(task ? cloneTask(task) : undefined);
}

export function demoCancelTask(ownerId: string, taskId: string): Promise<boolean> {
  if (ownerId !== DEMO_OWNER_ID) return Promise.resolve(false);
  const task = store().tasks.find((item) => item.id === taskId && item.ownerId === ownerId);
  if (!task || isTerminal(task.status)) return Promise.resolve(false);
  task.status = "cancelled";
  task.completedAt = new Date();
  return Promise.resolve(true);
}

export function demoAppendEvent(
  trace: TraceContext,
  family: EventFamily,
  payload: unknown,
): Promise<void> {
  assertOwner(trace.ownerId);
  const state = store();
  state.sequence += 1;
  state.events.push({
    id: String(state.sequence),
    ownerId: trace.ownerId,
    family,
    payload: structuredClone(payload),
    requestId: trace.requestId,
    traceId: trace.traceId,
    occurredAt: new Date(),
  });
  return Promise.resolve();
}

export function demoListEvents(ownerId: string, limit: number): Promise<DemoEvent[]> {
  if (ownerId !== DEMO_OWNER_ID) return Promise.resolve([]);
  return Promise.resolve(
    store()
      .events.filter((event) => event.ownerId === ownerId)
      .slice(-limit)
      .reverse()
      .map((event) => ({ ...event, payload: structuredClone(event.payload) })),
  );
}

export function demoUsageSummary(ownerId: string) {
  assertOwner(ownerId);
  const usage = store().usage;
  return Promise.resolve({
    totalCostUsd: usage.totalCostUsd.toFixed(8),
    modelExecutions: usage.modelExecutions,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  });
}

export function demoCurrentBudgetUsage(ownerId: string) {
  assertOwner(ownerId);
  return Promise.resolve({ dailyUsd: 0, monthlyUsd: 0 });
}

export function demoRecordModelExecution(
  ownerId: string,
  inputTokens: number,
  outputTokens: number,
  estimatedCostUsd: number,
): Promise<void> {
  assertOwner(ownerId);
  const usage = store().usage;
  usage.modelExecutions += 1;
  usage.inputTokens += inputTokens;
  usage.outputTokens += outputTokens;
  usage.totalCostUsd += estimatedCostUsd;
  return Promise.resolve();
}

export function demoListProjects(ownerId: string) {
  if (ownerId !== DEMO_OWNER_ID) return Promise.resolve([]);
  return Promise.resolve(
    store().projects.map((project) => ({
      id: project.id,
      title: project.title,
      detail: project.detail,
      status: project.status,
      occurredAt: project.occurredAt,
    })),
  );
}

export function demoListArtifacts(ownerId: string) {
  if (ownerId !== DEMO_OWNER_ID) return Promise.resolve([]);
  return Promise.resolve(
    store().artifacts.map((artifact) => ({
      id: artifact.id,
      title: artifact.title,
      detail: artifact.detail,
      status: artifact.status,
      occurredAt: artifact.occurredAt,
    })),
  );
}

export function demoCreateMemory(
  ownerId: string,
  memory: Omit<
    DemoMemory,
    | "id"
    | "ownerId"
    | "sourceType"
    | "sourceTimestamp"
    | "status"
    | "verified"
    | "createdAt"
    | "updatedAt"
  >,
): Promise<string> {
  assertOwner(ownerId);
  const now = new Date();
  const id = randomUUID();
  store().memories.push({
    ...structuredClone(memory),
    id,
    ownerId,
    sourceType: "user",
    sourceTimestamp: now,
    status: "stored",
    verified: true,
    createdAt: now,
    updatedAt: now,
  });
  return Promise.resolve(id);
}

export function demoSearchMemories(ownerId: string, query: string, limit: number) {
  if (ownerId !== DEMO_OWNER_ID) return Promise.resolve([]);
  const normalized = query.toLowerCase();
  return Promise.resolve(
    store()
      .memories.filter(
        (memory) =>
          memory.ownerId === ownerId &&
          memory.status === "stored" &&
          (!normalized || memory.content.toLowerCase().includes(normalized)),
      )
      .sort((left, right) => right.importance - left.importance)
      .slice(0, limit)
      .map((memory) => ({ ...memory })),
  );
}

export function demoDeleteMemory(ownerId: string, memoryId: string): Promise<boolean> {
  if (ownerId !== DEMO_OWNER_ID) return Promise.resolve(false);
  const memory = store().memories.find(
    (item) => item.id === memoryId && item.ownerId === ownerId && item.status !== "deleted",
  );
  if (!memory) return Promise.resolve(false);
  memory.status = "deleted";
  memory.content = "[deleted]";
  memory.updatedAt = new Date();
  return Promise.resolve(true);
}

export function demoListApprovals(ownerId: string) {
  if (ownerId !== DEMO_OWNER_ID) return Promise.resolve([]);
  const now = Date.now();
  for (const approval of store().approvals) {
    if (approval.status === "pending" && approval.expiresAt.getTime() <= now) {
      approval.status = "expired";
      approval.resolvedAt = new Date();
      approval.resolutionReason = "Approval expired";
    }
  }
  return Promise.resolve(
    store()
      .approvals.filter((approval) => approval.ownerId === ownerId)
      .sort((left, right) => right.requestedAt.getTime() - left.requestedAt.getTime())
      .map((approval) => ({
        id: approval.id,
        taskId: approval.taskId,
        title: approval.action.toolName,
        detail: approval.action.expectedEffect,
        status: approval.status,
        occurredAt: approval.requestedAt,
        action: structuredClone(approval.action),
        expiresAt: approval.expiresAt,
        resolutionReason: approval.resolutionReason,
      })),
  );
}

export function demoResolveApproval(
  ownerId: string,
  approvalId: string,
  decision: "approved" | "denied",
  reason: string,
) {
  if (ownerId !== DEMO_OWNER_ID) return Promise.resolve(undefined);
  const approval = store().approvals.find(
    (item) => item.id === approvalId && item.ownerId === ownerId && item.status === "pending",
  );
  if (!approval || approval.expiresAt.getTime() <= Date.now()) return Promise.resolve(undefined);
  approval.status = decision === "approved" ? "consumed" : "denied";
  approval.resolvedAt = new Date();
  approval.resolutionReason = reason;
  const task = approval.taskId
    ? store().tasks.find((item) => item.id === approval.taskId && item.ownerId === ownerId)
    : undefined;
  if (task) {
    task.status = decision === "approved" ? "completed" : "denied";
    task.verificationStatus = decision === "approved" ? "passed" : "failed";
    task.failureReason = decision === "denied" ? reason : null;
    task.completedAt = new Date();
    if (decision === "approved") {
      task.finalReport = demoFinalReport(
        task.objective,
        "The exact action was approved. Demo mode simulated completion; no sandbox, network, worker, or external system was invoked.",
      );
      addDemoArtifact(task.id, task.objective, task.completedAt);
    }
  }
  return Promise.resolve({
    id: approval.id,
    taskId: approval.taskId,
    status: decision,
    action: structuredClone(approval.action),
  });
}

export function demoFindApprovedAction(
  ownerId: string,
  taskId: string,
  action: ProposedAction,
): Promise<Approval | undefined> {
  if (ownerId !== DEMO_OWNER_ID) return Promise.resolve(undefined);
  const digest = actionDigest(action);
  const approval = store().approvals.find(
    (item) =>
      item.ownerId === ownerId &&
      item.taskId === taskId &&
      item.actionDigest === digest &&
      item.status === "approved" &&
      item.expiresAt.getTime() > Date.now(),
  );
  return Promise.resolve(
    approval
      ? {
          id: approval.id,
          ownerId,
          actionDigest: approval.actionDigest,
          status: approval.status,
          requestedAt: approval.requestedAt.toISOString(),
          resolvedAt: approval.resolvedAt?.toISOString() ?? null,
          expiresAt: approval.expiresAt.toISOString(),
        }
      : undefined,
  );
}

export function demoMarkApprovalConsumed(ownerId: string, approvalId: string): Promise<void> {
  assertOwner(ownerId);
  const approval = store().approvals.find(
    (item) => item.id === approvalId && item.ownerId === ownerId,
  );
  if (approval?.status === "approved") approval.status = "consumed";
  return Promise.resolve();
}

export function demoStartToolExecution(input: {
  ownerId: string;
  taskId?: string;
  toolName: string;
  digest: string;
  toolInput: unknown;
}): Promise<string> {
  assertOwner(input.ownerId);
  const id = randomUUID();
  store().toolExecutions.push({
    id,
    ownerId: input.ownerId,
    taskId: input.taskId ?? null,
    toolName: input.toolName,
    actionDigest: input.digest,
    status: "running",
    input: structuredClone(input.toolInput),
    output: null,
    latencyMs: null,
    errorClass: null,
    createdAt: new Date(),
  });
  return Promise.resolve(id);
}

export function demoFinishToolExecution(
  ownerId: string,
  executionId: string,
  result:
    | { status: "completed"; output: unknown; latencyMs: number }
    | { status: "failed"; errorClass: string; latencyMs: number },
): Promise<void> {
  assertOwner(ownerId);
  const execution = store().toolExecutions.find(
    (item) => item.id === executionId && item.ownerId === ownerId,
  );
  if (execution) {
    execution.status = result.status;
    execution.output = result.status === "completed" ? structuredClone(result.output) : null;
    execution.errorClass = result.status === "failed" ? result.errorClass : null;
    execution.latencyMs = result.latencyMs;
  }
  return Promise.resolve();
}

export function demoFindCompletedToolExecution(ownerId: string, taskId: string, digest: string) {
  if (ownerId !== DEMO_OWNER_ID) return Promise.resolve(undefined);
  const execution = store().toolExecutions.find(
    (item) =>
      item.ownerId === ownerId &&
      item.taskId === taskId &&
      item.actionDigest === digest &&
      item.status === "completed",
  );
  return Promise.resolve(
    execution ? { id: execution.id, output: structuredClone(execution.output) } : undefined,
  );
}

export function demoListTaskToolExecutions(ownerId: string, taskId: string) {
  if (ownerId !== DEMO_OWNER_ID) return Promise.resolve([]);
  return Promise.resolve(
    store()
      .toolExecutions.filter((item) => item.ownerId === ownerId && item.taskId === taskId)
      .map((item) => ({
        id: item.id,
        toolName: item.toolName,
        status: item.status,
        input: structuredClone(item.input),
        output: structuredClone(item.output),
        latencyMs: item.latencyMs,
        errorClass: item.errorClass,
        createdAt: item.createdAt,
      })),
  );
}

function store(): DemoStore {
  globalDemo.__jarvisDemoStore ??= seedStore();
  return globalDemo.__jarvisDemoStore;
}

function seedStore(): DemoStore {
  const now = new Date();
  const completedTaskId = "00000000-0000-4000-8000-000000000101";
  return {
    conversations: [],
    messages: [],
    tasks: [
      {
        id: completedTaskId,
        ownerId: DEMO_OWNER_ID,
        objective: "Review the JARVIS local demo workspace",
        status: "completed",
        priority: 50,
        riskClass: "R0",
        verificationStatus: "passed",
        acceptanceCriteria: ["Demo workflows are clearly labeled"],
        plan: null,
        finalReport: demoFinalReport(
          "Review the JARVIS local demo workspace",
          "The process-local demo store is active and no database or provider was contacted.",
        ),
        failureReason: null,
        toolCallCount: 0,
        spentUsd: "0",
        createdAt: new Date(now.getTime() - 10 * 60_000),
        completedAt: new Date(now.getTime() - 9 * 60_000),
      },
    ],
    memories: [
      {
        id: "00000000-0000-4000-8000-000000000201",
        ownerId: DEMO_OWNER_ID,
        projectId: null,
        type: "preference",
        content: "Demo data is process-local and resets when the development server restarts.",
        sourceType: "system",
        sourceId: "demo-seed",
        sourceTimestamp: now,
        confidence: 1,
        importance: 1,
        sensitivity: "public",
        scope: "owner",
        status: "stored",
        verified: true,
        expiresAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    approvals: [],
    events: [
      {
        id: "1",
        ownerId: DEMO_OWNER_ID,
        family: "verification.passed",
        payload: { demo: true, taskId: completedTaskId },
        requestId: "demo-seed",
        traceId: "demo-seed",
        occurredAt: now,
      },
    ],
    artifacts: [
      {
        id: "00000000-0000-4000-8000-000000000301",
        ownerId: DEMO_OWNER_ID,
        title: "Demo final task report",
        detail: "text/markdown · process-local",
        status: "created",
        occurredAt: now,
      },
    ],
    projects: [
      {
        id: "00000000-0000-4000-8000-000000000401",
        ownerId: DEMO_OWNER_ID,
        title: "Local JARVIS Demo",
        detail: "Ephemeral workspace for exploring v0.1 workflows without infrastructure.",
        status: "demo",
        occurredAt: now,
      },
    ],
    toolExecutions: [],
    usage: { modelExecutions: 0, inputTokens: 0, outputTokens: 0, totalCostUsd: 0 },
    sequence: 1,
  };
}

function assertOwner(ownerId: string): void {
  if (ownerId !== DEMO_OWNER_ID) throw new Error("Demo owner boundary violation");
}

function cloneTask(task: DemoTask): DemoTask {
  return {
    ...task,
    acceptanceCriteria: [...task.acceptanceCriteria],
    plan: task.plan ? structuredClone(task.plan) : null,
  };
}

function isTerminal(status: TaskStatus): boolean {
  return ["completed", "failed", "cancelled", "denied", "expired"].includes(status);
}

function demoFinalReport(objective: string, outcome: string): string {
  return [
    "# DEMO MODE — simulated final report",
    `## Objective\n${objective}`,
    `## Outcome\n${outcome}`,
    "## Limitations\nThis is process-local demo output. It is not evidence of a model call, tool execution, sandbox run, database write, or external action.",
  ].join("\n\n");
}

function addDemoArtifact(taskId: string, objective: string, occurredAt: Date): void {
  store().artifacts.push({
    id: randomUUID(),
    ownerId: DEMO_OWNER_ID,
    title: `Demo report: ${objective.slice(0, 80)}`,
    detail: `text/markdown · task ${taskId}`,
    status: "created",
    occurredAt,
  });
}
