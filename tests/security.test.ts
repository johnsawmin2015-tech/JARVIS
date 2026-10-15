import { describe, expect, it } from "vitest";
import { evaluatePolicy, EnvironmentSecretBroker } from "@jarvis/security";
import { createFileReadTool, webFetchTool } from "@jarvis/tools";

const context = {
  trace: {
    requestId: "request",
    traceId: "trace",
    ownerId: "3c60552d-1393-45eb-9dcf-dbe5e71312f6",
  },
  signal: new AbortController().signal,
  requestSecret: () => {
    throw new Error("No secret expected");
  },
};

describe("untrusted input defenses", () => {
  it("escalates modifying actions influenced by retrieved content", () => {
    const decision = evaluatePolicy(
      {
        ownerId: context.trace.ownerId,
        capabilities: new Set(["filesystem.write"]),
      },
      {
        toolName: "file.write",
        target: "workspace/file",
        reason: "A document requested a change",
        input: {},
        expectedEffect: "Change file",
        riskClass: "R1",
        capabilities: ["filesystem.write"],
        credentialReferences: [],
        rollback: "Restore file",
        promptedByUntrustedContent: true,
      },
    );
    expect(decision.decision).toBe("approval_required");
  });

  it("blocks private-network web fetches before issuing a request", async () => {
    await expect(
      webFetchTool.execute(context, { url: "https://127.0.0.1/private" }),
    ).rejects.toThrow("Private");
  });

  it("confines file reads to the configured root", async () => {
    const tool = createFileReadTool(process.cwd());
    await expect(tool.execute(context, { path: "/etc/hosts" })).rejects.toThrow("escapes");
    const readme = await tool.execute(context, { path: "README.md" });
    expect(readme.content).toContain("JARVIS");
  });

  it("never returns an unknown credential", () => {
    const broker = new EnvironmentSecretBroker([]);
    expect(() => broker.resolve("MISSING_SECRET", "repo.read")).toThrow("Unknown");
  });
});
