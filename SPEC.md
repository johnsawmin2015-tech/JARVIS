# JARVIS — Final System Specification

**Project name:** JARVIS  
**Document:** `SPEC.md`  
**Status:** Final consolidated specification  
**Audience:** Product owner, software engineers, AI engineers, security engineers, DevOps engineers  
**Primary deployment target:** Web-first personal AI system  
**Architecture class:** Agentic application / personal intelligence platform

---

## 0. Executive Summary

JARVIS is a persistent personal intelligence system designed to turn high-level human objectives into reliable, observable, and permissioned work.

JARVIS is **not** a foundation model and is **not** simply a chatbot. Frontier models provide reasoning; deterministic software provides identity, state, memory, tool permissions, execution controls, verification, persistence, observability, and recovery.

The central architectural rule is:

> **Probabilistic AI proposes and reasons; deterministic software validates, constrains, records, and executes.**

JARVIS should eventually support:

- conversational interaction
- persistent memory
- goals and projects
- task planning
- multi-step agent execution
- web research
- document/file intelligence
- GitHub/software engineering
- browser and computer-use workflows
- secure code execution
- tool/MCP integration
- independent verification
- approval workflows
- proactive assistance
- long-running tasks
- cost and usage control

The human remains the final authority for consequential actions.

---

# 1. Final Audit Verdict

## 1.1 Overall assessment

The previous `plan.md`, `architecture.md`, `requirements.md`, and `roadmap.md` form a strong conceptual foundation. The core ideas are sound:

- model/provider abstraction
- explicit task state
- typed tools
- capability-based permissions
- exact-action approvals
- sandboxing
- event logging
- independent verification
- durable memory
- staged rollout

However, the previous design was **conceptually stronger than its operational specification**. The final audit identifies several areas that must be made explicit before implementation is treated as production-oriented.

## 1.2 Key corrections introduced by this specification

### A. Separate three execution planes

JARVIS must distinguish:

1. **Interactive plane** — low-latency conversations.
2. **Durable task plane** — long-running planning and agent work.
3. **Execution plane** — isolated browser/code/tool workers.

A long-running agent must never depend on the lifetime of a web request.

### B. Make the control plane authoritative

The model must never directly decide whether an action is permitted.

The flow is:

```text
Model proposal
    ↓
Schema validation
    ↓
Policy evaluation
    ↓
Risk classification
    ↓
Approval check
    ↓
Credential injection by broker
    ↓
Tool execution
    ↓
Result validation
    ↓
Audit event
```

### C. Add a secret broker

Models and prompts should not receive raw API keys or production credentials. The tool runtime requests narrowly scoped credentials from a server-side secret broker.

### D. Define memory lifecycle

Memory is not simply “store embeddings.” Every durable memory requires provenance, confidence, scope, type, timestamps, lifecycle state, and deletion behavior.

### E. Separate generation from verification

A model saying “done” is not evidence of success.

JARVIS must maintain explicit acceptance criteria and independent verification for meaningful tasks.

### F. Introduce evaluation as a permanent subsystem

Agent quality must be measured continuously, not only during development.

### G. Prefer a simpler initial agent runtime

For the first implementation, use the Vercel AI SDK agent/tool-loop capabilities where they fit, plus a small deterministic task/state layer. Introduce a heavier workflow framework only when durable workflow complexity demonstrably requires it.

### H. Use an AI gateway/control point

For multi-model operation, put routing, provider selection, fallback, spend controls, and observability behind a gateway abstraction. Vercel AI Gateway is an appropriate option for this architecture, while the application should still retain an internal provider-neutral interface. Vercel documents unified provider access, routing/fallbacks, usage observability, budgets, and provider policies. citeturn792820search2turn792820search3

---

# 2. Product Vision

## 2.1 North-star statement

> **Give JARVIS an objective, not merely a question.**

JARVIS should be able to understand intent, construct a plan, gather information, call tools, execute controlled actions, verify results, remember useful outcomes, recover from failures, and report what happened.

## 2.2 Example north-star workflow

User:

> Research a technology, compare the viable approaches, design a solution, build a prototype, test it, document it, and show me the result.

JARVIS:

```text
Understand
  ↓
Define acceptance criteria
  ↓
Research
  ↓
Synthesize evidence
  ↓
Plan
  ↓
Create task graph
  ↓
Execute
  ↓
Use tools
  ↓
Build
  ↓
Test
  ↓
Critique
  ↓
Fix
  ↓
Verify independently
  ↓
Persist artifacts + memory
  ↓
Report outcome + limitations
```

---

# 3. Scope

## 3.1 In scope

- Personal AI assistant
- Persistent user identity
- Conversations
- Long-term goals
- Projects
- Tasks and task dependencies
- AI model routing
- Tool calling
- MCP integration
- Web research
- File/document context
- GitHub integration
- Sandboxed code execution
- Browser automation
- Computer-use workflows
- Verification
- Audit logs
- Human approvals
- Usage/cost telemetry
- Proactive assistance
- Long-running jobs

## 3.2 Out of scope for v0.1

- Foundation-model training
- Unrestricted desktop control
- Autonomous financial transactions
- Autonomous production infrastructure changes
- Autonomous deletion of critical data
- Fully autonomous communication with arbitrary external parties
- Multi-tenant enterprise administration
- Full mobile application
- Graph database infrastructure unless justified by measured workloads
- General-purpose AGI claims

