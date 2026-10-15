import postgres, { type Sql } from "postgres";
import type { Plan } from "@jarvis/agents";
import type { MemoryRecord } from "@jarvis/memory";
import { actionDigest, type Approval, type ProposedAction } from "@jarvis/security";
import type { EventFamily, TaskStatus, TraceContext } from "@jarvis/shared";
import * as demo from "./demo";

export { DEMO_OWNER_ID, isDemoMode, resetDemoStore } from "./demo";

let client: Sql | undefined;

export function database(): Sql {
  if (demo.isDemoMode()) {
    throw new Error("Direct PostgreSQL access is unavailable in explicit demo mode");
  }
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
  if (demo.isDemoMode()) return demo.demoEnsureOwner(email);
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
  if (demo.isDemoMode()) return demo.demoCreateConversation(ownerId, title);
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
  if (demo.isDemoMode()) return demo.demoSaveMessage(ownerId, conversationId, role, content);
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
  acceptanceCriteria: string[];
  plan: Plan | null;
  finalReport: string | null;
  failureReason: string | null;
  toolCallCount: number;
  spentUsd: string;
  createdAt: Date;
  completedAt: Date | null;
}

export async function listTasks(ownerId: string, limit = 50): Promise<TaskRow[]> {
  if (demo.isDemoMode()) return demo.demoListTasks(ownerId, limit);
  return database()<TaskRow[]>`
    SELECT id, objective, status, priority, risk_class, verification_status, acceptance_criteria,
      plan, final_report, failure_reason, tool_call_count, spent_usd, created_at, completed_at
    FROM tasks
    WHERE owner_id = ${ownerId}
    ORDER BY created_at DESC
    LIMIT ${Math.min(Math.max(limit, 1), 100)}
  `;
}

export interface NewTask {
  objective: string;
  type: string;
  plan: Plan;
  idempotencyKey: string;
  approvalAction?: ProposedAction;
}

export interface CreatedTask {
  taskId: string;
  approvalId: string | null;
}

export async function createTask(ownerId: string, task: NewTask): Promise<CreatedTask> {
  if (demo.isDemoMode()) return demo.demoCreateTask(ownerId, task);
  const sql = database();
  return sql.begin(async (transaction) => {
    const [row] = await transaction<{ id: string; status: TaskStatus }[]>`
      INSERT INTO tasks (
        owner_id, objective, status, type, expected_output, acceptance_criteria, risk_class,
        required_capabilities, retry_policy, safety_limits, timeout_ms, idempotency_key, plan
      )
      VALUES (
        ${ownerId}, ${task.objective}, ${task.approvalAction ? "waiting_approval" : "queued"}::task_status,
        ${task.type}, 'Final task report', ${transaction.json(task.plan.acceptanceCriteria)},
        ${task.plan.riskClass}::risk_class, ${transaction.json(task.plan.requiredCapabilities)},
        ${transaction.json({ maxAttempts: 5, initialDelayMs: 1000, maxDelayMs: 60000, multiplier: 2 })},
        ${transaction.json({
          maxSteps: 100,
          maxRetries: 5,
          maxDurationMs: 3600000,
          maxCostUsd: Number(process.env.TASK_BUDGET_USD ?? 2),
          maxToolCalls: 100,
          maxConcurrentWorkers: 1,
        })},
        3600000, ${task.idempotencyKey}, ${transaction.json(task.plan as never)}
      )
      ON CONFLICT (owner_id, idempotency_key)
      DO UPDATE SET objective = EXCLUDED.objective
      RETURNING id, status
    `;
    if (!row) throw new Error("Unable to create task");
    let approvalId: string | null = null;
    if (task.approvalAction && row.status === "waiting_approval") {
      const digest = actionDigest(task.approvalAction);
      const [approval] = await transaction<{ id: string }[]>`
        INSERT INTO approvals (owner_id, task_id, action_digest, action, expires_at)
        SELECT
          ${ownerId}, ${row.id}, ${digest}, ${transaction.json(task.approvalAction as never)},
          now() + interval '30 minutes'
        WHERE NOT EXISTS (
          SELECT 1 FROM approvals
          WHERE owner_id = ${ownerId} AND task_id = ${row.id} AND action_digest = ${digest}
            AND status IN ('pending', 'approved')
        )
        RETURNING id
      `;
      if (approval) approvalId = approval.id;
      else {
        const [existing] = await transaction<{ id: string }[]>`
          SELECT id FROM approvals
          WHERE owner_id = ${ownerId} AND task_id = ${row.id} AND action_digest = ${digest}
            AND status IN ('pending', 'approved')
          ORDER BY requested_at DESC
          LIMIT 1
        `;
        approvalId = existing?.id ?? null;
      }
    }
    return { taskId: row.id, approvalId };
  });
}

