# Exchange Rate Tracker — Real-Time Data Aggregation Service

## Initial Thought Process

The core problem is trust, not data availability. Free users see stale or broken rates, lose confidence, and leave before ever considering paid. The goal isn't real-time data — it's **consistently reliable-looking data** even when sources are imperfect.

The product insight: a 5-minute-old rate that's always available builds more trust than a "real-time" rate that shows "Unable to fetch" 30% of the time. So the design prioritizes **availability over freshness** — cascade fallbacks, always-show-something UI, and shared caching that keeps API costs low.

The $5/day budget for premium calls is a strategic lever for later: once the basic trust problem is solved with free cached data, high-intent free users (returning visitors, users checking rates daily) can be promoted to real-time premium data to nudge conversions.

## How to Run

### Prerequisites

- Node.js 18+
- npm or pnpm

### Backend

```bash
cd backend
npm install
npm start
```

The server starts on `http://localhost:3001` with endpoints:
- `GET /rates?base=USD` — Returns exchange rates for the given base currency
- `GET /health` — Health check with cache status

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The UI starts on `http://localhost:5173`. The Vite dev server proxies API calls to the backend automatically.

## Architecture

- **Backend**: Express.js, in-memory cache, dual-source cascade (ExchangeRateAPI → ExchangeAPI), 5-minute background refresh
- **Frontend**: React (Vite), single-page UI with auto-refresh every 60 seconds, color-coded freshness indicator
- **No database**, no authentication — designed to ship in 60 minutes
