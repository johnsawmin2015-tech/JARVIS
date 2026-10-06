import { NextResponse } from "next/server";
import { assertSameOrigin, clearSessionCookie } from "../../../../lib/auth";

export async function POST() {
  try {
    await assertSameOrigin();
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
