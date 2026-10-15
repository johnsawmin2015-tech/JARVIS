"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function TaskForm() {
  const router = useRouter();
  const [objective, setObjective] = useState("");
  const [criteria, setCriteria] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [createdPlan, setCreatedPlan] = useState<{
    taskId: string;
    approvalId: string | null;
    plan: { riskClass: string; steps: Array<{ id: string; description: string }> };
  } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const acceptanceCriteria = criteria
      .split("\n")
      .map((criterion) => criterion.trim())
      .filter(Boolean);
    setPending(true);
    setError("");
    setCreatedPlan(null);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ objective, acceptanceCriteria }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Unable to create task");
      }
      const body = (await response.json()) as NonNullable<typeof createdPlan>;
      setCreatedPlan(body);
      setObjective("");
      setCriteria("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create task");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="card stack"
      style={{ padding: 18, marginBottom: 24 }}
      onSubmit={(event) => void submit(event)}
    >
      <label className="stack">
        <span>Objective</span>
        <textarea
          className="input"
          required
          rows={3}
          value={objective}
          onChange={(event) => setObjective(event.target.value)}
          placeholder="Describe the outcome, not only a question."
        />
        <span className="muted">
          Supports public HTTPS URLs, GitHub blob URLs, workspace file requests, and{" "}
          <code>sandbox: &lt;JavaScript&gt;</code>.
        </span>
      </label>
      <label className="stack">
        <span>Acceptance criteria</span>
        <textarea
          className="input"
          rows={3}
          value={criteria}
          onChange={(event) => setCriteria(event.target.value)}
          placeholder={
            "One measurable criterion per line\nTests pass\nResult includes source evidence"
          }
        />
      </label>
      {error ? <p className="error">{error}</p> : null}
      {createdPlan ? (
        <div className="card" style={{ padding: 14 }}>
          <strong>Plan created · Risk {createdPlan.plan.riskClass}</strong>
          <ol>
            {createdPlan.plan.steps.map((step) => (
              <li key={step.id}>{step.description}</li>
            ))}
          </ol>
          <p className="muted">
            {createdPlan.approvalId
              ? "Waiting for exact-action approval."
              : "Queued for the durable worker."}
          </p>
        </div>
      ) : null}
      <button className="button" disabled={pending} type="submit">
        {pending ? "Creating…" : "Create durable task"}
      </button>
    </form>
  );
}
