import { promisify } from "node:util";
import { scrypt, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

const scryptAsync = promisify(scrypt);
const COOKIE_NAME = "jarvis_session";
const sessionSchema = z.object({
  ownerId: z.string().uuid(),
  email: z.string().email(),
});
export type Session = z.infer<typeof sessionSchema>;

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
  return new TextEncoder().encode(value);
}

export async function verifyOwnerPassword(password: string): Promise<boolean> {
  const expectedHex = process.env.OWNER_PASSWORD_HASH;
  const salt = process.env.OWNER_PASSWORD_SALT;
  if (!expectedHex || !salt || password.length > 1_024) return false;
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== 64) return false;
  const actual = (await scryptAsync(password, salt, 64)) as Buffer;
  return timingSafeEqual(actual, expected);
}

export async function createSessionToken(session: Session): Promise<string> {
  const parsed = sessionSchema.parse(session);
  return new SignJWT(parsed)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setIssuer("jarvis")
    .setAudience("jarvis-web")
    .setExpirationTime("12h")
    .sign(secret());
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const verified = await jwtVerify(token, secret(), {
      issuer: "jarvis",
      audience: "jarvis-web",
      algorithms: ["HS256"],
    });
    return sessionSchema.parse(verified.payload);
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

export async function assertSameOrigin(): Promise<void> {
  const incoming = await headers();
  const origin = incoming.get("origin");
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
  if (!origin || !host) throw new Error("Missing origin headers");
  const parsed = new URL(origin);
  if (parsed.host !== host) throw new Error("Cross-origin request rejected");
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "UnauthorizedError";
  }
}
