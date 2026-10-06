import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { capabilitySchema, riskClassSchema, type Capability, type RiskClass } from "@jarvis/shared";

export const actionSchema = z.object({
  toolName: z.string().min(1).max(100),
  target: z.string().min(1).max(2_000),
  reason: z.string().min(1).max(2_000),
  input: z.unknown(),
  expectedEffect: z.string().min(1).max(2_000),
  riskClass: riskClassSchema,
  capabilities: z.array(capabilitySchema),
  credentialReferences: z.array(z.string().max(255)),
  rollback: z.string().max(2_000).nullable(),
  promptedByUntrustedContent: z.boolean(),
});
export type ProposedAction = z.infer<typeof actionSchema>;

export interface Principal {
  ownerId: string;
  capabilities: ReadonlySet<Capability>;
}

export type PolicyDecision =
  | { decision: "allow"; reason: string }
  | { decision: "approval_required"; reason: string }
  | { decision: "deny"; reason: string };

export function evaluatePolicy(principal: Principal, actionInput: ProposedAction): PolicyDecision {
  const action = actionSchema.parse(actionInput);
  const missing = action.capabilities.filter(
    (capability) => !principal.capabilities.has(capability),
  );
  if (missing.length > 0) {
    return { decision: "deny", reason: `Missing capabilities: ${missing.join(", ")}` };
  }
  if (action.riskClass === "R3") {
    return { decision: "approval_required", reason: "R3 actions always require explicit approval" };
  }
  if (action.promptedByUntrustedContent && action.riskClass !== "R0") {
    return {
      decision: "approval_required",
      reason: "An untrusted source influenced a modifying action",
    };
  }
  if (action.riskClass === "R2") {
    return { decision: "approval_required", reason: "External modification requires approval" };
  }
  return { decision: "allow", reason: "Capabilities granted and risk is within automatic policy" };
}

export const approvalSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  actionDigest: z.string().length(64),
  status: z.enum(["pending", "approved", "denied", "expired", "consumed"]),
  requestedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime(),
});
export type Approval = z.infer<typeof approvalSchema>;

export function actionDigest(actionInput: ProposedAction): string {
  const action = actionSchema.parse(actionInput);
  return createHash("sha256").update(stableStringify(action)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === undefined) return '"[undefined]"';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function consumeApproval(
  approvalInput: Approval,
  ownerId: string,
  action: ProposedAction,
  now: Date,
): Approval {
  const approval = approvalSchema.parse(approvalInput);
  const ownerMatches =
    Buffer.from(approval.ownerId).length === Buffer.from(ownerId).length &&
    timingSafeEqual(Buffer.from(approval.ownerId), Buffer.from(ownerId));
  if (!ownerMatches) throw new Error("Approval belongs to another owner");
  if (approval.status !== "approved") throw new Error("Approval is not approved");
  if (Date.parse(approval.expiresAt) <= now.getTime()) throw new Error("Approval has expired");
  if (approval.actionDigest !== actionDigest(action))
    throw new Error("Approval action does not match");
  return { ...approval, status: "consumed" };
}

export interface SecretReference {
  name: string;
  environment: "development" | "preview" | "production";
  allowedCapabilities: readonly Capability[];
}

export class EnvironmentSecretBroker {
  readonly #references: ReadonlyMap<string, SecretReference>;

  constructor(references: readonly SecretReference[]) {
    this.#references = new Map(references.map((reference) => [reference.name, reference]));
  }

  resolve(referenceName: string, capability: Capability): string {
    const reference = this.#references.get(referenceName);
    if (!reference) throw new Error("Unknown credential reference");
    if (!reference.allowedCapabilities.includes(capability)) {
      throw new Error("Credential reference does not permit this capability");
    }
    const value = process.env[reference.name];
    if (!value) throw new Error("Credential is unavailable");
    return value;
  }
}

const SECRET_PATTERN =
  /\b(?:sk-[A-Za-z0-9_-]{16,}|(?:api[_-]?key|token|password|secret)\s*[:=]\s*["']?[^\s"']{8,})/gi;

export function redactSecrets(value: string): string {
  return value.replaceAll(SECRET_PATTERN, "[REDACTED]");
}

export function requiresApproval(riskClass: RiskClass): boolean {
  return riskClass === "R2" || riskClass === "R3";
}
