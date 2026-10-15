# JARVIS

JARVIS is a controlled personal intelligence platform. Frontier models propose and reason. Deterministic software authenticates the owner, authorizes each action, executes approved work, records the result, and verifies completion.

Version 0.1.0 delivers the foundation control plane: an authenticated operator interface, durable tasks, scoped tools, isolated execution, and an audit trail. The human owner remains the authority for consequential actions.

## Platform scope

| Plane        | Responsibility                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Interactive  | Authenticated command interface, streaming conversations, and operator views                     |
| Durable task | Planning, leases, checkpoints, retries, cancellation, and recovery outside the web request       |
| Execution    | Isolated tool and sandbox workers with bounded resources                                         |
| Control      | Schema validation, capability policy, risk classification, exact approvals, and secret brokering |

A model proposal cannot grant itself permission. Every consequential action passes through validation, policy, approval, credential injection, execution, result checks, and an append-only audit event.

## Capabilities

- Operator interface for Command, Tasks, Projects, Memory, Approvals, Activity, Artifacts, Usage, and Settings
- Owner authentication with scrypt password verification and signed, expiring, HTTP-only sessions
- Provider-neutral streaming chat through AI Gateway, OpenAI, or Anthropic, with deterministic routing from explicit configuration
- PostgreSQL and pgvector persistence with owner boundaries on stored resources
- Durable task state machine with safety limits, leases, checkpoints, an independent verifier, and append-oriented events
- Model registry, spend estimation, and usage telemetry
- Memory records with provenance, scope, confidence, and lifecycle state
- Capability policy, risk classes, exact-action approvals, secret references, and log redaction
- Typed tool gateway with scoped web retrieval, workspace file reads, and credential-brokered GitHub reads
- Docker sandbox with no network, a read-only root, dropped capabilities, CPU, memory, and process limits, a timeout, bounded logs, and automatic teardown
- Evaluation metrics and security-focused tests

## Security posture

Authorization is enforced in software, separate from model output.

- Sessions are owner-scoped. Mutations require a verified session and a same-origin request.
- Tools receive capability-scoped secret references. Prompts, tool inputs, and audit records do not receive raw credentials.
- Retrieved and repository content is treated as untrusted. Modifying actions influenced by that content require approval.
- Web retrieval denies private-network targets and unsafe redirects.
- File reads stay inside the configured workspace root.
- Destructive and code-execution actions require an exact, expiring, single-use, owner-bound approval.
- Sandbox containers run without network access and are removed after execution.

The control mapping is recorded in [`docs/security/threat-model.md`](docs/security/threat-model.md). Implementation coverage is recorded in [`docs/spec-coverage.md`](docs/spec-coverage.md). The full system specification is maintained privately and is not part of this repository.

## Repository layout

```text
apps/web                 Next.js operator interface
services/worker          Durable task worker
services/sandbox         Container execution runner
packages/agents          Task planning and runtime contracts
packages/ai              Provider adapters, registry, and routing
packages/context         Instruction hierarchy and untrusted-content handling
packages/database        Schema, migrations, and repositories
packages/evaluation      Quality, cost, and safety metrics
packages/memory          Memory provenance and lifecycle
packages/security        Policy, approvals, and secret brokering
packages/tools           Typed tool gateway and built-in tools
packages/shared          Cross-package contracts
docs/security            Threat model and control mapping
scripts                  Development server and database migration
tests                    Control-plane and security tests
```

## Requirements

- Node.js 24 or newer
- Corepack, which supplies the pinned pnpm version
- Docker, for PostgreSQL, Redis, and the sandbox runner
- One configured model provider for live chat and durable model calls

## Local demonstration

Demo mode runs the interface without PostgreSQL, Redis, workers, Docker, model providers, or external tools. It is rejected when `NODE_ENV=production`. State is process-local and resets when the development server stops. Chat and task output are labeled as demonstration output.

```bash
cp .env.example .env.local
```

Set `DEMO_MODE=true` and the local owner email and demo password in `.env.local`. That file is ignored by git.

```bash
npm run dev
```

Open `http://localhost:3000` and sign in with the owner credentials from `.env.local`.

## Persistent local environment

```bash
cp .env.example .env.local
corepack pnpm install
docker compose up -d
corepack pnpm db:migrate
npm run dev
```

Start the worker in a second terminal:

```bash
corepack pnpm worker
```

Generate the owner password salt and hash:

```bash
node -e "const c=require('node:crypto'); const s=c.randomBytes(16).toString('hex'); console.log('OWNER_PASSWORD_SALT='+s); console.log('OWNER_PASSWORD_HASH='+c.scryptSync(process.argv[1],s,64).toString('hex'))" 'replace-me'
```

Configure at least one provider key and model ID. Model identifiers are supplied by configuration after they are checked against current provider documentation. Set `MODEL_DOCS_VERIFIED_AT` when that check is complete. Set per-provider input and output prices so telemetry can estimate spend.

### Configuration groups

| Group                                                                      | Purpose                                              |
| -------------------------------------------------------------------------- | ---------------------------------------------------- |
| `DEMO_MODE`, `DEMO_PASSWORD`                                               | Explicit local demonstration switch and password     |
| `DATABASE_URL`, `REDIS_URL`                                                | Persistent state and worker coordination             |
| `AUTH_SECRET`, `OWNER_EMAIL`, `OWNER_PASSWORD_SALT`, `OWNER_PASSWORD_HASH` | Owner session and password verification              |
| Provider keys, model IDs, and prices                                       | Routing, execution, and spend estimation             |
| `DAILY_BUDGET_USD`, `MONTHLY_BUDGET_USD`, `TASK_BUDGET_USD`                | Preflight budget limits                              |
| `JARVIS_WORKSPACE_ROOT`, `JARVIS_SANDBOX_IMAGE`                            | File-read root and allowlisted sandbox image         |
| `GITHUB_TOKEN`                                                             | Server-side credential for repository reads          |
| Object storage and telemetry                                               | Optional artifact storage, OpenTelemetry, and Sentry |

The complete template is `.env.example`. Keep real values in `.env.local` or the deployment secret store.

## Operator workflows

Durable tasks accept natural-language objectives. The runtime turns them into a visible plan and executes only the tools that policy allows.

- Include a public `https://` URL to retrieve a page through the SSRF-restricted web tool.
- Ask to read a workspace file such as `README.md`.
- Include a GitHub `/blob/` URL for a credential-brokered repository read.
- Prefix JavaScript with `sandbox:` to require exact approval, isolated execution, independent verification, execution memory, and a final report.

## Verification

```bash
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm peers check
```

## Release status

0.1.0 is the foundation milestone. It provides the control plane, three real read tools, isolated code execution, approvals, memory, and telemetry. Browser automation, broader computer use, and stronger production isolation remain outside this release.
