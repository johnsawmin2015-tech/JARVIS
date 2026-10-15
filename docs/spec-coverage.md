# SPEC.md implementation coverage

`SPEC.md` is the source of truth. The repository was empty except for that file, and the earlier
`architecture.md`, `requirements.md`, `roadmap.md`, and `plan.md` referenced by the spec were not
present. This implementation therefore follows the immediate v0.1 Foundation milestone in section
63, while adding reusable control-plane components from later phases.

## Implemented and integrated

- **Foundation (sections 7, 32, 53, 60, 63):** pnpm monorepo, strict TypeScript, Next.js App Router,
  lint/format/test/build configuration, environment template, PostgreSQL + pgvector, Redis
  development service, and migration tooling.
- **Identity and ownership (sections 4, 29, 30, 39):** owner-only sign-in, scrypt password
  verification, signed expiring HTTP-only cookies, same-origin mutation checks, login throttling,
  owner IDs on persistent resources, and owner-scoped queries.
- **Interactive plane (sections 9 and 31):** authenticated streaming command UI, persistent
  conversations/messages, cancellation, provider choice, safe error behavior, and all nine primary
  navigation views.
- **Provider abstraction (sections 6, 34, 38):** configurable model IDs, model registry contract,
  capability/data-policy/budget-aware router, Gateway/OpenAI/Anthropic adapters, automatic
  selection, cost estimation, and execution telemetry. No model capability is inferred from a
  marketing name.
- **Task runtime (sections 11, 12, 36, 41, 48):** complete task-state vocabulary, guarded
  transitions, persisted idempotency keys, configurable retry/backoff and safety limits,
  database-backed leases with `SKIP LOCKED`, checkpoints, cancellation signals, and worker recovery
  semantics. The runnable worker polls separately from HTTP requests and persists every tool attempt.
- **Verification (sections 10 and 35):** structural/functional/semantic/evidence/security check
  contracts, a separate verifier callback in the durable worker, evidence-required success, and
  persisted verification outcomes.
- **Context and memory (sections 13 and 14):** explicit instruction hierarchy, untrusted-content
  packaging, complete memory provenance schema, promotion rules, deletion redaction, scoped
  retrieval, confidence, importance, expiry, and lifecycle transitions.
- **Tool control plane (sections 15–18, 21, 42, 43):** typed input/output contracts, capability
  checks, risk policy, exact authorization order, result validation, normalized audit events, and
  MCP-compatible boundaries that do not delegate authorization.
- **Approvals and secrets (sections 19 and 20):** exact-action digests, owner binding, expiry,
  single-use consumption, R2/R3 policy, untrusted-source escalation, capability-scoped secret
  references, environment separation metadata, log redaction, owner approval/denial API, complete
  action disclosure UI, and automatic task resume after approval.
- **Real initial tools (sections 24, 25, 26, 52):** bounded HTTPS fetch with private-address and
  redirect denial, symlink-safe scoped file reads, and credential-brokered GitHub file reads.
- **Sandbox (section 23):** allowlisted images, no network, read-only filesystem, dropped Linux
  capabilities, no-new-privileges, CPU/memory/PID quotas, timeout, bounded logs, and `--rm`
  teardown.
- **Persistence and observability (sections 27, 28, 37):** relational entities for the specified
  v0.1 domain, constraints and indexes, append-oriented events, request/trace IDs, task/model/tool
  metadata, tokens, latency, estimated cost, status, retries, errors, and verification.
- **Evaluation and tests (sections 40, 44, 45, 55–57):** permanent evaluation result contracts,
  aggregate quality/cost/safety metrics, task-state tests, routing tests, memory tests, exact
  approval tests, tool-gateway tests, prompt-injection escalation tests, SSRF tests, path traversal
  tests, and secret isolation tests.

## v0.1 completion audit

All 15 section 51 capabilities now have an integrated implementation path:

1. **Sign in:** owner credentials, scrypt verification, signed expiring session, same-origin writes.
2. **Persistent conversation:** PostgreSQL conversations/messages and streamed assistant responses.
3. **Two frontier providers:** OpenAI and Anthropic adapters, plus optional AI Gateway.
4. **Automatic routing:** deterministic provider selection with verified model metadata and pricing.
5. **Natural-language task creation:** objectives are parsed into schema-valid plans for public web,
   scoped files, GitHub blob URLs, isolated JavaScript, or report-only work.
