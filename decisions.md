# Decisions — Real-Time Data Aggregation Service

## Which APIs did you choose and why?

**Primary:** `api.exchangerate-api.com/v4/latest/USD` — Free, no API key required for basic access, returns all major currency pairs. Free tier supports 1,500 calls/day which is sufficient for a 5-minute background refresh cycle (i.e 288/day).

**Fallback:** `api.exchangeapi.io/api/latest` — also free and keyless, gives us a second source if the primary is down.

Both were choosen because they are real public APIs (not mock endpoints), require zero authentication overhead, and return a consistent JSON shape — making the cascade logic simple.

## Fallback strategy when an API fails

**Three-tier cascade:**
1. Fetch from primary source (5s timeout)
2. If primary fails, fetch from fallback source (5s timeout)
3. If both fail, serve the last-cached data and mark it as `cached: true`

A background job refreshes the cache every 5 minutes, so even during an outage the cached data is unlikely to be more than ~10 minutes stale.

## How conflicting data from different sources is handled

The primary source is the source of truth — I am not compareing live from both simultaneously.

## What the user sees when things fail or data is stale

The UI uses a color-coded freshness indicator:

| State | Dot Color | Label | User sees |
|-------|-----------|-------|-----------|
| < 2 min | Green | Live | Current rates |
| 2–10 min | Yellow | Stale | Rates + "Updated 3m ago" |
| > 10 min | Orange | Very stale | Rates + "Data may be outdated" |
| All sources down | Red | Unavailable | Last cached rates still visible + error message |

**Key product decision: never show a blank screen.** Even very-stale or cached rates build more trust than "Unable to fetch."

## Improving data staleness within budget

All free users share a single cached snapshot refreshed every 5 minutes. This means only ~288 API calls/day hit the external API regardless of how many users are active. At ~$0.001/call on a premium equivalent, this is ~$0.29/day — well under the $5/day budget. The remaining $4.71/day budget is available for high-intent features (future: premium trial for engaged free users).

## What was cut to ship in 60 minutes

- **No authentication or user tracking** — can't implement the "$5 budget for high-intent users" idea without per-user state
- **No database** — in-memory cache only; restarts clear the cache
- **No historical data** — no charts, no time series
- **No WebSocket/SSE push** — polling-based refresh
- **No rate limiting middleware** — trust that 5-min refresh keeps API calls reasonable
- **Minimal React** — single component, no state management, no router, no build-time optimization
- **No error logging service** — console.warn only

## What would be added with more time

1. **Redis cache** — survive restarts, enable multi-instance deployments
2. **User-level tracking** — apply the $5 budget strategically (e.g., real-time rates for users who've visited >3 sessions)
3. **Historical charts** — sparkline or trend for each pair over 24h/7d
4. **Configurable currency pairs** — let users pick their base and targets
5. **Health dashboard** — track source uptime and latency per endpoint
6. **Graceful startup** — warm cache from disk on cold start so first user isn't waiting
7. **Alerting** — Slack/PagerDuty notification when all sources are degraded >15 minutes
