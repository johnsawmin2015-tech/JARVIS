BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE task_status AS ENUM (
  'requested', 'classified', 'context_built', 'planned', 'authorized', 'queued',
  'running', 'observing', 'paused', 'waiting_approval', 'waiting_external',
  'retrying', 'verifying', 'completed', 'failed', 'cancelled', 'denied', 'expired', 'blocked'
);
CREATE TYPE risk_class AS ENUM ('R0', 'R1', 'R2', 'R3');
CREATE TYPE verification_status AS ENUM ('pending', 'running', 'passed', 'failed');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'denied', 'expired', 'consumed');
CREATE TYPE memory_status AS ENUM ('candidate', 'validated', 'stored', 'archived', 'deleted');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_digest TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE model_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  model_identifier TEXT NOT NULL,
  release TEXT NOT NULL,
  capabilities JSONB NOT NULL,
  pricing JSONB NOT NULL,
  policy JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'degraded', 'disabled')),
  documentation_verified_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, model_identifier)
);

CREATE TABLE model_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES model_registry(id),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  task_id UUID,
  request_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  status TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  cached_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost_usd NUMERIC(14, 8) NOT NULL DEFAULT 0 CHECK (estimated_cost_usd >= 0),
  latency_ms INTEGER CHECK (latency_ms >= 0),
  error_class TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  objective TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE goal_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  objective TEXT NOT NULL,
  status task_status NOT NULL DEFAULT 'requested',
  priority SMALLINT NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  type TEXT NOT NULL,
  input JSONB NOT NULL DEFAULT '{}',
  expected_output TEXT NOT NULL DEFAULT '',
  acceptance_criteria JSONB NOT NULL DEFAULT '[]',
  assigned_agent TEXT,
  risk_class risk_class NOT NULL DEFAULT 'R0',
  required_capabilities JSONB NOT NULL DEFAULT '[]',
  retry_policy JSONB NOT NULL,
  safety_limits JSONB NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  timeout_ms INTEGER NOT NULL CHECK (timeout_ms > 0),
  idempotency_key TEXT NOT NULL,
  checkpoint JSONB,
  failure_reason TEXT,
  verification_status verification_status NOT NULL DEFAULT 'pending',
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (owner_id, idempotency_key)
);

ALTER TABLE model_executions
  ADD CONSTRAINT model_executions_task_fk FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;

CREATE TABLE task_dependencies (
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, dependency_id),
  CHECK (task_id <> dependency_id)
);

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  capabilities JSONB NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id),
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  checkpoint JSONB,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_class TEXT
);

CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_timestamp TIMESTAMPTZ NOT NULL,
  confidence NUMERIC(4, 3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  importance NUMERIC(4, 3) NOT NULL CHECK (importance BETWEEN 0 AND 1),
  sensitivity TEXT NOT NULL,
  scope TEXT NOT NULL,
  status memory_status NOT NULL DEFAULT 'candidate',
  verified BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memory_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL UNIQUE REFERENCES memories(id) ON DELETE CASCADE,
  model_identifier TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tool_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  risk_class risk_class NOT NULL,
  capabilities JSONB NOT NULL,
  input_schema JSONB NOT NULL,
  output_schema JSONB NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  action_digest TEXT NOT NULL,
  action JSONB NOT NULL,
  status approval_status NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (char_length(action_digest) = 64)
);

CREATE TABLE credential_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider_reference TEXT NOT NULL,
  environment TEXT NOT NULL,
  allowed_capabilities JSONB NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name, environment)
);

CREATE TABLE tool_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  tool_id UUID NOT NULL REFERENCES tool_definitions(id),
  approval_id UUID REFERENCES approvals(id),
  action_digest TEXT NOT NULL,
  input JSONB NOT NULL,
  output JSONB,
  status TEXT NOT NULL,
  request_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  latency_ms INTEGER CHECK (latency_ms >= 0),
  error_class TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL
);

CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rules JSONB NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  artifact_id UUID REFERENCES artifacts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  status TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  UNIQUE (document_id, ordinal)
);

CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  family TEXT NOT NULL,
  payload JSONB NOT NULL,
  request_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  decision TEXT NOT NULL,
  details JSONB NOT NULL,
  request_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE usage_records (
  id BIGSERIAL PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  model_execution_id UUID REFERENCES model_executions(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  quantity NUMERIC(20, 6) NOT NULL CHECK (quantity >= 0),
  estimated_cost_usd NUMERIC(14, 8) NOT NULL CHECK (estimated_cost_usd >= 0),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE evaluation_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  input JSONB NOT NULL,
  expected JSONB NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE evaluation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES evaluation_cases(id),
  model_id UUID REFERENCES model_registry(id),
  status TEXT NOT NULL,
  score NUMERIC(5, 4) CHECK (score BETWEEN 0 AND 1),
  metrics JSONB NOT NULL DEFAULT '{}',
  evidence JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Composite ownership constraints prevent an application bug from linking one owner's
-- resource to another owner's parent, even when both UUIDs are otherwise valid.
ALTER TABLE projects ADD CONSTRAINT projects_id_owner_unique UNIQUE (id, owner_id);
ALTER TABLE conversations ADD CONSTRAINT conversations_id_owner_unique UNIQUE (id, owner_id);
ALTER TABLE goals ADD CONSTRAINT goals_id_owner_unique UNIQUE (id, owner_id);
ALTER TABLE tasks ADD CONSTRAINT tasks_id_owner_unique UNIQUE (id, owner_id);
ALTER TABLE approvals ADD CONSTRAINT approvals_id_owner_unique UNIQUE (id, owner_id);
ALTER TABLE artifacts ADD CONSTRAINT artifacts_id_owner_unique UNIQUE (id, owner_id);
ALTER TABLE documents ADD CONSTRAINT documents_id_owner_unique UNIQUE (id, owner_id);

ALTER TABLE conversations ADD CONSTRAINT conversations_project_owner_fk
  FOREIGN KEY (project_id, owner_id) REFERENCES projects(id, owner_id);
ALTER TABLE messages ADD CONSTRAINT messages_conversation_owner_fk
  FOREIGN KEY (conversation_id, owner_id) REFERENCES conversations(id, owner_id);
ALTER TABLE goals ADD CONSTRAINT goals_project_owner_fk
  FOREIGN KEY (project_id, owner_id) REFERENCES projects(id, owner_id);
ALTER TABLE goal_milestones ADD CONSTRAINT milestones_goal_owner_fk
  FOREIGN KEY (goal_id, owner_id) REFERENCES goals(id, owner_id);
ALTER TABLE tasks ADD CONSTRAINT tasks_project_owner_fk
  FOREIGN KEY (project_id, owner_id) REFERENCES projects(id, owner_id);
ALTER TABLE tasks ADD CONSTRAINT tasks_parent_owner_fk
  FOREIGN KEY (parent_task_id, owner_id) REFERENCES tasks(id, owner_id);
ALTER TABLE task_dependencies ADD CONSTRAINT dependencies_task_owner_fk
  FOREIGN KEY (task_id, owner_id) REFERENCES tasks(id, owner_id);
ALTER TABLE task_dependencies ADD CONSTRAINT dependencies_parent_owner_fk
  FOREIGN KEY (dependency_id, owner_id) REFERENCES tasks(id, owner_id);
ALTER TABLE approvals ADD CONSTRAINT approvals_task_owner_fk
  FOREIGN KEY (task_id, owner_id) REFERENCES tasks(id, owner_id);
ALTER TABLE artifacts ADD CONSTRAINT artifacts_project_owner_fk
  FOREIGN KEY (project_id, owner_id) REFERENCES projects(id, owner_id);
ALTER TABLE documents ADD CONSTRAINT documents_project_owner_fk
  FOREIGN KEY (project_id, owner_id) REFERENCES projects(id, owner_id);
ALTER TABLE document_chunks ADD CONSTRAINT chunks_document_owner_fk
  FOREIGN KEY (document_id, owner_id) REFERENCES documents(id, owner_id);

CREATE INDEX tasks_owner_status_idx ON tasks (owner_id, status, created_at DESC);
CREATE INDEX events_owner_time_idx ON events (owner_id, occurred_at DESC);
CREATE INDEX events_task_idx ON events (task_id, id);
CREATE INDEX memories_owner_scope_idx ON memories (owner_id, project_id, status);
CREATE INDEX approvals_owner_status_idx ON approvals (owner_id, status, expires_at);
CREATE INDEX messages_conversation_time_idx ON messages (conversation_id, created_at);
CREATE INDEX usage_owner_time_idx ON usage_records (owner_id, occurred_at DESC);

COMMIT;