---

# 4. Users and Trust Model

## 4.1 Primary user

The system owner/operator.

## 4.2 Future users

- collaborators
- delegated users
- administrators
- tool/plugin developers

## 4.3 Trust boundaries

Treat the following as untrusted by default:

- model outputs
- user-provided documents
- web pages
- retrieved text
- repository contents
- emails/messages
- MCP server results
- browser content
- generated code

Never let untrusted content override system policy.

---

# 5. Core Design Principles

1. **Deterministic control around probabilistic reasoning.**
2. **Least privilege by default.**
3. **Human approval for consequential actions.**
4. **Independent verification for meaningful outputs.**
5. **Persistent state must be explicit and recoverable.**
6. **All important actions are observable and auditable.**
7. **Model providers are replaceable.**
8. **Fast interactive UX must be separated from durable background work.**
9. **Untrusted content is data, not authority.**
10. **Do not use an AI agent where deterministic software is sufficient.**
11. **Optimize for cost per successful task, not cost per generation.**
12. **No autonomy without evaluation and recovery.**

---

# 6. Current AI Foundation

JARVIS should be capable of using multiple frontier models through a provider-neutral abstraction.

## 6.1 GPT-6 Astra

The current OpenAI documentation describes GPT-6 Astra as OpenAI's most capable model for demanding reasoning, coding, computer use, research, and document creation. It supports a 1,050,000-token context window, 128,000-token maximum output, and tools including web search, file search, code interpreter, hosted shell, computer use, MCP, tool search, image generation, and patch application. citeturn689406search2

OpenAI also documents GPT-6 Astra as suitable for complex multi-step workflows across code, browsers, and professional software. citeturn689406search9

## 6.2 Claude Opus 5.5

Anthropic currently documents Claude Opus 5.5 as a model for long-running agentic coding and knowledge work, with a 1M-token context window, 128K maximum output, adaptive thinking, and current API model ID `claude-opus-5-5`. citeturn689406search1

Anthropic also documents current browser-use tooling for live webpages, with explicit warnings that webpage content is untrusted and actions can have real effects. citeturn689406search4

## 6.3 Model policy

The application must **never hard-code capability assumptions from memory**.

Maintain a model registry containing:

- provider
- model identifier
- release/version
- context limits
- output limits
- capabilities
- pricing
- latency class
- data-policy class
- supported tools
- fallback models
- status

Model IDs and capabilities must be verified against current provider documentation during implementation and periodically thereafter.

---

# 7. Recommended Technology Stack

## 7.1 Application

- TypeScript
- Node.js
- Next.js App Router
- React
- Tailwind CSS
- shadcn/ui
- Zod

Next.js currently documents the App Router as the newer router supporting modern React features, and its current getting-started guidance recommends `pnpm` as a package manager. citeturn547983search6turn547983search0

## 7.2 AI application layer

- Vercel AI SDK for streaming, model abstraction, structured generation, tool calling, and agent loops where appropriate
- AI Gateway or equivalent gateway layer for multi-provider routing/fallbacks
- Direct provider adapters where a provider-specific capability is necessary

## 7.3 AI models

Primary:

- GPT-6 Astra
- Claude Opus 5.5

Secondary/worker models:

- lower-cost reasoning models
- fast classification/extraction models
- dedicated embedding models
- dedicated speech/transcription models later

## 7.4 Data

- PostgreSQL
- pgvector
- Redis
- S3-compatible object storage

Optional later:

- Neo4j only if graph workloads prove necessary

## 7.5 Agent runtime

- deterministic task/state machine
- Vercel AI SDK tool-loop agent capabilities for v0.x interactive agents
- durable queue/workers for long-running tasks
- workflow framework only when required

## 7.6 Tools

- MCP
- GitHub API
- browser automation
- filesystem/document tools
- terminal/shell
- deployment tools
- notifications
- calendar
- selected external APIs

MCP currently supports standardized tool, resource, and prompt capabilities and multiple transports; JARVIS should treat external MCP servers as untrusted integrations that must still pass JARVIS policy checks. citeturn547983search1turn547983search3

## 7.7 Browser/computer use

- Playwright for deterministic browser automation
- model computer-use APIs for cases where visual interaction is required
- isolated browser sessions

OpenAI currently recommends code-execution-driven computer use for GPT-6 Astra, while its computer-use alternative remains supported. citeturn689406search0turn689406search3

## 7.8 Execution isolation

Initial:

- ephemeral containers
- resource limits
- network allowlists
- automatic cleanup

Stronger isolation later:

- gVisor
- Firecracker/microVMs
- dedicated sandbox workers

OpenAI's shell guidance explicitly recommends sandboxing, allowlists/denylists where possible, and tool logging; it also warns that network allowlists can introduce exfiltration risks. citeturn689406search5

## 7.9 Infrastructure

Prototype:

- Vercel
- managed PostgreSQL
- managed Redis
- object storage
- AI gateway/provider APIs

Growth:

- dedicated worker infrastructure
- queue
- isolated sandbox cluster
- object storage + CDN
- dedicated observability stack

Cloud portability must be preserved.

---

# 8. Logical Architecture

