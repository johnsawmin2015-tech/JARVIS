"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TaskActions({ taskId, cancellable }: { taskId: string; cancellable: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (!cancellable) return null;
  return (
    <div>
      <button
        className="button secondary"
        disabled={pending}
        type="button"
        onClick={() => {
          setPending(true);
          setError("");
          void fetch(`/api/tasks/${taskId}`, { method: "DELETE" })
            .then(async (response) => {
              if (!response.ok) {
                const body = (await response.json()) as { error?: string };
                throw new Error(body.error ?? "Unable to cancel task");
              }
              router.refresh();
            })
            .catch((caught: unknown) => {
              setError(caught instanceof Error ? caught.message : "Unable to cancel task");
            })
            .finally(() => setPending(false));
        }}
      >
        {pending ? "Cancelling…" : "Cancel task"}
      </button>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
