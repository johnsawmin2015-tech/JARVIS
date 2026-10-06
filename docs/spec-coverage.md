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
  semantics.
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
  references, environment separation metadata, and log redaction.
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

## Implemented as a contract, not yet wired to the web workflow

- The durable worker and sandbox are separate execution-plane services, but deployment manifests
  for dedicated worker infrastructure are not included.
- Memory lifecycle and retrieval are implemented and represented in the database/UI, but automatic
  candidate extraction and an owner editing API are deferred.
- Approval enforcement is implemented in the tool gateway and represented in the database/UI, but
  the web UI does not yet create or resolve approval records because no modifying v0.1 tool is
  exposed.
- The three read tools are production implementations, but the chat route intentionally has no
  autonomous tool loop until tool-result persistence, per-task budgets, and provider integration
  tests run against deployed infrastructure.
- Planner output, acceptance-criteria contracts, and tasks exist, but model-generated task graphs
  are deferred until provider evaluation data is available.

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
meaningfully declared successful without those services. Unit, security, static-analysis, and
production-build checks remain credential-free.