```text
                           HUMAN
                             │
                             ▼
                    ┌─────────────────┐
                    │   JARVIS UI     │
                    │ Chat / Tasks /   │
                    │ Projects / Ops   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ AUTH + API      │
                    │ CONTROL PLANE   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        Conversation      Task API      Approval API
              │              │              │
              └──────────────┼──────────────┘
                             ▼
                    ┌─────────────────┐
                    │ CONTEXT ENGINE  │
                    │ Memory + Files  │
                    │ Goals + Project │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ MODEL ROUTER    │
                    │ Policy + Budget │
                    └────────┬────────┘
                             │
                   ┌─────────┴─────────┐
                   ▼                   ▼
            GPT-6 Astra          Opus 5.5
                   │                   │
                   └─────────┬─────────┘
                             ▼
                    ┌─────────────────┐
                    │ AGENT RUNTIME   │
                    │ Plan / Execute  │
                    │ Observe / Retry │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ POLICY ENGINE   │
                    │ Risk / AuthZ    │
                    └────────┬────────┘
                             │
               ┌─────────────┼─────────────┐
               ▼             ▼             ▼
            Allowed       Approval       Denied
               │             │
               │             ▼
               │         HUMAN DECISION
               │             │
               └───────┬─────┘
                       ▼
               ┌──────────────┐
               │ TOOL GATEWAY │
               └──────┬───────┘
                      │
       ┌──────────────┼────────────────────┐
       ▼              ▼                    ▼
    Browser         GitHub              Sandbox
    MCP             APIs                Code
    Files           APIs                Shell
       │              │                    │
       └──────────────┼────────────────────┘
                      ▼
                RESULT VALIDATOR
                      │
                ┌─────┴─────┐
                ▼           ▼
             Verified     Failed
                │           │
                ▼           ▼
             Memory      Retry/Replan
                │
                ▼
            AUDIT/EVENTS
```

---

# 9. Execution Planes

## 9.1 Interactive plane

Purpose:

- chat
- quick answers
- small tool calls
- user-facing streaming

Target properties:

- low latency
- request-scoped state
- no dependence on background worker lifetime

## 9.2 Durable task plane

Purpose:

- multi-step objectives
- long-running research
- coding tasks
- scheduled work
- resumable workflows

Properties:

- persisted task state
- checkpoints
- retry policies
- queue-based execution
- worker recovery

## 9.3 Execution plane

Purpose:

- code execution
- shell commands
- browser sessions
- isolated tools

Properties:

- ephemeral
- permissioned
- resource-limited
- network-restricted
- fully logged

---

# 10. Core Components

## 10.1 JARVIS Core

Responsibilities:

- interpret user intent
- select interaction mode
- coordinate agents
- maintain overall objective state
- present results

JARVIS Core should **not** directly execute privileged actions.

## 10.2 Planner

Produces:

- objective interpretation
- assumptions
- acceptance criteria
- task graph
- dependencies
- risk assessment
- expected artifacts

Planning output must be schema-valid.

## 10.3 Research Agent

Responsibilities:

- web search
- source collection
- source relevance assessment
- evidence synthesis
- citation preservation
- uncertainty reporting

Research output must preserve source references and retrieval timestamps.

## 10.4 Coding Agent

Responsibilities:

- repository inspection
- implementation
- tests
- debugging
- refactoring
- documentation
- pull-request preparation

No coding agent may directly modify protected production resources without policy authorization.

## 10.5 Browser Agent

Responsibilities:

- browser navigation
- UI testing
- permitted workflows
- visual page inspection

Browser results must be treated as untrusted input.

## 10.6 File Agent

Responsibilities:

- parse supported files
- extract structured information
- summarize
- transform documents
- create artifacts

## 10.7 Critic Agent

Attempts to falsify or weaken the proposed result.

Questions:

- What assumption could be wrong?
- What requirement is missing?
- What evidence is weak?
- What failure mode was ignored?
- What could make this result unusable?

## 10.8 Verification Agent

Independent from the original generation path where practical.

Verification should inspect:

- acceptance criteria
- generated artifacts
- test results
- source evidence
- tool results
- expected state transitions

---

# 11. Agent Lifecycle

```text
REQUESTED
   ↓
CLASSIFIED
   ↓
CONTEXT_BUILT
   ↓
PLANNED
   ↓
AUTHORIZED
   ↓
EXECUTING
   ↓
OBSERVING
   ↓
VERIFYING
   ├── PASS → COMPLETED
   └── FAIL → DIAGNOSED
                 ↓
            RETRY / REPLAN
                 ↓
             EXECUTING
```

Terminal states:

- completed
- failed
- cancelled
- denied
- expired
- blocked

---

# 12. Task Model

Every task should contain at minimum:

```text
id
parentTaskId
projectId
objective
status
priority
type
input
expectedOutput
acceptanceCriteria
dependencies
assignedAgent
riskClass
requiredCapabilities
retryPolicy
attemptCount
timeout
createdAt
startedAt
completedAt
failureReason
verificationStatus
```

Tasks must be idempotent where possible.

---

# 13. Context Engineering

JARVIS must not blindly send all available memory to a model.

The context engine should construct a task-specific context package containing:

1. system policy
2. application policy
3. current user request
4. relevant conversation state
5. selected memories
6. project state
7. task state
8. tool schemas
9. source evidence
10. explicit output contract

Retrieved content is always lower priority than system/application policy.

---

# 14. Memory System

## 14.1 Memory classes

### Working memory

Current conversation and active task state.

