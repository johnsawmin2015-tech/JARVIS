import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { planObjective } from "@jarvis/agents";
import {
  cancelTask,
  createMemory,
  createTask,
  DEMO_OWNER_ID,
  ensureOwner,
  getTask,
  isDemoMode,
  listApprovals,
  listTasks,
  resetDemoStore,
  resolveApproval,
  searchMemories,
} from "@jarvis/database";
import {
  createDemoChatText,
  createDemoTextStreamResponse,
  shouldUseDemoChat,
} from "../apps/web/lib/demo-chat";
import { verifyOwnerPassword } from "../apps/web/lib/auth";

const originalEnvironment = {
  demoMode: process.env.DEMO_MODE,
  nodeEnv: process.env.NODE_ENV,
  ownerEmail: process.env.OWNER_EMAIL,
  databaseUrl: process.env.DATABASE_URL,
  demoPassword: process.env.DEMO_PASSWORD,
};

beforeEach(() => {
  setEnvironment("DEMO_MODE", "true");
  setEnvironment("NODE_ENV", "test");
  setEnvironment("OWNER_EMAIL", "demo@jarvis.local");
  setEnvironment("DEMO_PASSWORD", "local-test-password");
  delete process.env.DATABASE_URL;
  resetDemoStore();
});

afterEach(() => {
  restore("DEMO_MODE", originalEnvironment.demoMode);
  restore("NODE_ENV", originalEnvironment.nodeEnv);
  restore("OWNER_EMAIL", originalEnvironment.ownerEmail);
  restore("DATABASE_URL", originalEnvironment.databaseUrl);
  restore("DEMO_PASSWORD", originalEnvironment.demoPassword);
});

describe("explicit demo gating", () => {
  it("requires the exact flag and fails closed in production", () => {
    expect(isDemoMode({ DEMO_MODE: undefined, NODE_ENV: "development" })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "false", NODE_ENV: "development" })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "true", NODE_ENV: "development" })).toBe(true);
    expect(() => isDemoMode({ DEMO_MODE: "true", NODE_ENV: "production" })).toThrow("forbidden");
  });

  it("uses a stable valid owner identity without a database", async () => {
    const first = await ensureOwner("demo@jarvis.local");
    const second = await ensureOwner("demo@jarvis.local");
    expect(first.id).toBe(DEMO_OWNER_ID);
    expect(second.id).toBe(DEMO_OWNER_ID);
    expect(DEMO_OWNER_ID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(await verifyOwnerPassword("local-test-password")).toBe(true);
    expect(await verifyOwnerPassword("wrong-password")).toBe(false);
  });
});

describe("process-local demo data", () => {
  it("enforces owner isolation and supports memory CRUD", async () => {
    const memoryId = await createMemory(DEMO_OWNER_ID, {
      projectId: null,
      type: "semantic",
      content: "Owner-only demo fact",
      sourceId: "test",
      confidence: 1,
      importance: 0.8,
      sensitivity: "personal",
      scope: "owner",
      expiresAt: null,
    });
    expect((await searchMemories(DEMO_OWNER_ID, "demo fact"))[0]?.id).toBe(memoryId);
    expect(await searchMemories("00000000-0000-4000-8000-000000000099", "demo")).toEqual([]);
  });

  it("supports task, approval, resolution, and cancellation workflows", async () => {
    const sandboxPlan = planObjective("sandbox: console.log('demo')");
    const action = sandboxPlan.steps[0]?.action;
    if (!action) throw new Error("Expected sandbox action");
    const created = await createTask(DEMO_OWNER_ID, {
      objective: sandboxPlan.objective,
      type: "sandbox.execute",
      plan: sandboxPlan,
      idempotencyKey: "demo-test-approval",
      approvalAction: action,
    });
    expect((await getTask(DEMO_OWNER_ID, created.taskId))?.status).toBe("waiting_approval");
    expect((await listApprovals(DEMO_OWNER_ID))[0]?.id).toBe(created.approvalId);
    await resolveApproval(DEMO_OWNER_ID, created.approvalId!, "approved", "Approved in test");
    const completed = await getTask(DEMO_OWNER_ID, created.taskId);
    expect(completed?.status).toBe("completed");
    expect(completed?.finalReport).toContain("simulated");

    const pending = await createTask(DEMO_OWNER_ID, {
      objective: sandboxPlan.objective,
      type: "sandbox.execute",
      plan: sandboxPlan,
      idempotencyKey: "demo-test-cancel",
      approvalAction: action,
    });
    expect(await cancelTask(DEMO_OWNER_ID, pending.taskId)).toBe(true);
    expect((await listTasks(DEMO_OWNER_ID)).some((task) => task.status === "cancelled")).toBe(true);
  });
});

describe("no-provider demo chat", () => {
  it("selects deterministic demo output only when demo is explicit and providers are absent", async () => {
    expect(shouldUseDemoChat(true, false)).toBe(true);
    expect(shouldUseDemoChat(false, false)).toBe(false);
    expect(shouldUseDemoChat(true, true)).toBe(false);
    const text = createDemoChatText("Hello JARVIS");
    expect(text).toContain("DEMO OUTPUT");
    expect(text).toContain("no AI model");
    const response = createDemoTextStreamResponse(text, { "x-request-id": "test" });
    expect(response.headers.get("x-jarvis-demo")).toBe("true");
    expect(await response.text()).toBe(text);
  });
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function setEnvironment(name: string, value: string): void {
  process.env[name] = value;
}
