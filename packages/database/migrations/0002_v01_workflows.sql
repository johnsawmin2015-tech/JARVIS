BEGIN;

ALTER TABLE tasks
  ADD COLUMN plan JSONB,
  ADD COLUMN result JSONB,
  ADD COLUMN final_report TEXT,
  ADD COLUMN tool_call_count INTEGER NOT NULL DEFAULT 0 CHECK (tool_call_count >= 0),
  ADD COLUMN spent_usd NUMERIC(14, 8) NOT NULL DEFAULT 0 CHECK (spent_usd >= 0);

ALTER TABLE approvals
  ADD COLUMN resolution_reason TEXT,
  ADD COLUMN consumed_at TIMESTAMPTZ;

CREATE INDEX tasks_owner_updated_idx ON tasks (owner_id, created_at DESC, id);
CREATE INDEX tool_executions_task_time_idx ON tool_executions (task_id, created_at);
CREATE INDEX approvals_task_digest_idx ON approvals (task_id, action_digest, status);
CREATE INDEX memories_owner_content_idx ON memories (owner_id, updated_at DESC);
CREATE UNIQUE INDEX artifacts_task_report_unique
  ON artifacts (task_id, name) WHERE task_id IS NOT NULL AND name = 'Final task report';
CREATE UNIQUE INDEX memories_task_execution_unique
  ON memories (owner_id, source_id, type)
  WHERE source_type = 'system' AND type = 'execution';

COMMIT;
