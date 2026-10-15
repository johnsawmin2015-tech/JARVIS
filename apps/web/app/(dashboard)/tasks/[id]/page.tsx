import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getTask, listTaskToolExecutions } from "@jarvis/database";
import { requireSession } from "../../../../lib/auth";
import { TaskActions } from "../../../../components/task-actions";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const taskId = z
    .string()
    .uuid()
    .safeParse((await params).id);
  if (!taskId.success) notFound();
  const session = await requireSession();
  const task = await getTask(session.ownerId, taskId.data);
  if (!task) notFound();
  const executions = await listTaskToolExecutions(session.ownerId, task.id);
  const terminal = ["completed", "failed", "cancelled", "denied", "expired"].includes(task.status);

  return (
    <div className="page">
      <p className="eyebrow">Durable task</p>
      <div className="toolbar">
        <div>
          <h1>{task.objective}</h1>
          <p className="subhead">
            Risk {task.riskClass} · Verification {task.verificationStatus}
          </p>
        </div>
        <span className="badge">{task.status}</span>
      </div>
      <TaskActions taskId={task.id} cancellable={!terminal} />

      <section className="card detail-section">
        <h2>Plan</h2>
        {task.plan ? (
          <ol className="timeline">
            {task.plan.steps.map((step) => (
              <li key={step.id}>
                <strong>{step.description}</strong>
                <p className="muted">
                  {step.action
                    ? `${step.action.toolName} · ${step.action.riskClass}`
                    : "Deterministic verification"}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">No plan was persisted.</p>
        )}
      </section>

      <section className="card detail-section">
        <h2>Tool activity</h2>
        {executions.length ? (
          <ul className="list">
            {executions.map((execution) => (
              <li className="list-item" key={execution.id}>
                <div>
                  <strong>{execution.toolName}</strong>
                  <p className="muted">
                    {execution.latencyMs ?? 0} ms
                    {execution.errorClass ? ` · ${execution.errorClass}` : ""}
                  </p>
                </div>
                <span className="badge">{execution.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No tool calls have run.</p>
        )}
      </section>

      <section className="card detail-section">
        <h2>Final report</h2>
        {task.finalReport ? (
          <pre className="report">{task.finalReport}</pre>
        ) : task.failureReason ? (
          <p className="error">{task.failureReason}</p>
        ) : (
          <p className="muted">The worker has not produced a verified report yet.</p>
        )}
      </section>
      <p>
        <Link href="/tasks">← Back to tasks</Link>
      </p>
    </div>
  );
}
