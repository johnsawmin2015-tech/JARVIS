import type { z } from "zod";
import type { Capability, RiskClass, TraceContext } from "@jarvis/shared";
import {
  actionDigest,
  consumeApproval,
  evaluatePolicy,
  type Approval,
  type EnvironmentSecretBroker,
  type Principal,
  type ProposedAction,
} from "@jarvis/security";

export { createFileReadTool, githubReadTool, webFetchTool } from "./builtins";

export interface ToolContext {
  trace: TraceContext;
  signal: AbortSignal;
  requestSecret(reference: string, capability: Capability): string;
}

export interface Tool<Input, Output> {
  name: string;
  description: string;
  inputSchema: z.ZodType<Input>;
  outputSchema: z.ZodType<Output>;
  riskClass: RiskClass;
  capabilities: readonly Capability[];
  execute(context: ToolContext, input: Input): Promise<Output>;
}

export interface ToolAuditEvent {
  event:
    | "tool.requested"
    | "tool.allowed"
    | "tool.denied"
    | "tool.approval_required"
    | "tool.approved"
    | "tool.executed"
    | "tool.failed";
  trace: TraceContext;
  toolName: string;
  actionDigest: string;
  durationMs?: number;
  errorClass?: string;
}

export type AuditSink = (event: ToolAuditEvent) => Promise<void>;

type ErasedTool = Tool<unknown, unknown>;

export interface ExecuteToolRequest {
  principal: Principal;
  toolName: string;
  input: unknown;
  target: string;
  reason: string;
  expectedEffect: string;
  rollback: string | null;
  credentialReferences: string[];
  promptedByUntrustedContent: boolean;
  approval?: Approval;
  trace: TraceContext;
  signal: AbortSignal;
}

export class ToolGateway {
  readonly #tools = new Map<string, ErasedTool>();
  readonly #secretBroker: EnvironmentSecretBroker;
  readonly #audit: AuditSink;

  constructor(secretBroker: EnvironmentSecretBroker, audit: AuditSink) {
    this.#secretBroker = secretBroker;
    this.#audit = audit;
  }

  register<Input, Output>(tool: Tool<Input, Output>): void {
    if (this.#tools.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
    this.#tools.set(tool.name, tool);
  }

  describe(): Array<{
    name: string;
    description: string;
    riskClass: RiskClass;
    capabilities: readonly Capability[];
  }> {
    return [...this.#tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      riskClass: tool.riskClass,
      capabilities: tool.capabilities,
    }));
  }

  async execute(request: ExecuteToolRequest): Promise<unknown> {
    const tool = this.#tools.get(request.toolName);
    if (!tool) throw new Error("Tool is not registered");
    const action: ProposedAction = {
      toolName: tool.name,
      target: request.target,
      reason: request.reason,
      input: request.input,
      expectedEffect: request.expectedEffect,
      riskClass: tool.riskClass,
      capabilities: [...tool.capabilities],
      credentialReferences: request.credentialReferences,
      rollback: request.rollback,
      promptedByUntrustedContent: request.promptedByUntrustedContent,
    };
    const digest = actionDigest(action);
    await this.#audit({
      event: "tool.requested",
      trace: request.trace,
      toolName: tool.name,
      actionDigest: digest,
    });

    const decision = evaluatePolicy(request.principal, action);
    if (decision.decision === "deny") {
      await this.#audit({
        event: "tool.denied",
        trace: request.trace,
        toolName: tool.name,
        actionDigest: digest,
      });
      throw new Error(`Tool denied: ${decision.reason}`);
    }
    if (decision.decision === "approval_required") {
      if (!request.approval) {
        await this.#audit({
          event: "tool.approval_required",
          trace: request.trace,
          toolName: tool.name,
          actionDigest: digest,
        });
        throw new ApprovalRequiredError(digest, decision.reason);
      }
      consumeApproval(request.approval, request.principal.ownerId, action, new Date());
      await this.#audit({
        event: "tool.approved",
        trace: request.trace,
        toolName: tool.name,
        actionDigest: digest,
      });
    } else {
      await this.#audit({
        event: "tool.allowed",
        trace: request.trace,
        toolName: tool.name,
        actionDigest: digest,
      });
    }

    const input = tool.inputSchema.parse(request.input);
    const startedAt = performance.now();
    try {
      const raw = await tool.execute(
        {
          trace: request.trace,
          signal: request.signal,
          requestSecret: (reference, capability) =>
            this.#secretBroker.resolve(reference, capability),
        },
        input,
      );
      const output = tool.outputSchema.parse(raw);
      await this.#audit({
        event: "tool.executed",
        trace: request.trace,
        toolName: tool.name,
        actionDigest: digest,
        durationMs: performance.now() - startedAt,
      });
      return output;
    } catch (error) {
      await this.#audit({
        event: "tool.failed",
        trace: request.trace,
        toolName: tool.name,
        actionDigest: digest,
        durationMs: performance.now() - startedAt,
        errorClass: error instanceof Error ? error.name : "UnknownError",
      });
      throw error;
    }
  }
}

export class ApprovalRequiredError extends Error {
  constructor(
    readonly actionDigest: string,
    message: string,
  ) {
    super(message);
    this.name = "ApprovalRequiredError";
  }
}