### Episodic memory

Past interactions, completed tasks, mistakes, and outcomes.

### Semantic memory

Reusable facts and extracted knowledge.

### Project memory

Requirements, architecture, decisions, repositories, dependencies, artifacts.

### Goal memory

Long-term objectives and progress.

### Preference memory

Stable user preferences and interaction conventions.

### Execution memory

Agent attempts, tool outcomes, errors, recovery paths.

## 14.2 Memory record

Every durable memory should include:

```text
id
ownerId
projectId(optional)
type
content
sourceType
sourceId
sourceTimestamp
createdAt
updatedAt
confidence
importance
sensitivity
scope
status
expiresAt(optional)
embeddingId(optional)
```

## 14.3 Memory provenance

JARVIS must know:

- where a memory came from
- when it was created
- whether it was user-provided or AI-derived
- whether it was verified
- what scope it belongs to

## 14.4 Memory lifecycle

```text
Candidate
   ↓
Validated
   ↓
Stored
   ↓
Retrieved
   ↓
Revalidated when necessary
   ↓
Updated / Archived / Deleted
```

Do not automatically promote every model statement to durable memory.

---

# 15. Tool Architecture

Use a common typed tool contract.

Conceptually:

```ts
interface Tool<Input, Output> {
  name: string;
  description: string;
  inputSchema: Schema<Input>;
  outputSchema: Schema<Output>;
  riskClass: RiskClass;
  capabilities: Capability[];
  execute(ctx: ToolContext, input: Input): Promise<Output>;
}
```

A tool must not decide its own authorization.

---

# 16. Tool Lifecycle

```text
MODEL PROPOSES TOOL CALL
        ↓
SCHEMA VALIDATION
        ↓
CAPABILITY CHECK
        ↓
RISK CLASSIFICATION
        ↓
POLICY ENGINE
   ┌────┼────┐
   ▼    ▼    ▼
ALLOW APPROVAL DENY
   │    │
   │    ▼
   │ HUMAN APPROVAL
   │    │
   └────┴───────┐
                ▼
         SECRET BROKER
                ↓
          TOOL EXECUTION
                ↓
          OUTPUT VALIDATION
                ↓
           AUDIT EVENT
```

---

# 17. Capability Model

Examples:

```text
conversation.read
memory.read
memory.write
document.read
document.write
web.search
web.fetch
browser.navigate
browser.interact
filesystem.read
filesystem.write
repo.read
repo.branch.create
repo.commit
repo.pull_request
sandbox.execute
sandbox.network
preview.deploy
production.deploy
email.draft
email.send
calendar.read
calendar.write
finance.read
finance.transact
```

Permissions must be evaluated server-side.

---

# 18. Risk Classes

## R0 — Passive

Examples:

- search
- read public documentation
- summarize
- classify

No approval normally required.

## R1 — Reversible low-impact

Examples:

- create temporary files
- create draft artifacts
- create a branch
- run tests

May be automatic if capability is granted.

## R2 — Controlled external modification

Examples:

- create pull request
- modify cloud preview resources
- change non-critical settings

Approval can be policy-dependent.

## R3 — Consequential / irreversible

Examples:

- production deployment
- deleting data
- sending external messages
- changing privileged permissions
- financial transactions

Explicit approval required.

---

# 19. Approval System

Approvals must be:

- exact-action scoped
- time limited
- user-bound
- non-transferable
- auditable

Approval request should display:

```text
Action
Target
Reason
Inputs
Expected effect
Risk level
Credentials/capabilities used
Rollback information
Expiry
```

Never implement a vague “approve this session forever” mechanism for privileged actions.

---

# 20. Secret Management

## Requirement

The model should not see raw provider or production secrets unless there is a specific, unavoidable, reviewed reason.

Use a server-side secret broker.

```text
Tool Request
    ↓
Capability check
    ↓
Secret broker
    ↓
Short-lived/scoped credential
    ↓
Execution runtime
```

Requirements:

- environment separation
- short-lived credentials where possible
- least privilege
- rotation
- revocation
- auditability
- no secrets in model context
- no secrets in logs
- no secrets in generated artifacts

---

# 21. Prompt Injection and Untrusted Content Defense

Treat as untrusted:

- web content
- PDFs/documents
- emails
- repository README files
- issue comments
- source code comments
- browser DOM content
- MCP tool outputs

JARVIS must preserve instruction hierarchy:

```text
System policy
  ↓
Application policy
  ↓
User-authorized objective
  ↓
Tool contracts
  ↓
Retrieved/untrusted content
```

Retrieved content must never gain instruction authority simply because it appears in context.

High-risk actions triggered by untrusted content require stronger scrutiny and approval.

---

# 22. Browser and Computer Use

## Rules

1. Use deterministic APIs when available.
2. Prefer browser automation over visual computer use for deterministic tasks.
3. Use computer use when visual interaction is genuinely required.
4. Isolate sessions.
5. Restrict network access.
6. Never expose production credentials to uncontrolled browser sessions.
7. Require approval for consequential external actions.
8. Preserve screenshots/logs for important workflows.

OpenAI's current computer-use guidance supports browser/desktop operation and recommends code execution for GPT-6 Astra workflows; Anthropic documents live browser use and its security implications. citeturn689406search0turn689406search4

---

# 23. Code Execution Sandbox

Every generated-code execution must occur in an isolated environment.

