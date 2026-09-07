# Acme API Reference

The Acme API is a JSON-over-HTTPS API for managing workspaces, projects, and events programmatically. This reference covers authentication, limits, webhooks, and versioning. Commercial terms for the limits described here — prices, seats, and overage billing — are defined in the Billing Policy.

## Base URL and versioning

All requests go to:

```
https://api.acme.dev/v2
```

The current version is **v2**. **API v1 is sunset on 2026-03-31**: after that date v1 endpoints return `410 Gone`. Migrate integrations to v2 before the sunset; the changelog lists every breaking difference. New versions are announced at least 12 months before any sunset.

## Authentication

Authenticate with a bearer token:

```
Authorization: Bearer <token>
```

Access tokens are issued by `POST /oauth/token` and **expire after 24 hours**. Use the refresh token grant to obtain a new access token without re-prompting the user. Tokens are scoped per workspace; a token never grants access across workspaces.

Requests from server integrations are additionally signed with the workspace's API signing key. Signing keys are managed by your workspace admin and rotated on the schedule set by the Security Runbook; a request signed with a retired key returns `401 invalid_signature`.

Treat any token or signing key that appears in logs, tickets, or chat as leaked and rotate it immediately.

## Rate limits

Rate limits are enforced per workspace, measured over a sliding 60-second window:

| Plan | Rate limit |
|---|---|
| Starter | **100 requests/minute** |
| Growth | **600 requests/minute** |
| Enterprise | **2,000 requests/minute** |

Exceeding the limit returns `429 Too Many Requests` with a `Retry-After` header. Rate-limited requests do not count against your monthly quota. Use exponential backoff with jitter; the SDKs do this automatically.

## Monthly call quotas

Each plan includes a monthly API call quota:

| Plan | Included calls/month |
|---|---|
| Starter | **50,000** |
| Growth | **500,000** |
| Enterprise | **Unlimited** |

Calls beyond the included quota are not blocked — they are billed as overage at the rate set in the Billing Policy, and the billing contact is alerted at 80% and 100% of quota. The `X-Acme-Quota-Remaining` response header reports the remaining included calls for the current period.

## Webhooks

Subscribe to events with `POST /v2/webhooks`. Deliveries are HTTP POSTs to your endpoint with these guarantees:

- Each delivery is signed with an **`X-Acme-Signature`** header (HMAC-SHA256 over the raw body with your signing key). Verify it before trusting the payload.
- Failed deliveries (non-2xx or >10s timeout) are retried **5 times with exponential backoff** (roughly 1m, 5m, 30m, 2h, 12h).
- After the fifth failed retry the delivery is dead-lettered and visible in the dashboard for 14 days; endpoints failing continuously for 7 days are disabled automatically.

Webhook payloads contain event ids, not full objects — fetch the object by id to get current state, which makes deliveries safe to replay.

## Errors

Errors use conventional status codes with a JSON body: `{ "error": { "code", "message", "request_id" } }`. Include the `request_id` when contacting support. `5xx` responses are safe to retry idempotently; mutating endpoints accept an `Idempotency-Key` header.

## Pagination

List endpoints are cursor-paginated. Pass `limit` (default 25, maximum 100) and the `cursor` value returned in the previous response's `next_cursor` field. Cursors are opaque and expire after one hour; never construct them by hand. Results are ordered newest-first unless the endpoint documents otherwise, and a missing `next_cursor` means you have reached the end of the collection. Offset-based pagination from v1 is not available in v2.

## SDKs

Official SDKs exist for TypeScript, Python, and Go, all covering v2 fully. The SDKs handle authentication token refresh, rate-limit backoff, pagination cursors, and webhook signature verification for you, and each releases in lockstep with the API changelog. Community SDKs are listed in the developer hub but are not supported by Acme.

## Status and support

Live API status is published at status.acme.dev, including per-region latency and any active incidents. API questions go to the developer forum; paying customers can open a support ticket and should always include the `request_id` from the error body so support can trace the exact request.
