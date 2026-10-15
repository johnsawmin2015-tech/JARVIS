"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

interface MemoryView {
  id: string;
  type: string;
  content: string;
  sourceType: string;
  sourceId: string;
  confidence: number;
  importance: number;
  sensitivity: string;
  scope: string;
  updatedAt: string;
}

export function MemoryPanel({ memories, query }: { memories: MemoryView[]; query: string }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [type, setType] = useState("semantic");
  const [importance, setImportance] = useState("0.5");
  const [sensitivity, setSensitivity] = useState("personal");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/memories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content,
          type,
          importance: Number(importance),
          sensitivity,
          confidence: 1,
          scope: "owner",
          projectId: null,
          expiresAt: null,
        }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Unable to store memory");
      }
      setContent("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to store memory");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <form className="card stack detail-section" onSubmit={(event) => void submit(event)}>
        <h2>Store verified memory</h2>
        <textarea
          className="input"
          required
          rows={3}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="A fact, preference, decision, or reusable lesson…"
        />
        <div className="form-grid">
          <select className="input" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="semantic">Semantic fact</option>
            <option value="preference">Preference</option>
            <option value="episodic">Episode</option>
            <option value="project">Project decision</option>
            <option value="goal">Goal</option>
          </select>
          <select
            className="input"
            value={importance}
            onChange={(event) => setImportance(event.target.value)}
          >
            <option value="0.3">Low importance</option>
            <option value="0.5">Normal importance</option>
            <option value="0.8">High importance</option>
            <option value="1">Critical importance</option>
          </select>
          <select
            className="input"
            value={sensitivity}
            onChange={(event) => setSensitivity(event.target.value)}
          >
            <option value="personal">Personal</option>
            <option value="public">Public</option>
            <option value="confidential">Confidential</option>
            <option value="restricted">Restricted</option>
          </select>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="button" disabled={pending} type="submit">
          {pending ? "Storing…" : "Store memory"}
        </button>
      </form>

      <form action="/memory" className="toolbar" method="get">
        <input
          className="input"
          defaultValue={query}
          name="q"
          placeholder="Search stored memory"
          type="search"
        />
        <button className="button secondary" type="submit">
          Search
        </button>
      </form>

      <ul className="list">
        {memories.map((memory) => (
          <li className="list-item" key={memory.id}>
            <div>
              <strong>{memory.type}</strong>
              <p>{memory.content}</p>
              <p className="muted">
                {memory.sourceType}:{memory.sourceId} · confidence {memory.confidence} · importance{" "}
                {memory.importance} · {memory.sensitivity}/{memory.scope}
              </p>
            </div>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                void fetch(`/api/memories/${memory.id}`, { method: "DELETE" }).then((response) => {
                  if (response.ok) router.refresh();
                });
              }}
            >
              Delete
            </button>
          </li>
        ))}
        {memories.length === 0 ? (
          <li className="card muted detail-section">No matching durable memory.</li>
        ) : null}
      </ul>
    </>
  );
}