Required controls:

- isolated filesystem
- CPU quota
- memory quota
- timeout
- process restrictions
- restricted network
- package/dependency policy
- no access to host production credentials
- execution logs
- automatic teardown

For networked execution, default-deny is preferred. Explicit allowlists must be treated as security-sensitive because prompt injection can attempt data exfiltration. OpenAI explicitly highlights this risk in its shell guidance. citeturn689406search5

---

# 24. Research System

Research should preserve evidence.

Every research artifact should contain:

- question
- search strategy
- sources
- retrieval date/time
- source title
- source location
- relevant evidence
- synthesis
- uncertainty
- conflicting evidence

The model must not silently turn unsupported claims into facts.

For current topics, JARVIS should prefer fresh primary/authoritative sources.

---

# 25. File Intelligence

Supported file types should be explicitly registered.

Pipeline:

```text
Upload
  ↓
File validation
  ↓
Malware/content policy
  ↓
Extraction
  ↓
Chunking / structure preservation
  ↓
Metadata
  ↓
Indexing
  ↓
Task-specific retrieval
```

Large documents should not be blindly injected wholesale into every prompt.

---

# 26. GitHub / Software Engineering System

The coding subsystem should support:

```text
Issue / Objective
      ↓
Repository inspection
      ↓
Requirements interpretation
      ↓
Implementation plan
      ↓
Branch creation
      ↓
Code changes
      ↓
Unit tests
      ↓
Integration tests
      ↓
Static analysis
      ↓
Security checks
      ↓
Code review
      ↓
Pull request
      ↓
Preview deployment
      ↓
Human approval
      ↓
Production
```

Protected branches and production environments must remain protected by infrastructure policy, not by a prompt.

---

# 27. Event Model

Important state transitions must emit structured events.

Minimum event families:

```text
conversation.created
message.created
model.requested
model.completed
model.failed
plan.created
plan.updated
task.created
task.started
task.paused
task.failed
task.retrying
tool.requested
tool.allowed
tool.denied
tool.approval_required
tool.approved
tool.executed
tool.failed
sandbox.created
sandbox.destroyed
artifact.created
memory.candidate_created
memory.stored
memory.updated
approval.requested
approval.resolved
verification.started
verification.passed
verification.failed
```

Events are append-oriented and should be suitable for audit and recovery.

---

# 28. Data Model

Initial relational entities:

```text
User
Session
Conversation
Message
Model
ModelExecution
Memory
MemoryEmbedding
Goal
GoalMilestone
Project
ProjectMember(optional future)
Task
TaskDependency
Agent
AgentExecution
Tool
ToolExecution
Capability
Policy
Approval
CredentialReference
Artifact
Document
DocumentChunk
Event
AuditLog
UsageRecord
EvaluationRun
EvaluationCase
```

Use relational constraints for ownership and authorization boundaries.

---

# 29. Multi-Tenancy Readiness

Even if v0.1 is single-user, design database records around an owner/tenant boundary.

Every resource should have an ownership path that can be checked server-side.

Example:

```text
User
 ├── Conversations
 ├── Memories
 ├── Goals
 ├── Projects
 │    ├── Tasks
 │    ├── Artifacts
 │    └── Documents
 └── Approvals
```

Never trust client-provided owner IDs.

---

# 30. API Architecture

## 30.1 Request path

```text
Client
 ↓
Authentication
 ↓
Authorization
 ↓
Validation
 ↓
Application service
 ↓
Persistence / AI / task submission
```

## 30.2 Long-running task path

```text
Client
 ↓
Create task
 ↓
Persist task
 ↓
Queue
 ↓
Worker
 ↓
Agent execution
 ↓
Events
 ↓
UI subscription
```

The HTTP request must not remain open for a multi-hour workflow.

---

# 31. Frontend Requirements

Primary views:

1. **Command / Chat** — conversational control surface.
2. **Tasks** — active and historical execution.
3. **Projects** — persistent workspaces.
4. **Memory** — inspectable durable memory.
5. **Approvals** — pending consequential actions.
6. **Activity** — event timeline.
7. **Artifacts** — generated files and outputs.
8. **Usage** — tokens, costs, latency.
9. **Settings** — models, tools, permissions, integrations.

The UI should make agent activity legible without exposing hidden chain-of-thought. Show concise progress states, tool actions, sources, outputs, failures, and verification results.

---

# 32. Repository Structure

```text
jarvis/
├── apps/
│   └── web/
│
├── packages/
│   ├── ai/
│   ├── agents/
│   ├── context/
│   ├── memory/
│   ├── tools/
│   ├── security/
│   ├── database/
│   ├── evaluation/
│   ├── shared/
│   └── ui/
│
├── services/
│   ├── worker/
│   ├── browser/
│   └── sandbox/
│
├── docs/
│   ├── architecture/
│   ├── security/
│   ├── agents/
│   ├── tools/
│   └── operations/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── agent/
│   └── security/
│
├── scripts/
├── .env.example
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
├── SPEC.md
├── plan.md
├── architecture.md
├── requirements.md
└── roadmap.md
```

---

# 33. Package Responsibilities

## `packages/ai`

- provider abstraction
- model registry
- model router
- token/cost accounting
- generation policies

## `packages/agents`

- agent definitions
- planner
- task state machine
- execution loop
- retry/replan logic

## `packages/context`