export async function getTask(ownerId: string, taskId: string): Promise<TaskRow | undefined> {
  if (demo.isDemoMode()) return demo.demoGetTask(ownerId, taskId);
  const [task] = await database()<TaskRow[]>`
    SELECT id, objective, status, priority, risk_class, verification_status, acceptance_criteria,
      plan, final_report, failure_reason, tool_call_count, spent_usd, created_at, completed_at
    FROM tasks
    WHERE id = ${taskId} AND owner_id = ${ownerId}
  `;
  return task;
}

export async function cancelTask(ownerId: string, taskId: string): Promise<boolean> {
  if (demo.isDemoMode()) return demo.demoCancelTask(ownerId, taskId);
  const rows = await database()`
    UPDATE tasks
    SET status = 'cancelled', completed_at = now(), lease_owner = null, lease_expires_at = null
    WHERE id = ${taskId} AND owner_id = ${ownerId}
      AND status NOT IN ('completed', 'failed', 'cancelled', 'denied', 'expired')
    RETURNING id
  `;
  return rows.length === 1;
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
  if (demo.isDemoMode()) return demo.demoAppendEvent(trace, family, payload);
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
  if (demo.isDemoMode()) return demo.demoListEvents(ownerId, limit);
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
  if (demo.isDemoMode()) return demo.demoUsageSummary(ownerId);
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
  if (demo.isDemoMode()) return demo.demoCurrentBudgetUsage(ownerId);
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
  if (demo.isDemoMode()) {
    return demo.demoRecordModelExecution(
      record.ownerId,
      record.inputTokens,
      record.outputTokens,
      record.estimatedCostUsd,
    );
  }
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
  if (demo.isDemoMode()) return demo.demoListProjects(ownerId);
  return database()<DashboardItem[]>`
    SELECT id, name AS title, description AS detail, 'active' AS status, updated_at AS occurred_at
    FROM projects
    WHERE owner_id = ${ownerId}
    ORDER BY updated_at DESC
    LIMIT 100
  `;
}

export async function listMemories(ownerId: string): Promise<DashboardItem[]> {
  if (demo.isDemoMode()) {
    const memories = await demo.demoSearchMemories(ownerId, "", 100);
    return memories.map((memory) => ({
      id: memory.id,
      title: memory.type,
      detail: memory.content.slice(0, 240),
      status: memory.status,
      occurredAt: memory.updatedAt,
    }));
  }
  return database()<DashboardItem[]>`
    SELECT id, type AS title, left(content, 240) AS detail, status, updated_at AS occurred_at
    FROM memories
    WHERE owner_id = ${ownerId} AND status <> 'deleted'
    ORDER BY updated_at DESC
    LIMIT 100
  `;
}

export interface ApprovalRow extends DashboardItem {
  taskId: string | null;
  action: ProposedAction;
  expiresAt: Date;
  resolutionReason: string | null;
}

export async function listApprovals(ownerId: string): Promise<ApprovalRow[]> {
  if (demo.isDemoMode()) return demo.demoListApprovals(ownerId);
  const sql = database();
  await sql`
    UPDATE approvals
    SET status = 'expired', resolved_at = now(), resolution_reason = 'Approval expired'
    WHERE owner_id = ${ownerId} AND status = 'pending' AND expires_at <= now()
  `;
  return sql<ApprovalRow[]>`
    SELECT id, task_id, action->>'toolName' AS title, action->>'expectedEffect' AS detail, status,
      action, requested_at AS occurred_at, expires_at, resolution_reason
    FROM approvals
    WHERE owner_id = ${ownerId}
    ORDER BY requested_at DESC
    LIMIT 100
  `;
}

export async function listArtifacts(ownerId: string): Promise<DashboardItem[]> {
  if (demo.isDemoMode()) return demo.demoListArtifacts(ownerId);
  return database()<DashboardItem[]>`
    SELECT id, name AS title, media_type AS detail, 'created' AS status, created_at AS occurred_at
    FROM artifacts
    WHERE owner_id = ${ownerId}
    ORDER BY created_at DESC
    LIMIT 100
  `;
}

export interface NewMemory {
  projectId: string | null;
  type: MemoryRecord["type"];
  content: string;
  sourceId: string;
  confidence: number;
  importance: number;
  sensitivity: MemoryRecord["sensitivity"];
  scope: MemoryRecord["scope"];
  expiresAt: Date | null;
}

