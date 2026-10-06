import postgres, { type Sql } from "postgres";
import type { EventFamily, TaskStatus, TraceContext } from "@jarvis/shared";

let client: Sql | undefined;

export function database(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  client ??= postgres(url, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
    transform: postgres.camel,
  });
  return client;
}

export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = undefined;
  }
}

export interface Owner {
  id: string;
  email: string;
  displayName: string;
}

export async function ensureOwner(email: string): Promise<Owner> {
  const sql = database();
  const [owner] = await sql<Owner[]>`
    INSERT INTO users (email, display_name)
    VALUES (${email.toLowerCase()}, ${email.split("@")[0] ?? "Owner"})
    ON CONFLICT (email) DO UPDATE SET updated_at = now()
    RETURNING id, email, display_name
  `;
  if (!owner) throw new Error("Unable to initialize owner");
  return owner;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: Date;
}

export async function createConversation(ownerId: string, title: string): Promise<string> {
  const sql = database();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO conversations (owner_id, title)
    VALUES (${ownerId}, ${title.slice(0, 200)})
    RETURNING id
  `;
  if (!row) throw new Error("Unable to create conversation");
  return row.id;
}

export async function saveMessage(
  ownerId: string,
  conversationId: string,
  role: "user" | "assistant" | "system" | "tool",
  content: unknown,
): Promise<void> {
  await database()`
    INSERT INTO messages (owner_id, conversation_id, role, content)
    SELECT ${ownerId}, id, ${role}, ${database().json(content as never)}
    FROM conversations
    WHERE id = ${conversationId} AND owner_id = ${ownerId}
  `;
}

export interface TaskRow {
  id: string;
  objective: string;
  status: TaskStatus;
  priority: number;
  riskClass: string;
  verificationStatus: string;
  createdAt: Date;
  completedAt: Date | null;
}

export async function listTasks(ownerId: string, limit = 50): Promise<TaskRow[]> {
  return database()<TaskRow[]>`
    SELECT id, objective, status, priority, risk_class, verification_status, created_at, completed_at
    FROM tasks
    WHERE owner_id = ${ownerId}
    ORDER BY created_at DESC
    LIMIT ${Math.min(Math.max(limit, 1), 100)}
  `;
}

export interface NewTask {
  objective: string;
  type: string;
  acceptanceCriteria: string[];
  idempotencyKey: string;
}

export async function createTask(ownerId: string, task: NewTask): Promise<string> {
  const sql = database();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO tasks (
      owner_id, objective, type, acceptance_criteria, retry_policy, safety_limits,
      timeout_ms, idempotency_key
    )
    VALUES (
      ${ownerId}, ${task.objective}, ${task.type}, ${sql.json(task.acceptanceCriteria)},
      ${sql.json({ maxAttempts: 5, initialDelayMs: 1000, maxDelayMs: 60000, multiplier: 2 })},
      ${sql.json({
        maxSteps: 100,
        maxRetries: 5,
        maxDurationMs: 3600000,
        maxCostUsd: Number(process.env.TASK_BUDGET_USD ?? 2),
        maxToolCalls: 100,
        maxConcurrentWorkers: 1,
      })},
      3600000, ${task.idempotencyKey}
    )
    ON CONFLICT (owner_id, idempotency_key)
    DO UPDATE SET objective = EXCLUDED.objective
    RETURNING id
  `;
  if (!row) throw new Error("Unable to create task");
  return row.id;
}

export interface EventRow {
  id: string;
  family: EventFamily;
  payload: unknown;
  requestId: string;
  traceId: string;
  occurredAt: Date;
}

export async function appendEvent(
  trace: TraceContext,
  family: EventFamily,
  payload: unknown,
): Promise<void> {
  const sql = database();
  await sql`
    INSERT INTO events (owner_id, project_id, task_id, family, payload, request_id, trace_id)
    VALUES (
      ${trace.ownerId}, ${trace.projectId ?? null}, ${trace.taskId ?? null}, ${family},
      ${sql.json(payload as never)}, ${trace.requestId}, ${trace.traceId}
    )
  `;
}

export async function listEvents(ownerId: string, limit = 100): Promise<EventRow[]> {
  return database()<EventRow[]>`
    SELECT id::text, family, payload, request_id, trace_id, occurred_at
    FROM events
    WHERE owner_id = ${ownerId}
    ORDER BY id DESC
    LIMIT ${Math.min(Math.max(limit, 1), 200)}
  `;
}

export interface UsageSummary {
  totalCostUsd: string;
  modelExecutions: number;
  inputTokens: number;
  outputTokens: number;
}

