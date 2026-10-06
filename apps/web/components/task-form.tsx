"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function TaskForm() {
  const router = useRouter();
  const [objective, setObjective] = useState("");
  const [criteria, setCriteria] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const acceptanceCriteria = criteria
      .split("\n")
      .map((criterion) => criterion.trim())
      .filter(Boolean);
    if (acceptanceCriteria.length === 0) {
      setError("Add at least one measurable acceptance criterion.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ objective, acceptanceCriteria, type: "general" }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Unable to create task");
      }
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
      </label>
      <label className="stack">
        <span>Acceptance criteria</span>
        <textarea
          className="input"
          required
          rows={3}
          value={criteria}
          onChange={(event) => setCriteria(event.target.value)}
          placeholder={
            "One measurable criterion per line\nTests pass\nResult includes source evidence"
          }
        />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <button className="button" disabled={pending} type="submit">
        {pending ? "Creating…" : "Create durable task"}
      </button>
    </form>
  );
}