export interface MemoryRow extends NewMemory {
  id: string;
  sourceType: MemoryRecord["sourceType"];
  sourceTimestamp: Date;
  status: MemoryRecord["status"];
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export async function createMemory(ownerId: string, memory: NewMemory): Promise<string> {
  if (demo.isDemoMode()) return demo.demoCreateMemory(ownerId, memory);
  const sql = database();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO memories (
      owner_id, project_id, type, content, source_type, source_id, source_timestamp,
      confidence, importance, sensitivity, scope, status, verified, expires_at
    )
    VALUES (
      ${ownerId}, ${memory.projectId}, ${memory.type}, ${memory.content}, 'user', ${memory.sourceId},
      now(), ${memory.confidence}, ${memory.importance}, ${memory.sensitivity}, ${memory.scope},
      'stored', true, ${memory.expiresAt}
    )
    RETURNING id
  `;
  if (!row) throw new Error("Unable to store memory");
  return row.id;
}

export async function searchMemories(
  ownerId: string,
  query: string,
  limit = 50,
): Promise<MemoryRow[]> {
  if (demo.isDemoMode()) return demo.demoSearchMemories(ownerId, query, limit);
  const pattern = `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  return database()<MemoryRow[]>`
    SELECT id, project_id, type, content, source_type, source_id, source_timestamp, confidence,
      importance, sensitivity, scope, status, verified, expires_at, created_at, updated_at
    FROM memories
    WHERE owner_id = ${ownerId}
      AND status = 'stored'
      AND (expires_at IS NULL OR expires_at > now())
      AND (${query} = '' OR content ILIKE ${pattern} ESCAPE '\')
    ORDER BY importance DESC, confidence DESC, updated_at DESC
    LIMIT ${Math.min(Math.max(limit, 1), 100)}
  `;
}

export async function deleteMemory(ownerId: string, memoryId: string): Promise<boolean> {
  if (demo.isDemoMode()) return demo.demoDeleteMemory(ownerId, memoryId);
  const rows = await database()`
    UPDATE memories
    SET status = 'deleted', content = '[deleted]', updated_at = now()
    WHERE id = ${memoryId} AND owner_id = ${ownerId} AND status <> 'deleted'
    RETURNING id
  `;
  return rows.length === 1;
}

export interface ResolvedApproval {
  id: string;
  taskId: string | null;
  status: "approved" | "denied";
  action: ProposedAction;
}

export async function resolveApproval(
  ownerId: string,
  approvalId: string,
  decision: "approved" | "denied",
  reason: string,
): Promise<ResolvedApproval | undefined> {
  if (demo.isDemoMode()) {
    return demo.demoResolveApproval(ownerId, approvalId, decision, reason);
  }
  return database().begin(async (transaction) => {
    const [approval] = await transaction<
      Array<{ id: string; taskId: string | null; action: ProposedAction; expiresAt: Date }>
    >`
      SELECT id, task_id, action, expires_at
      FROM approvals
      WHERE id = ${approvalId} AND owner_id = ${ownerId} AND status = 'pending'
      FOR UPDATE
    `;
    if (!approval) return undefined;
    if (approval.expiresAt.getTime() <= Date.now()) {
      await transaction`
        UPDATE approvals SET status = 'expired', resolved_at = now(),
          resolution_reason = 'Approval expired'
        WHERE id = ${approval.id}
      `;
      return undefined;
    }
    await transaction`
      UPDATE approvals
      SET status = ${decision}::approval_status, resolved_at = now(), resolution_reason = ${reason}
      WHERE id = ${approval.id}
    `;
    if (approval.taskId) {
      await transaction`
        UPDATE tasks
        SET status = ${decision === "approved" ? "authorized" : "denied"}::task_status,
          failure_reason = ${decision === "denied" ? reason : null}
        WHERE id = ${approval.taskId} AND owner_id = ${ownerId} AND status = 'waiting_approval'
      `;
    }
    return { id: approval.id, taskId: approval.taskId, status: decision, action: approval.action };
  });
}

export async function findApprovedAction(
  ownerId: string,
  taskId: string,
  action: ProposedAction,
): Promise<Approval | undefined> {
  if (demo.isDemoMode()) return demo.demoFindApprovedAction(ownerId, taskId, action);
  const digest = actionDigest(action);
  const [row] = await database()<
    Array<{
      id: string;
      ownerId: string;
      actionDigest: string;
      status: Approval["status"];
      requestedAt: Date;
      resolvedAt: Date | null;
      expiresAt: Date;
    }>
  >`
    SELECT id, owner_id, action_digest, status, requested_at, resolved_at, expires_at
    FROM approvals
    WHERE owner_id = ${ownerId} AND task_id = ${taskId} AND action_digest = ${digest}
      AND status = 'approved' AND expires_at > now()
    ORDER BY resolved_at DESC
    LIMIT 1
  `;
  if (!row) return undefined;
  return {
    ...row,
    requestedAt: row.requestedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function markApprovalConsumed(ownerId: string, approvalId: string): Promise<void> {
  if (demo.isDemoMode()) return demo.demoMarkApprovalConsumed(ownerId, approvalId);
  await database()`
    UPDATE approvals
    SET status = 'consumed', consumed_at = now()
    WHERE id = ${approvalId} AND owner_id = ${ownerId} AND status = 'approved'
  `;
}

export interface ToolExecutionRecord {
  id: string;
  toolName: string;
  status: string;
  input: unknown;
  output: unknown;
  latencyMs: number | null;
  errorClass: string | null;
  createdAt: Date;
}

export async function findCompletedToolExecution(
  ownerId: string,
  taskId: string,
  digest: string,
): Promise<{ id: string; output: unknown } | undefined> {
  if (demo.isDemoMode()) {
    return demo.demoFindCompletedToolExecution(ownerId, taskId, digest);
  }
  const [execution] = await database()<Array<{ id: string; output: unknown }>>`
    SELECT id, output
    FROM tool_executions
    WHERE owner_id = ${ownerId} AND task_id = ${taskId} AND action_digest = ${digest}
      AND status = 'completed'
    ORDER BY completed_at DESC
    LIMIT 1
  `;
  return execution;
}

export async function startToolExecution(input: {
  trace: TraceContext;
  toolName: string;
  riskClass: string;
  capabilities: readonly string[];
  actionDigest: string;
  toolInput: unknown;
  approvalId?: string;
}): Promise<string> {
  if (demo.isDemoMode()) {
    return demo.demoStartToolExecution({
      ownerId: input.trace.ownerId,
      ...(input.trace.taskId ? { taskId: input.trace.taskId } : {}),
      toolName: input.toolName,
      digest: input.actionDigest,
      toolInput: input.toolInput,
    });
  }
  const sql = database();
  return sql.begin(async (transaction) => {
    const [tool] = await transaction<{ id: string }[]>`
      INSERT INTO tool_definitions (
        name, risk_class, capabilities, input_schema, output_schema, enabled
      )
      VALUES (
        ${input.toolName}, ${input.riskClass}::risk_class, ${transaction.json(input.capabilities)},
        '{}', '{}', true
      )
      ON CONFLICT (name) DO UPDATE SET risk_class = EXCLUDED.risk_class,
        capabilities = EXCLUDED.capabilities
      RETURNING id
    `;
    if (!tool) throw new Error("Unable to register tool");
    const [execution] = await transaction<{ id: string }[]>`
      INSERT INTO tool_executions (
        owner_id, task_id, tool_id, approval_id, action_digest, input, status, request_id, trace_id
      )
      VALUES (
        ${input.trace.ownerId}, ${input.trace.taskId ?? null}, ${tool.id},
        ${input.approvalId ?? null}, ${input.actionDigest}, ${transaction.json(input.toolInput as never)},
        'running', ${input.trace.requestId}, ${input.trace.traceId}
      )
      RETURNING id
    `;
    if (!execution) throw new Error("Unable to persist tool execution");
    if (input.trace.taskId) {
      await transaction`
        UPDATE tasks SET tool_call_count = tool_call_count + 1
        WHERE id = ${input.trace.taskId} AND owner_id = ${input.trace.ownerId}
      `;
    }
    return execution.id;
  });
}

export async function finishToolExecution(
  ownerId: string,
  executionId: string,
  result:
    | { status: "completed"; output: unknown; latencyMs: number }
    | { status: "failed"; errorClass: string; latencyMs: number },
): Promise<void> {
  if (demo.isDemoMode()) return demo.demoFinishToolExecution(ownerId, executionId, result);
  const sql = database();
  await sql`
    UPDATE tool_executions
    SET status = ${result.status}, output = ${
      result.status === "completed" ? sql.json(result.output as never) : null
    }, error_class = ${result.status === "failed" ? result.errorClass : null},
      latency_ms = ${Math.round(result.latencyMs)}, completed_at = now()
    WHERE id = ${executionId} AND owner_id = ${ownerId}
  `;
}

export async function listTaskToolExecutions(
  ownerId: string,
  taskId: string,
): Promise<ToolExecutionRecord[]> {
  if (demo.isDemoMode()) return demo.demoListTaskToolExecutions(ownerId, taskId);
  return database()<ToolExecutionRecord[]>`
    SELECT te.id, td.name AS tool_name, te.status, te.input, te.output, te.latency_ms,
      te.error_class, te.created_at
    FROM tool_executions te
    JOIN tool_definitions td ON td.id = te.tool_id
    WHERE te.owner_id = ${ownerId} AND te.task_id = ${taskId}
    ORDER BY te.created_at
  `;
}
