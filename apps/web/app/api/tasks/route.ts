import { createHash, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { planObjective } from "@jarvis/agents";
import { appendEvent, createTask, listTasks } from "@jarvis/database";
import { assertSameOrigin, requireSession, UnauthorizedError } from "../../../lib/auth";

const createTaskSchema = z.object({
  objective: z.string().trim().min(3).max(20_000),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(2_000)).max(100).default([]),
});

export async function GET() {
  try {
    const session = await requireSession();
    return NextResponse.json({ tasks: await listTasks(session.ownerId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof UnauthorizedError ? error.message : "Unable to load tasks" },
      { status: error instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
    const session = await requireSession();
    const input = createTaskSchema.parse(await request.json());
    const suppliedKey = request.headers.get("idempotency-key");
    const idempotencyKey =
      suppliedKey && suppliedKey.length >= 8
        ? suppliedKey.slice(0, 255)
        : createHash("sha256")
            .update(
              `${session.ownerId}:${input.objective}:${JSON.stringify(input.acceptanceCriteria)}`,
            )
            .digest("hex");
    const plan = planObjective(input.objective, input.acceptanceCriteria);
    const approvalAction = plan.steps.find(
      (step) => step.action?.riskClass === "R2" || step.action?.riskClass === "R3",
    )?.action;
    const created = await createTask(session.ownerId, {
      objective: input.objective,
      type: plan.steps.find((step) => step.action)?.action?.toolName ?? "analysis",
      plan,
      idempotencyKey,
      ...(approvalAction ? { approvalAction } : {}),
    });
    const trace = {
      requestId: request.headers.get("x-request-id") ?? randomUUID(),
      traceId: randomUUID(),
      ownerId: session.ownerId,
      taskId: created.taskId,
    };
    await appendEvent(trace, "task.created", {
      objective: input.objective,
      acceptanceCriteria: plan.acceptanceCriteria,
    });
    await appendEvent(trace, "plan.created", { plan });
    if (created.approvalId) {
      await appendEvent(trace, "approval.requested", {
        approvalId: created.approvalId,
        action: approvalAction,
      });
    }
    return NextResponse.json({ ...created, plan }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid task request" }, { status: 400 });
    }
    console.error("Task creation failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Unable to create task" }, { status: 500 });
  }
}
