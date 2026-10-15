import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appendEvent, createMemory, searchMemories } from "@jarvis/database";
import { assertSameOrigin, requireSession, UnauthorizedError } from "../../../lib/auth";

const memoryInputSchema = z.object({
  content: z.string().trim().min(1).max(100_000),
  type: z
    .enum(["episodic", "semantic", "project", "goal", "preference", "execution"])
    .default("semantic"),
  projectId: z.string().uuid().nullable().default(null),
  confidence: z.number().min(0.5).max(1).default(1),
  importance: z.number().min(0).max(1).default(0.5),
  sensitivity: z.enum(["public", "personal", "confidential", "restricted"]).default("personal"),
  scope: z.enum(["conversation", "project", "owner"]).default("owner"),
  expiresAt: z.string().datetime().nullable().default(null),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const query = request.nextUrl.searchParams.get("q")?.slice(0, 500) ?? "";
    return NextResponse.json({ memories: await searchMemories(session.ownerId, query) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof UnauthorizedError ? error.message : "Unable to load memories" },
      { status: error instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
    const session = await requireSession();
    const input = memoryInputSchema.parse(await request.json());
    const sourceId = `owner:${randomUUID()}`;
    const trace = {
      requestId: request.headers.get("x-request-id") ?? randomUUID(),
      traceId: randomUUID(),
      ownerId: session.ownerId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
    };
    await appendEvent(trace, "memory.candidate_created", {
      sourceType: "user",
      sourceId,
      type: input.type,
    });
    const memoryId = await createMemory(session.ownerId, {
      ...input,
      sourceId,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    });
    await appendEvent(trace, "memory.stored", {
      memoryId,
      sourceType: "user",
      sourceId,
      verified: true,
    });
    return NextResponse.json({ memoryId }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid memory request" }, { status: 400 });
    }
    console.error("Memory storage failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Unable to store memory" }, { status: 500 });
  }
}
