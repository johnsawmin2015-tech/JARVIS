import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appendEvent, cancelTask, getTask, listTaskToolExecutions } from "@jarvis/database";
import { assertSameOrigin, requireSession, UnauthorizedError } from "../../../../lib/auth";

const idSchema = z.string().uuid();

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const taskId = idSchema.parse((await context.params).id);
    const task = await getTask(session.ownerId, taskId);
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    const executions = await listTaskToolExecutions(session.ownerId, taskId);
    return NextResponse.json({ task, executions });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to load task" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin();
    const session = await requireSession();
    const taskId = idSchema.parse((await context.params).id);
    if (!(await cancelTask(session.ownerId, taskId))) {
      return NextResponse.json({ error: "Task cannot be cancelled" }, { status: 409 });
    }
    await appendEvent(
      {
        requestId: request.headers.get("x-request-id") ?? randomUUID(),
        traceId: randomUUID(),
        ownerId: session.ownerId,
        taskId,
      },
      "task.paused",
      { reason: "Cancelled by owner", status: "cancelled" },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to cancel task" }, { status: 500 });
  }
}
