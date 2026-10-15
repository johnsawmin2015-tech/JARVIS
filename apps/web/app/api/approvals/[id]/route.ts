import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appendEvent, resolveApproval } from "@jarvis/database";
import { assertSameOrigin, requireSession, UnauthorizedError } from "../../../../lib/auth";

const inputSchema = z.object({
  decision: z.enum(["approved", "denied"]),
  reason: z.string().trim().min(3).max(2_000),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin();
    const session = await requireSession();
    const approvalId = z
      .string()
      .uuid()
      .parse((await context.params).id);
    const input = inputSchema.parse(await request.json());
    const resolution = await resolveApproval(
      session.ownerId,
      approvalId,
      input.decision,
      input.reason,
    );
    if (!resolution) {
      return NextResponse.json(
        { error: "Approval not found, expired, or already resolved" },
        { status: 409 },
      );
    }
    await appendEvent(
      {
        requestId: request.headers.get("x-request-id") ?? randomUUID(),
        traceId: randomUUID(),
        ownerId: session.ownerId,
        ...(resolution.taskId ? { taskId: resolution.taskId } : {}),
      },
      "approval.resolved",
      {
        approvalId,
        decision: resolution.status,
        action: resolution.action,
        reason: input.reason,
      },
    );
    return NextResponse.json({ resolution });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid approval resolution" }, { status: 400 });
    }
    console.error(
      "Approval resolution failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return NextResponse.json({ error: "Unable to resolve approval" }, { status: 500 });
  }
}
