# Threat model and controls

The following maps every threat in `SPEC.md` section 40 to an implemented control and a test or
verification path.

1. **Prompt injection:** retrieved content is explicitly demoted and modifying actions influenced
   by it require approval. Covered by context and policy tests.
2. **Tool abuse:** the server-side gateway validates schemas, capabilities, risk, approval, and
   output before returning a result. Covered by allow/deny/approval gateway tests.
3. **Credential exfiltration:** tools receive capability-scoped references from a broker; prompts,
   tool inputs, and audit records do not receive raw secrets. Covered by broker and redaction tests.
4. **Cross-user leakage:** all persistent resources carry an owner ID and repositories derive the
   owner from a verified session. Exact-action approvals compare owner identity.
5. **Malicious files:** current file access is read-only, root-confined, symlink-resolved, bounded,
   and UTF-8 only. Path traversal is tested. Upload/scanning remains deferred.
6. **Malicious repository content:** repository and GitHub text enters the untrusted-content
   envelope and cannot grant authority.
7. **Browser exfiltration:** no browser worker is enabled. Future sessions must use the same gateway
   and egress policy before this capability can be exposed.
8. **Supply-chain attacks:** dependencies are pinned in the lockfile, pnpm supply-chain policy
   verification is enabled, and only named native builds are allowed.
9. **Sandbox escape:** the Docker runner uses an allowlisted image, no network, a read-only root,
   dropped capabilities, no-new-privileges, quotas, timeout, and teardown. Stronger isolation is a
   later production requirement.
10. **Excessive permissions:** capabilities are explicit and checked before credentials or
    execution. Missing-capability denial is tested.
11. **Unbounded loops:** step, retry, duration, spend, tool-call, worker, timeout, and cancellation
    limits are schema-bound and enforced. Limits and backoff are tested.
12. **Destructive actions:** R3 always requires exact, expiring, owner-bound approval; consumed
    approvals cannot authorize a different action. Digest mismatch is tested.
13. **Provider outage:** registry status and fallback metadata exist; durable retries and safe
    failure events prevent false completion. Live failover requires provider integration tests.
14. **Model regression:** evaluation cases/results and aggregate quality metrics are permanent
    schema components. Golden provider tasks remain deployment data.
15. **Cost runaway:** routing checks remaining budget and execution limits include maximum spend;
    token/cost telemetry is persisted. Daily/monthly preflight enforcement must be connected before
    autonomous tool loops are enabled.

## Security invariants

- Client-provided owner IDs are never accepted.
- A tool never authorizes itself.
- A model cannot inject credentials or bypass policy.
- R3 execution cannot proceed without exact approval.
- Untrusted content remains data.
- Verification requires external evidence, not model self-report.
- Failures emit failure state and never become fabricated success.
