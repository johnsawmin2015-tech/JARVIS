import { notFound } from "next/navigation";
import Link from "next/link";
import {
  listApprovals,
  listArtifacts,
  listEvents,
  listProjects,
  listTasks,
  searchMemories,
  usageSummary,
  isDemoMode,
  type DashboardItem,
} from "@jarvis/database";
import { requireSession } from "../../../lib/auth";
import { TaskForm } from "../../../components/task-form";
import { MemoryPanel } from "../../../components/memory-panel";
import { ApprovalPanel } from "../../../components/approval-panel";

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

export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
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
                <strong>
                  <Link href={`/tasks/${task.id}`}>{task.objective}</Link>
                </strong>
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
    const demoMode = isDemoMode();
    const providers = [
      ["Mode", demoMode ? "Local demo · process-local reset on restart" : "Persistent"],
      ["AI Gateway", Boolean(process.env.AI_GATEWAY_API_KEY && process.env.GATEWAY_MODEL_ID)],
      ["OpenAI", Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL_ID)],
      ["Anthropic", Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL_ID)],
      ["PostgreSQL", demoMode ? "Bypassed in demo" : Boolean(process.env.DATABASE_URL)],
      ["Redis", demoMode ? "Bypassed in demo" : Boolean(process.env.REDIS_URL)],
    ] as const;
    content = (
      <ul className="list">
        {providers.map(([name, configured]) => (
          <li className="list-item" key={name}>
            <strong>{name}</strong>
            <span className="badge">
              {typeof configured === "string"
                ? configured
                : configured
                  ? "Configured"
                  : demoMode
                    ? "Not used"
                    : "Not configured"}
            </span>
          </li>
        ))}
      </ul>
    );
  } else if (section === "memory") {
    const query = (await searchParams).q?.slice(0, 500) ?? "";
    const memories = await searchMemories(session.ownerId, query);
    content = (
      <MemoryPanel
        memories={memories.map((memory) => ({
          ...memory,
          confidence: Number(memory.confidence),
          importance: Number(memory.importance),
          sourceTimestamp: memory.sourceTimestamp.toISOString(),
          expiresAt: memory.expiresAt?.toISOString() ?? null,
          createdAt: memory.createdAt.toISOString(),
          updatedAt: memory.updatedAt.toISOString(),
        }))}
        query={query}
      />
    );
  } else if (section === "approvals") {
    const approvals = await listApprovals(session.ownerId);
    content = (
      <ApprovalPanel
        approvals={approvals.map((approval) => ({
          ...approval,
          occurredAt: approval.occurredAt.toISOString(),
          expiresAt: approval.expiresAt.toISOString(),
        }))}
      />
    );
  } else {
    let items: DashboardItem[];
    if (section === "projects") items = await listProjects(session.ownerId);
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
