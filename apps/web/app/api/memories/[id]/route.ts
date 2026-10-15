import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appendEvent, deleteMemory } from "@jarvis/database";
import { assertSameOrigin, requireSession, UnauthorizedError } from "../../../../lib/auth";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin();
    const session = await requireSession();
    const memoryId = z
      .string()
      .uuid()
      .parse((await context.params).id);
    if (!(await deleteMemory(session.ownerId, memoryId))) {
      return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    }
    await appendEvent(
      {
        requestId: request.headers.get("x-request-id") ?? randomUUID(),
        traceId: randomUUID(),
        ownerId: session.ownerId,
      },
      "memory.updated",
      { memoryId, status: "deleted" },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid memory ID" }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to delete memory" }, { status: 500 });
  }
}