6. **Visible plan:** task creation previews the plan and task detail pages retain every step,
   acceptance criterion, action, risk, capability, and status.
7. **Three real tools:** web fetch, scoped file read, GitHub file read, and sandbox execution are
   registered in the durable runtime.
8. **Memory with provenance:** authenticated create/search/delete APIs and UI expose source, scope,
   confidence, importance, sensitivity, verification, lifecycle state, and owner boundary. Verified
   task reports are also stored as execution memory.
9. **Isolated safe code task:** `sandbox:` objectives create an exact R2 approval before running in a
   network-disabled, read-only, quota-limited ephemeral Docker container.
10. **Independent verification:** a separate verifier evaluates structural, functional, semantic,
    evidence, and security checks; non-zero/timeout sandbox runs fail verification.
11. **Approval workflow:** pending actions show exact inputs/effects/capabilities/credentials/
    rollback/expiry; approve and deny are owner-scoped, audited, expiring, and single-use.
12. **Audit trail:** planning, tasks, tools, approvals, sandboxes, verification, artifacts, and
    memory transitions emit append-oriented events with request and trace IDs.
13. **Task history:** task list/detail pages expose status, plan, tool activity, failures,
    verification, cancellation, and reports.
14. **Usage telemetry:** provider/model token, latency, and cost records are persisted and displayed;
    task loops enforce configurable steps/retries/duration/tool calls/workers/spend.
15. **Final report:** verified tasks persist an idempotent Markdown report, evidence, artifact digest,
    and execution memory. Failed work retains explicit failure evidence instead of reporting success.

## Integrated but environment-gated

- The durable worker is runnable with `pnpm worker`; production process supervision and dedicated
  worker deployment manifests remain deployment concerns.
- Docker sandbox execution requires an installed Docker daemon and the allowlisted image.
- GitHub reads require a scoped `GITHUB_TOKEN`. Branch creation is intentionally not exposed until
  credential-scoped live integration tests can prove repository and branch boundary enforcement.
- Live provider streaming requires configured IDs, verified metadata date, pricing, and API keys.
- The chat plane remains conversational; governed tool loops run through durable tasks so they do
  not depend on an HTTP request lifetime.
- Planning is intentionally deterministic and bounded for v0.1. Model-generated arbitrary task
  graphs remain disabled until evaluation data demonstrates they improve reliability.

## Explicit local demo mode

`DEMO_MODE=true` enables a separate process-local adapter for evaluating the web experience without
PostgreSQL, Redis, Docker, provider credentials, or a worker. It is a development convenience, not
a production persistence fallback:

- the gate only accepts the exact value `true` and throws if `NODE_ENV=production`
- owner authentication still requires the configured email and local demo password; normal mode
  continues to require the scrypt password hash
- the demo owner uses a stable valid UUID while all owner boundaries remain enforced
- conversations, tasks, plans, approvals, memories, activity, projects, artifacts, and usage use
  an in-memory owner-scoped store
- safe seeded records make every dashboard view inspectable
- approved demo actions are simulated and explicitly state that no worker, sandbox, model, tool,
  database, or external system ran
- when no provider is configured, chat emits a deterministic text stream labeled `DEMO OUTPUT`
- a persistent banner and Settings status warn that data resets when the server restarts

Normal mode does not fall back to the demo adapter when infrastructure is unavailable. Production
with `DEMO_MODE=true` fails closed.

## Deferred by the staged specification

These are later build-order phases rather than foundation defects:

- document upload, malware scanning, extraction, chunking, embeddings, and object storage
- GitHub branch/commit/pull-request workflows and preview deployment
- browser and visual computer-use workers
- MCP server adapters and per-server trust manifests
- email, calendar, notifications, scheduled tasks, and proactive assistance
- production OpenTelemetry/Sentry exporters and deployment-specific alerting
- gVisor/Firecracker isolation, sandbox cluster scheduling, and network egress proxies
- voice, multimodal, mobile, collaborators, and enterprise administration

## Environment-gated verification

Database migration, authenticated browser smoke tests, live provider streaming, GitHub API calls,
and Docker sandbox execution require PostgreSQL/Redis/Docker and credentials. They cannot be
meaningfully declared successful without those services. The repository includes replayable
migrations, worker entrypoint, owner APIs, and deterministic workflow tests; unit, security,
static-analysis, production-build, and database-free demo checks remain credential-free.