- context assembly
- retrieval policy
- context budgeting
- instruction hierarchy

## `packages/memory`

- memory lifecycle
- storage
- retrieval
- provenance
- embedding management

## `packages/tools`

- typed tool contracts
- registry
- adapters
- result validation

## `packages/security`

- RBAC
- capability checks
- policy engine
- approval logic
- secret references

## `packages/evaluation`

- evaluation datasets
- task replay
- metrics
- regression testing

## `packages/database`

- schemas
- migrations
- repositories/data access
- transaction helpers

---

# 34. AI Model Router

The router should consider:

- task type
- reasoning complexity
- tool requirements
- context size
- latency budget
- cost budget
- required reliability
- provider health
- data policy
- user/project policy

Example policy:

```text
LOW complexity
 → fast/cheap model

MEDIUM complexity
 → balanced model

HIGH complexity
 → GPT-6 Astra or Opus 5.5

HIGH-RISK / HIGH-VALUE
 → primary frontier model
 → independent verifier
 → optional second-model critique
```

Routing rules should live in configuration/policy, not be scattered throughout application code.

Vercel AI Gateway currently supports provider routing, fallbacks, budgets, observability, and provider policy controls, making it a reasonable production routing layer. citeturn792820search2turn792820search4

---

# 35. Verification Architecture

Verification is a first-class subsystem.

## 35.1 Verification types

### Structural

Did the expected files, records, or objects exist?

### Functional

Did the code/task actually work?

### Semantic

Does the result satisfy the stated objective?

### Evidence

Are factual claims supported by sources/results?

### Security

Did the action stay within policy?

## 35.2 Verification rule

Generation and verification should use independent evidence whenever possible.

Bad:

```text
Agent says success → accept
```

Good:

```text
Agent generates result
        ↓
Independent checks
        ↓
Tests / evidence / state inspection
        ↓
Pass or fail
```

---

# 36. Reliability Engineering

Required mechanisms:

- explicit task states
- retries with exponential backoff
- retry budgets
- idempotency keys
- checkpoints
- resumable execution
- dead-letter handling
- circuit breakers
- provider failover
- timeout policies
- cancellation
- partial-result handling

A failed tool call must not silently cause the system to hallucinate completion.

---

# 37. Observability

Every important operation should have a trace context.

Capture:

- request ID
- trace ID
- user/tenant ID
- project ID
- task ID
- agent ID
- model/provider
- tool name
- latency
- token usage
- estimated cost
- status
- retry count
- error class
- verification result

Recommended:

- OpenTelemetry
- Sentry
- structured JSON logging

---

# 38. Cost Controls

JARVIS must enforce budgets at multiple levels:

```text
User
 ├── Daily budget
 ├── Monthly budget
 └── Task budget
```

Optional future layers:

- project budget
- agent budget
- model budget
- tool-call budget

The system should stop or downgrade work when the policy limit is reached.

Track:

- input tokens
- cached input tokens
- output tokens
- tool-call charges
- sandbox costs
- storage costs
- total task cost
- cost per successful task

---

# 39. Privacy and Data Protection

Requirements:

- data minimization
- authenticated access
- server-side authorization
- encryption in transit
- encrypted storage through managed infrastructure
- scoped access to documents
- explicit retention policies
- deletion support
- no unnecessary prompt retention
- secret isolation

If a gateway/provider is used, data-routing policy must be explicit. Vercel AI Gateway currently documents controls for provider allowlists, zero-data-retention routing, no-training routing, budgets, and request observability; these must still be configured appropriately for the deployment. citeturn792820search2turn792820search11

---

# 40. Security Threat Model

Major threats:

1. Prompt injection
2. Tool abuse
3. Credential exfiltration
4. Cross-user data leakage
5. Malicious file uploads
6. Malicious repository content
7. Browser-based exfiltration
8. Supply-chain attacks
9. Sandbox escape
10. Excessive permissions
11. Unbounded agent loops
12. Accidental destructive actions
13. Provider/API outage
14. Model regression
15. Cost runaway

Every threat must map to at least one control and one test.

---

# 41. Agent Loop Safety Limits

Every task must have:

- max steps
- max retries
- max wall-clock duration
- max model spend
- max tool calls
- max concurrent workers
- cancellation support

Example:

```text
MAX_STEPS = 100
MAX_RETRIES = 5
MAX_DURATION = 60 min
MAX_COST = configured per task
```

Values should be configurable rather than hard-coded in business logic.

---

# 42. Tool Result Validation

Tools must return typed results.

Do not blindly inject arbitrary tool output into the next model call.

Result pipeline:

```text
Raw result
 ↓
Schema validation
 ↓
Normalization
 ↓
Security classification
 ↓
Context packaging
 ↓
Model
```

---

# 43. MCP Strategy

MCP should be used as an integration standard, not as an authorization bypass.

For every MCP server:

- identify owner/source
- define capabilities
- define trust level
- define allowed operations
- define data access scope
- log calls
- isolate credentials
- validate responses

Current MCP implementations expose tools, resources, prompts, and capability negotiation; JARVIS should use only the subsets actually needed for each integration. citeturn547983search1turn547983search3

---

# 44. Evaluation Framework

JARVIS needs a permanent evaluation suite.

## 44.1 Core metrics

