"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface ApprovalView {
  id: string;
  taskId: string | null;
  status: string;
  expiresAt: string;
  resolutionReason: string | null;
  action: {
    toolName: string;
    target: string;
    reason: string;
    input: unknown;
    expectedEffect: string;
    riskClass: string;
    capabilities: string[];
    credentialReferences: string[];
    rollback: string | null;
  };
}

export function ApprovalPanel({ approvals }: { approvals: ApprovalView[] }) {
  const router = useRouter();
  const [reason, setReason] = useState("Reviewed exact action and scope");
  const [pendingId, setPendingId] = useState("");
  const [error, setError] = useState("");

  function resolve(id: string, decision: "approved" | "denied") {
    setPendingId(id);
    setError("");
    void fetch(`/api/approvals/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, reason }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error ?? "Unable to resolve approval");
        }
        router.refresh();
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Unable to resolve approval");
      })
      .finally(() => setPendingId(""));
  }

  return (
    <div className="stack">
      <label className="stack">
        <span>Decision reason</span>
        <input
          className="input"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {error ? <p className="error">{error}</p> : null}
      {approvals.map((approval) => (
        <article className="card detail-section" key={approval.id}>
          <div className="toolbar">
            <div>
              <p className="eyebrow">{approval.action.riskClass} exact action</p>
              <h2>{approval.action.toolName}</h2>
            </div>
            <span className="badge">{approval.status}</span>
          </div>
          <dl className="facts">
            <dt>Target</dt>
            <dd>{approval.action.target}</dd>
            <dt>Reason</dt>
            <dd>{approval.action.reason}</dd>
            <dt>Expected effect</dt>
            <dd>{approval.action.expectedEffect}</dd>
            <dt>Inputs</dt>
            <dd>
              <code>{JSON.stringify(approval.action.input)}</code>
            </dd>
            <dt>Capabilities</dt>
            <dd>{approval.action.capabilities.join(", ")}</dd>
            <dt>Credentials</dt>
            <dd>{approval.action.credentialReferences.join(", ") || "None"}</dd>
            <dt>Rollback</dt>
            <dd>{approval.action.rollback ?? "Not applicable"}</dd>
            <dt>Expiry</dt>
            <dd>{new Date(approval.expiresAt).toLocaleString()}</dd>
          </dl>
          {approval.resolutionReason ? (
            <p className="muted">Resolution: {approval.resolutionReason}</p>
          ) : null}
          {approval.status === "pending" ? (
            <div className="toolbar">
              <button
                className="button"
                disabled={pendingId === approval.id || reason.trim().length < 3}
                onClick={() => resolve(approval.id, "approved")}
                type="button"
              >
                Approve exact action
              </button>
              <button
                className="button secondary"
                disabled={pendingId === approval.id || reason.trim().length < 3}
                onClick={() => resolve(approval.id, "denied")}
                type="button"
              >
                Deny
              </button>
            </div>
          ) : null}
        </article>
      ))}
      {approvals.length === 0 ? (
        <div className="card muted detail-section">No approvals yet.</div>
      ) : null}
    </div>
  );
}
