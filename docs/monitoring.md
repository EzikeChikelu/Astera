# Astera Monitoring Guide

This document describes the health check endpoint, alert rules, and webhook
integration for running Astera in production.

---

## Health Check Endpoint

**`GET /api/health`**

Returns a JSON object describing the current health of all critical dependencies.

### Response schema

```json
{
  "status": "ok" | "degraded" | "down",
  "checks": {
    "stellar_rpc": {
      "name": "stellar_rpc",
      "status": "ok" | "degraded" | "down",
      "detail": "142ms"
    }
  },
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

| Field | Description |
|---|---|
| `status` | Worst status across all individual checks |
| `checks` | Per-dependency result map |
| `timestamp` | ISO-8601 time the check ran |

### HTTP status codes

| Response status | HTTP code |
|---|---|
| `ok` | 200 |
| `degraded` | 200 |
| `down` | 503 |

### Checks performed

| Check | Passes when |
|---|---|
| `stellar_rpc` | RPC responds within 5 seconds with HTTP 200 |

---

## Alert Rules

Alert rules are defined in `frontend/lib/alert-rules.ts`.

| Rule ID | Alert type | Priority | Trigger condition |
|---|---|---|---|
| `rule-large-tx` | `LARGE_TRANSACTION` | HIGH | Single transaction > 5,000 USDC |
| `rule-unusual-activity` | `UNUSUAL_ACTIVITY` | MEDIUM | ≥ 3 events from one address within 10 minutes |
| `rule-contract-default` | `CONTRACT_DEFAULT` | CRITICAL | Invoice marked `defaulted` |
| `rule-invoice-funded` | `INVOICE_FUNDED` | MEDIUM | Invoice transitions to `funded` |
| `rule-invoice-paid` | `INVOICE_PAID` | MEDIUM | Invoice fully repaid |
| `rule-invoice-defaulted` | `INVOICE_DEFAULTED` | CRITICAL | Invoice defaulted via SME/investor flow |
| `rule-low-liquidity` | `LOW_LIQUIDITY` | HIGH | Available pool liquidity < 10% of total deposits |
| `rule-high-default-rate` | `HIGH_DEFAULT_RATE` | CRITICAL | Default rate > 5% in rolling 7-day window |
| `rule-contract-paused` | `CONTRACT_PAUSED` | CRITICAL | Any core contract is paused |
| `rule-rpc-slow` | `RPC_SLOW` | HIGH | Stellar RPC response time > 5 seconds |

---

## Webhook Integration

When `ALERT_WEBHOOK_URL` is set (see `frontend/.env.example`), the `/api/health`
endpoint POSTs the following payload whenever the overall status is `degraded` or
`down`:

```json
{
  "alert": "health_degraded",
  "severity": "warning" | "critical",
  "data": { ...full HealthResponse... },
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

`severity` is `"critical"` when `status === "down"`, otherwise `"warning"`.

### Slack

Set `ALERT_WEBHOOK_URL` to your Slack incoming webhook URL. The raw JSON payload
will appear in the configured channel.

### Discord

Set `ALERT_WEBHOOK_URL` to your Discord webhook URL (append `?wait=true` if you
want delivery confirmation).

### PagerDuty

Use your PagerDuty Events API v2 integration URL. Map `severity` to
`payload.severity` in a PagerDuty routing rule, or use a middleware adapter.

### Generic endpoint

Any HTTPS endpoint that accepts `POST` with `Content-Type: application/json` is
compatible.

---

## Uptime Monitoring

Configure an external uptime monitor to ping `GET /api/health` at your chosen
interval (60 seconds recommended).

| Service | Free tier | Notes |
|---|---|---|
| UptimeRobot | 50 monitors, 5-min interval | Alerts on non-2xx or keyword mismatch |
| Better Uptime | 10 monitors | Supports JSON keyword checks |
| Freshping | 50 monitors, 1-min interval | — |

Set the monitor to alert on HTTP 503, which the health endpoint returns when
`status === "down"`.