| Metric                       | Target direction     |
| ---------------------------- | -------------------- |
| Task success rate            | Higher               |
| Verification pass rate       | Higher               |
| Recovery rate                | Higher               |
| Unauthorized-action rate     | Near zero            |
| Tool-call error rate         | Lower                |
| Human intervention rate      | Lower for safe tasks |
| Cost per successful task     | Lower                |
| Median time to useful output | Lower                |
| False completion rate        | Near zero            |
| Memory retrieval precision   | Higher               |

## 44.2 Evaluation categories

- chat quality
- planning
- tool selection
- tool parameter correctness
- coding
- research grounding
- memory retrieval
- prompt injection resistance
- permission enforcement
- recovery
- cost behavior
- regression testing

## 44.3 Golden tasks

Maintain representative end-to-end tasks with known expected outcomes.

Every meaningful model/provider change should be tested against these tasks.

---

# 45. Testing Strategy

## Unit tests

- authorization
- policy rules
- routing
- memory logic
- schemas
- task transitions
- cost calculations

## Integration tests

- AI providers
- database
- Redis
- tool registry
- GitHub
- MCP
- browser
- sandbox

## End-to-end tests

```text
Sign in
  ↓
Chat
  ↓
Create task
  ↓
Plan
  ↓
Tool call
  ↓
Approval
  ↓
Execution
  ↓
Verification
  ↓
Artifact
  ↓
Report
```

## Security tests

- prompt injection
- cross-user access
- privilege escalation
- malicious files
- command injection
- SSRF
- secret exposure
- browser exfiltration
- sandbox boundary tests

## Agent evaluations

Replay representative objectives and score actual outcomes.

---

# 46. Performance Requirements

The interface should:

- begin streaming useful response content quickly
- avoid blocking the UI on long-running tasks
- update task state in near real time
- paginate histories and artifacts
- avoid excessive retrieval context

Long-running work belongs in asynchronous workers.

Target performance is workload-specific; benchmark before declaring thresholds.

---

# 47. Scalability Strategy

## v0.1

```text
Vercel
Managed PostgreSQL
Managed Redis
Object Storage
AI Gateway/provider APIs
```

## Growth

```text
               Load Balancer
                    │
      ┌─────────────┼──────────────┐
      ▼             ▼              ▼
   Web/API      Orchestrator    Tool Workers
                                  │
                           ┌──────┴──────┐
                           ▼             ▼
                       Browser       Sandbox
                       Workers       Workers

PostgreSQL
Redis
Queue
Object Storage
Observability
```

Web/API instances must remain stateless wherever possible.

---

# 48. Background Job Requirements

The task system must support:

- queued
- running
- paused
- waiting for approval
- waiting for external service
- retrying
- completed
- failed
- cancelled
- expired

Workers must be able to restart without losing task state.

---

# 49. Notifications

Notify the user when:

- approval is required
- task completes
- task fails permanently
- a task has been blocked for too long
- a high-cost operation is about to execute
- a scheduled task requires attention

Notification channels can later include:

- in-app
- email
- mobile push
- messaging integrations

---

# 50. Proactive Assistance

Proactive behavior belongs after core reliability exists.

JARVIS may later analyze:

- pending goals
- overdue tasks
- project state
- recurring patterns
- scheduled workflows

But proactive actions must follow the same permission and approval system as user-requested actions.

---

# 51. JARVIS v0.1 Definition

JARVIS v0.1 is complete when a user can:

1. Sign in.
2. Start a persistent conversation.
3. Use at least two frontier model providers through one JARVIS interface.
4. Automatically route selected requests.
5. Create a structured task from natural language.
6. View the task plan.
7. Call at least three real tools.
8. Store and retrieve basic memory with provenance.
9. Execute a safe code task in an isolated sandbox.
10. Verify the result independently.
11. Trigger and resolve a defined approval workflow.
12. Inspect an audit trail.
13. View task history.
14. View model/token/cost telemetry.
15. Receive a final task report.

---

# 52. v0.1 Tool Set

Recommended first three-plus tools:

1. Web research/search
2. File/document read
3. GitHub read/branch operations
4. Sandbox code execution
5. Optional browser automation

Avoid starting with payments, unrestricted email, production deployment, or destructive database tools.

---

# 53. v0.1 Build Order

## Phase 0 — Foundation

- repository
- pnpm monorepo
- Next.js App Router
- TypeScript strict mode
- lint/format/test setup
- environment configuration
- PostgreSQL
- Redis
- CI
- preview deployment

## Phase 1 — JARVIS Core

- authentication
- chat UI
- streaming
- AI SDK integration
- provider/gateway configuration
- conversation persistence
- basic telemetry

## Phase 2 — Memory + Tasks

- memory schema
- provenance
- pgvector
- retrieval
- goals
- projects
- tasks
- task dependencies
- planner

## Phase 3 — Tools + Durable Agent

- typed tool registry
- web tool
- file tool
- GitHub tool
- queue
- worker
- task state machine
- checkpoints
- retries
- event log

## Phase 4 — Engineering

- repository analysis
- code editing
- tests
- sandbox
- code review
- PR generation
- preview deployment

## Phase 5 — Security + Reliability

- capability policy
- approvals
- secret broker
- stronger sandboxing
- audit UI
- evaluation harness
- security test suite

## Phase 6 — Personal Intelligence

- long-term goals
- project memory
- preference memory
- proactive recommendations
- recurring workflows
- personalized learning workflows

