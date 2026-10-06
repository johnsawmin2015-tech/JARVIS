import { notFound } from "next/navigation";
import {
  listApprovals,
  listArtifacts,
  listEvents,
  listMemories,
  listProjects,
  listTasks,
  usageSummary,
  type DashboardItem,
} from "@jarvis/database";
import { requireSession } from "../../../lib/auth";
import { TaskForm } from "../../../components/task-form";

export const dynamic = "force-dynamic";

const metadata = {
  tasks: [
    "Durable task plane",
    "Tasks",
    "Persisted, resumable objectives with explicit verification.",
  ],
  projects: [
    "Persistent workspaces",
    "Projects",
    "Goals, tasks, context, and artifacts grouped by outcome.",
  ],
  memory: [
    "Inspectable knowledge",
    "Memory",
    "Provenanced memories with explicit lifecycle states.",
  ],
  approvals: [
    "Human authority",
    "Approvals",
    "Exact, expiring decisions for consequential actions.",
  ],
  activity: [
    "Audit and recovery",
    "Activity",
    "Append-oriented events for important state transitions.",
  ],
  artifacts: [
    "Generated outcomes",
    "Artifacts",
    "Files and outputs preserved with integrity metadata.",
  ],
  usage: ["Cost control", "Usage", "Model requests, tokens, latency, and estimated spend."],
  settings: ["Control plane", "Settings", "Provider, tool, permission, and integration status."],
} as const;

type Section = keyof typeof metadata;

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section: rawSection } = await params;
  if (!(rawSection in metadata)) notFound();
  const section = rawSection as Section;
  const session = await requireSession();
  const [eyebrow, title, description] = metadata[section];

  let content;
  if (section === "tasks") {
    const tasks = await listTasks(session.ownerId);
    content = (
      <>
        <TaskForm />
        <ul className="list">
          {tasks.map((task) => (
            <li className="list-item" key={task.id}>
              <div>
                <strong>{task.objective}</strong>
                <p className="muted">
                  Priority {task.priority} · Risk {task.riskClass}
                </p>
              </div>
              <span className="badge">{task.status}</span>
            </li>
          ))}
          {tasks.length === 0 ? <Empty label="No durable tasks yet." /> : null}
        </ul>
      </>
    );
  } else if (section === "activity") {
    const events = await listEvents(session.ownerId);
    content = (
      <ul className="list">
        {events.map((event) => (
          <li className="list-item" key={event.id}>
            <div>
              <strong>{event.family}</strong>
              <p className="muted">{event.occurredAt.toLocaleString()}</p>
            </div>
            <span className="badge">{event.traceId.slice(0, 8)}</span>
          </li>
        ))}
        {events.length === 0 ? <Empty label="No activity recorded yet." /> : null}
      </ul>
    );
  } else if (section === "usage") {
    const usage = await usageSummary(session.ownerId);
    content = (
      <div className="card" style={{ padding: 22 }}>
        <p className="eyebrow">Estimated total</p>
        <h2>${Number(usage.totalCostUsd).toFixed(4)}</h2>
        <p className="muted">
          {usage.modelExecutions} model executions · {usage.inputTokens.toLocaleString()} input
          tokens · {usage.outputTokens.toLocaleString()} output tokens
        </p>
      </div>
    );
  } else if (section === "settings") {
    const providers = [
      ["AI Gateway", Boolean(process.env.AI_GATEWAY_API_KEY && process.env.GATEWAY_MODEL_ID)],
      ["OpenAI", Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL_ID)],
      ["Anthropic", Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL_ID)],
      ["PostgreSQL", Boolean(process.env.DATABASE_URL)],
      ["Redis", Boolean(process.env.REDIS_URL)],
    ] as const;
    content = (
      <ul className="list">
        {providers.map(([name, configured]) => (
          <li className="list-item" key={name}>
            <strong>{name}</strong>
            <span className="badge">{configured ? "Configured" : "Not configured"}</span>
          </li>
        ))}
      </ul>
    );
  } else {
    let items: DashboardItem[];
    if (section === "projects") items = await listProjects(session.ownerId);
    else if (section === "memory") items = await listMemories(session.ownerId);
    else if (section === "approvals") items = await listApprovals(session.ownerId);
    else items = await listArtifacts(session.ownerId);
    content = <ItemList items={items} />;
  }

  return (
    <div className="page">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="subhead">{description}</p>
      {content}
    </div>
  );
}

function ItemList({ items }: { items: DashboardItem[] }) {
  return (
    <ul className="list">
      {items.map((item) => (
        <li className="list-item" key={item.id}>
          <div>
            <strong>{item.title}</strong>
            <p className="muted">{item.detail}</p>
          </div>
          <span className="badge">{item.status}</span>
        </li>
      ))}
      {items.length === 0 ? <Empty label="Nothing to show yet." /> : null}
    </ul>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <li className="card muted" style={{ padding: 22 }}>
      {label}
    </li>
  );
}
