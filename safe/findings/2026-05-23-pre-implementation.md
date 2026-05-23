# Finding: Pre-Implementation Baseline — No Authentication Layer Exists

**Date**: 2026-05-23
**Reporter**: red-team scaffold author (during `safe/` kit construction)
**Severity**: Critical (when deployed at T2/T3 tier — see scope)
**Status**: Open — being addressed by upcoming auth implementation work
**Related playbook**: all of `playbooks/*` — every seed case currently passes

## Summary

OpenAlice as of 2026-05-23 ships with **zero authentication at the Alice
process boundary**. Any HTTP request that reaches Alice's bound interface
is processed as if it came from the legitimate user. There is no:

- Admin token bootstrap
- Session middleware
- Cookie verification
- Origin / CORS protection on mutations
- Localhost-trust gate (because there's nothing yet to gate)
- Rate limiting on auth-shaped endpoints
- Public-mode safety net (i.e., binding 0.0.0.0 doesn't refuse to start)

This is a deliberate baseline. The implementation is queued; this finding
captures the state pre-implementation so we can verify after-impl that
each gap is closed.

## Reproduction

```bash
# Start the dev stack
pnpm dev    # Guardian → UTA → Alice → Vite

# In another terminal, no cookie, no token:
curl -s http://localhost:47331/api/trading/uta | jq

# Result: full UTA list returned, no 401, no challenge
```

Attempting any mutation likewise:

```bash
curl -i -X POST http://localhost:47331/api/trading/uta/mock-paper/wallet/stage-place-order \
  -H "content-type: application/json" \
  -d '{"aliceId":"mock-paper|FAKE","action":"BUY","orderType":"MKT","totalQuantity":"1"}'

# Result: 200, order staged. From any origin, with any cookies, with no token.
```

**Expected (secure)**: every authenticated route returns 401 to unauthenticated callers.
**Observed**: 200 everywhere.

## Why it matters

In its current state, **T2 (LAN-exposed) and T3 (public-exposed)
deployments are not safe**. Anyone who can route a TCP packet to Alice's
bound port has full administrative control:

- List all configured broker UTAs (including paper/live distinction)
- Read trading history, positions, equity curves
- Place real orders via `wallet/push` (broker side effect; real funds at
  risk on live UTAs)
- Modify broker configuration including API keys (via PUT `/api/trading/config/uta/:id`)
- Modify AI provider config (potential to redirect LLM calls / drain user
  API quota)
- Spawn new workspaces (file-system write + PTY)

T1 (pure localhost) is safe **only** because no external party can reach
the bound port. But port-scanning bots and same-host malware would compromise this trivially.

## Suggested remediation

The auth implementation queued for upcoming work should deliver:

1. **L1 Transport gate**: Refuse to start with non-localhost bind + no auth
   config (`OPENALICE_BIND_HOST=0.0.0.0` requires `data/config/auth.json`)
2. **L2 Authentication**:
   - First-run admin token generation (256-bit random, written to
     `data/config/auth.json` as argon2 hash + printed to stdout once)
   - `POST /api/auth/login` accepts token, sets `alice_session` cookie
   - `POST /api/auth/logout` invalidates session
   - Hono middleware enforces session on all routes except a small
     public allowlist
3. **Cookie hardening**: `HttpOnly; Secure (when HTTPS); SameSite=Lax;
   Max-Age=604800`
4. **CSRF**: Origin header check on POST/PUT/DELETE (allowlist-based)
5. **Localhost trust passthrough**: only true loopback IPs bypass; trusted-
   proxy header parsing with explicit env config
6. **Session storage**: `data/config/sessions.json` with `600` permissions
7. **Token rotation**: Settings UI + CLI command (`pnpm alice auth rotate`)
   to regenerate token + invalidate all sessions

## Verification (post-implementation)

Each playbook (`safe/playbooks/01-*` through `12-*`) has seed cases that
should be re-run after implementation. The expected result for every
"current behavior" line that says `200` should flip to `401` (or `403`
where appropriate).

Specifically, the canary smoke test is:

```bash
# Fresh, no cookie
curl -i http://localhost:47331/api/trading/uta

# Should return 401 (or 302 → /login)
# Anything else = remediation incomplete
```

## Code references

Routes currently unprotected:

- `src/webui/plugin.ts` — root Hono app mount point; no auth middleware
  attached before `app.route(...)` calls
- All files under `src/webui/routes/` and `services/uta/src/http/`

Files to create / modify:

- `src/webui/middleware/auth.ts` — session check middleware
- `src/services/auth/token-store.ts` — auth.json read/write + argon2
- `src/services/auth/session-store.ts` — sessions.json + cookie issuance
- `src/webui/routes/auth.ts` — `/api/auth/login` + `/api/auth/logout`
- `src/webui/plugin.ts` — wire it all up with correct mount order

## Notes

This finding is intentionally filed before the implementation starts so
that the auth implementation work can be **validated against it**. The
implementation is "done" when:

- All playbook seed cases that previously returned 200 now return 401 or 403
- The harness runner (`safe/harness/runner.ts`) reports `pass` for all
  cases under L1+L2 scope
- No new finding can be filed via the playbook process (modulo edge cases
  the red-team agent discovers via extension hints — those are separate
  findings, not this baseline)