export async function usageSummary(ownerId: string): Promise<UsageSummary> {
  const [row] = await database()<UsageSummary[]>`
    SELECT
      COALESCE(sum(estimated_cost_usd), 0)::text AS total_cost_usd,
      count(*)::int AS model_executions,
      COALESCE(sum(input_tokens), 0)::int AS input_tokens,
      COALESCE(sum(output_tokens), 0)::int AS output_tokens
    FROM model_executions
    WHERE owner_id = ${ownerId}
  `;
  return row ?? { totalCostUsd: "0", modelExecutions: 0, inputTokens: 0, outputTokens: 0 };
}

export interface CurrentBudgetUsage {
  dailyUsd: number;
  monthlyUsd: number;
}

export async function currentBudgetUsage(ownerId: string): Promise<CurrentBudgetUsage> {
  const [row] = await database()<Array<{ dailyUsd: string; monthlyUsd: string }>>`
    SELECT
      COALESCE(sum(estimated_cost_usd) FILTER (
        WHERE created_at >= date_trunc('day', now())
      ), 0)::text AS daily_usd,
      COALESCE(sum(estimated_cost_usd) FILTER (
        WHERE created_at >= date_trunc('month', now())
      ), 0)::text AS monthly_usd
    FROM model_executions
    WHERE owner_id = ${ownerId}
  `;
  return {
    dailyUsd: Number(row?.dailyUsd ?? 0),
    monthlyUsd: Number(row?.monthlyUsd ?? 0),
  };
}

export interface ModelExecutionRecord {
  ownerId: string;
  provider: string;
  modelId: string;
  conversationId: string;
  requestId: string;
  traceId: string;
  status: "completed" | "failed";
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  errorClass?: string;
}

export async function recordModelExecution(record: ModelExecutionRecord): Promise<void> {
  const verifiedAt = process.env.MODEL_DOCS_VERIFIED_AT;
  if (!verifiedAt || Number.isNaN(Date.parse(verifiedAt))) {
    throw new Error(
      "MODEL_DOCS_VERIFIED_AT must document when configured model metadata was verified",
    );
  }
  const sql = database();
  await sql.begin(async (transaction) => {
    const [model] = await transaction<{ id: string }[]>`
      INSERT INTO model_registry (
        provider, model_identifier, release, capabilities, pricing, policy, status,
        documentation_verified_at
      )
      VALUES (
        ${record.provider}, ${record.modelId}, ${record.modelId}, ${transaction.json(["text"])},
        ${transaction.json({ configuredExternally: true })},
        ${transaction.json({ configuredExternally: true })}, 'active', ${verifiedAt}
      )
      ON CONFLICT (provider, model_identifier)
      DO UPDATE SET updated_at = now()
      RETURNING id
    `;
    if (!model) throw new Error("Unable to register model execution");
    await transaction`
      INSERT INTO model_executions (
        owner_id, model_id, conversation_id, request_id, trace_id, status, input_tokens,
        output_tokens, estimated_cost_usd, latency_ms, error_class, completed_at
      )
      VALUES (
        ${record.ownerId}, ${model.id}, ${record.conversationId}, ${record.requestId},
        ${record.traceId}, ${record.status}, ${record.inputTokens}, ${record.outputTokens},
        ${record.estimatedCostUsd}, ${record.latencyMs}, ${record.errorClass ?? null}, now()
      )
    `;
  });
}

export interface DashboardItem {
  id: string;
  title: string;
  detail: string;
  status: string;
  occurredAt: Date;
}

export async function listProjects(ownerId: string): Promise<DashboardItem[]> {
  return database()<DashboardItem[]>`
    SELECT id, name AS title, description AS detail, 'active' AS status, updated_at AS occurred_at
    FROM projects
    WHERE owner_id = ${ownerId}
    ORDER BY updated_at DESC
    LIMIT 100
  `;
}

export async function listMemories(ownerId: string): Promise<DashboardItem[]> {
  return database()<DashboardItem[]>`
    SELECT id, type AS title, left(content, 240) AS detail, status, updated_at AS occurred_at
    FROM memories
    WHERE owner_id = ${ownerId} AND status <> 'deleted'
    ORDER BY updated_at DESC
    LIMIT 100
  `;
}

export async function listApprovals(ownerId: string): Promise<DashboardItem[]> {
  return database()<DashboardItem[]>`
    SELECT id, action->>'toolName' AS title, action->>'expectedEffect' AS detail, status,
      requested_at AS occurred_at
    FROM approvals
    WHERE owner_id = ${ownerId}
    ORDER BY requested_at DESC
    LIMIT 100
  `;
}

export async function listArtifacts(ownerId: string): Promise<DashboardItem[]> {
  return database()<DashboardItem[]>`
    SELECT id, name AS title, media_type AS detail, 'created' AS status, created_at AS occurred_at
    FROM artifacts
    WHERE owner_id = ${ownerId}
    ORDER BY created_at DESC
    LIMIT 100
  `;
}
