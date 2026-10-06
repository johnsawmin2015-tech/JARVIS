import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ensureOwner } from "@jarvis/database";
import {
  assertSameOrigin,
  createSessionToken,
  setSessionCookie,
  verifyOwnerPassword,
} from "../../../../lib/auth";

export const runtime = "nodejs";

const inputSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(1_024),
});
const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const now = Date.now();
    const current = attempts.get(ip);
    if (current && current.resetAt > now && current.count >= 5) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const input = inputSchema.parse(await request.json());
    const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase();
    const validEmail = ownerEmail !== undefined && input.email.toLowerCase() === ownerEmail;
    const validPassword = await verifyOwnerPassword(input.password);
    if (!validEmail || !validPassword) {
      attempts.set(ip, {
        count: current && current.resetAt > now ? current.count + 1 : 1,
        resetAt: now + 15 * 60_000,
      });
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    attempts.delete(ip);
    const owner = await ensureOwner(input.email);
    const token = await createSessionToken({ ownerId: owner.id, email: owner.email });
    await setSessionCookie(token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("Authentication failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Authentication unavailable" }, { status: 500 });
  }
}