## Phase 7 — Advanced JARVIS

- computer use
- browser agent
- multimodal interaction
- voice
- specialist agent teams
- autonomous research loops
- mobile client
- multi-day task supervision

---

# 54. Revised Timeline

These are engineering estimates, not guarantees.

| Stage                               | Strong solo developer |
| ----------------------------------- | --------------------: |
| Architecture + foundation           |             1–2 weeks |
| v0.1 core MVP                       |             4–8 weeks |
| Durable agent + tools               |            2–4 months |
| Engineering JARVIS                  |            3–6 months |
| Security/reliability maturity       |            4–8 months |
| Personal intelligence layer         |           6–12 months |
| Advanced JARVIS                     |          9–18+ months |
| Highly polished production platform |         18–36+ months |

Using AI coding assistance can shorten implementation time, but it does not remove the need for architecture, testing, review, debugging, security engineering, and operational maturity.

---

# 55. Definition of Done

A feature is not complete merely because code exists.

Every significant feature requires:

- implementation
- schema/contract definition
- authorization rules
- failure handling
- unit tests
- integration tests where applicable
- telemetry
- documentation
- acceptance criteria
- evaluation coverage if model behavior is involved

---

# 56. Non-Negotiable Safety Rules

1. No unrestricted model access to production systems.
2. No raw privileged secrets in model prompts.
3. No privileged tool execution without server-side authorization.
4. No destructive high-risk action without explicit approval.
5. No assumption that retrieved content is trustworthy.
6. No treating model self-report as verification.
7. No unlimited agent loops.
8. No production autonomy before evaluation demonstrates acceptable reliability.
9. No cross-user access through client-controlled identifiers.
10. No disabling audit logs for convenience.

---

# 57. Failure Handling

When JARVIS fails, it should explain the failure at the appropriate level:

```text
WHAT I TRIED
WHAT FAILED
WHAT EVIDENCE I HAVE
WHAT I DID NOT VERIFY
WHAT I CAN SAFELY TRY NEXT
```

The system must not convert failure into fabricated success.

---

# 58. UX Philosophy

JARVIS should feel:

- calm
- fast
- capable
- transparent
- professional
- non-gimmicky

The interface should emphasize:

- user objective
- current state
- concise progress
- important tool actions
- sources
- artifacts
- approval requests
- verification status

Do not create an interface that imitates fictional JARVIS so aggressively that usability suffers.

---

# 59. Future Intelligence Architecture

The long-term system may evolve toward:

```text
Human
  ↓
Intent
  ↓
JARVIS Executive Layer
  ↓
World Model / Context
  ↓
Planning
  ↓
Specialist Agents
  ↓
Tools + External Systems
  ↓
Execution
  ↓
Verification
  ↓
Memory
  ↓
Learning from Outcomes
```

The objective is not maximum agent count.

The objective is **maximum reliable task completion per unit of human attention**.

---

# 60. Final Architectural Recommendation

The audited design should be implemented with the following primary stack:

```text
Frontend
  Next.js + React + TypeScript

AI application
  Vercel AI SDK
  AI Gateway / provider abstraction

Models
  GPT-6 Astra
  Claude Opus 5.5
  additional lower-cost models as needed

Data
  PostgreSQL + pgvector
  Redis
  Object Storage

Agents
  deterministic task state machine
  tool-loop agent runtime
  durable background workers

Tools
  MCP
  GitHub
  Web
  Files
  Sandbox
  Browser

Security
  RBAC + capability-based authorization
  policy engine
  approval queue
  secret broker
  sandbox isolation

Observability
  OpenTelemetry
  Sentry
  structured logs
  cost telemetry

Testing
  unit + integration + E2E
  security testing
  agent evaluations
  regression benchmark suite
```

---

# 61. Final Audit Conclusion

**Architecture quality:** Strong after revision  
**Technical feasibility:** High for v0.1  
**Solo-developer feasibility:** High for staged implementation  
**Main difficulty:** Reliability, security, memory correctness, tool governance, and long-running execution—not model access itself  
**Primary architectural risk:** Giving capable models too much authority over tools or credentials  
**Primary product risk:** Building a sophisticated agent framework before proving that users receive reliably better outcomes

The correct strategy is therefore:

> **Build JARVIS as a controlled intelligence platform, not as an uncontrolled autonomous loop.**

Start small, instrument everything, evaluate relentlessly, and increase autonomy only when the system earns it through measured reliability.

---

# 62. Canonical Source of Truth

`SPEC.md` is the consolidated specification.

When earlier planning documents disagree with this document, the precedence order is:

```text
SPEC.md
  ↓
architecture.md
  ↓
requirements.md
  ↓
roadmap.md
  ↓
plan.md
```

Implementation decisions that materially change the architecture should update `SPEC.md`.

---

# 63. Immediate Next Action

The next engineering milestone is **JARVIS v0.1 Foundation**:

```text
1. Create the git repository
2. Initialize the pnpm monorepo
3. Bootstrap Next.js App Router
4. Configure TypeScript strict mode
5. Add database + migrations
6. Add authentication
7. Add AI SDK + gateway/provider abstraction
8. Implement the chat shell
9. Add model registry + routing policy
10. Add structured telemetry
```

Only after this foundation is stable should memory, tools, and durable agent execution be added.

---

## END OF SPECIFICATION
