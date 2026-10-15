# JARVIS

JARVIS is a controlled personal intelligence platform. Models propose and reason; deterministic
software authenticates, authorizes, validates, executes, records, and verifies.

This repository implements the foundation milestone from `SPEC.md` and the reusable control-plane
primitives needed by later durable agents.

## Included

- Next.js App Router interface with Command, Tasks, Projects, Memory, Approvals, Activity,
  Artifacts, Usage, and Settings views
- owner authentication with scrypt password verification and signed, HTTP-only sessions
- provider-neutral streaming chat using AI Gateway, OpenAI, or Anthropic
- deterministic automatic provider selection with explicit configuration
- PostgreSQL + pgvector foundation schema with owner boundaries
- durable task state machine, safety limits, leases, checkpoints, independent verifier hook, and
  append-oriented events
- model registry, routing, spend estimation, and usage telemetry
- memory provenance and lifecycle rules
- capability policy, risk classes, exact-action approvals, secret references, and redaction
- typed tool gateway and real scoped web, file, and GitHub read tools
- Docker sandbox runner with no network, read-only root, dropped capabilities, CPU/memory/process
  limits, timeout, bounded logs, and automatic teardown
- evaluation metric aggregation and security-focused tests

## Database-free local demo

The current checkout includes an ignored `.env.local` configured with `DEMO_MODE=true` and the local
demo account. After dependencies are installed, start the entire demo from the repository root:

```bash
npm run dev
```

Open `http://localhost:3000` and sign in with the owner credentials configured in `.env.local`.
The root command explicitly loads that file before starting Next.js in `apps/web`.

Demo mode is deliberately limited:

- `DEMO_MODE=true` is required and is rejected when `NODE_ENV=production`.
- authentication still verifies the configured email and explicit local demo password; normal mode
  continues to require the scrypt password hash.
- state is process-local and resets whenever the development server restarts.
- PostgreSQL, Redis, workers, Docker, model providers, GitHub, and external tools are not contacted.
- chat output and simulated task reports are visibly labeled as demo output.

For a new checkout, copy `.env.example` to `.env.local`, set `DEMO_MODE=true`, and configure the
owner secret fields. `.env.local` remains ignored.

## Persistent local setup

Requirements: Node.js 24+, Corepack, Docker, PostgreSQL/Redis, and provider credentials.

```bash
cp .env.example .env.local
corepack pnpm install
docker compose up -d
corepack pnpm db:migrate
npm run dev
# In a second terminal:
corepack pnpm worker
```

Generate owner password fields:

```bash
node -e "const c=require('node:crypto'); const s=c.randomBytes(16).toString('hex'); console.log('OWNER_PASSWORD_SALT='+s); console.log('OWNER_PASSWORD_HASH='+c.scryptSync(process.argv[1],s,64).toString('hex'))" 'replace-me'
```

Set at least one provider key and model ID. Model IDs are intentionally not hard-coded: verify them
against current provider documentation and set `MODEL_DOCS_VERIFIED_AT`. Configure per-provider
input/output prices so telemetry can estimate spend.

## Verification

```bash
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm peers check
```

Natural-language durable task patterns:

- include a public `https://` URL to retrieve it through the SSRF-restricted web tool
- ask to read a workspace file such as `SPEC.md`
- include a GitHub `/blob/` URL for credential-brokered repository reads
- use `sandbox: <JavaScript>` to request exact approval, isolated execution, independent
  verification, execution memory, and a final report

See `docs/spec-coverage.md` for requirement-level coverage and environment-gated verification.
