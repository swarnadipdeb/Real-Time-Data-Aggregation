const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: ['http://localhost:5173', 'https://real-time-data-aggregation-3xkk.vercel.app'] }));

// --- In-memory cache (always stores USD-based raw data) ---
let cache = {
  rates: null,
  timestamp: null,
  source: null,
  lastAttempt: Date.now()
};

// --- API sources (free, no auth required) ---
const SOURCES = [
  {
    name: 'ExchangeRateAPI',
    url: 'https://api.exchangerate-api.com/v4/latest/USD',
    parse: (data) => data
  },
  {
    name: 'ExchangeAPI',
    url: 'https://api.exchangeapi.io/api/latest?base=USD',
    parse: (data) => data
  }
];

const TARGET_CURRENCIES = ['EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR'];

// --- Fetch rates from a single source (always returns USD-based) ---
async function fetchFromSource(source) {
  const response = await axios.get(source.url, { timeout: 5000 });
  const parsed = source.parse(response.data);

  return {
    rates: parsed.rates,
    base: parsed.base || 'USD',
    timestamp: parsed.time?.latest || Date.now(),
    source: source.name
  };
}

// --- Fetch rates with cascade fallback ---
async function fetchRates() {
  for (const source of SOURCES) {
    try {
      const result = await fetchFromSource(source);
      return { rates: result, success: true };
    } catch (err) {
      console.warn(`[${source.name}] failed: ${err.message}`);
      continue;
    }
  }

  // All sources failed — serve cached data if available
  if (cache.rates) {
    console.warn('All sources down, serving cached data');
    return {
      rates: {
        rates: cache.rates,
        base: 'USD',
        timestamp: cache.timestamp,
        source: cache.source + ' (cached)'
      },
      success: false,
      cached: true
    };
  }

  return { rates: null, success: false };
}

// Cross-convert a rate from USD-based to the requested base currency.
// API gives us: 1 USD = X units of currency.
// For base EUR: 1 EUR = (rate / usdRate['EUR']) units of currency.
function convertRate(rawRates, code, baseCurrency) {
  if (baseCurrency === 'USD') return rawRates[code];
  const baseUsdRate = rawRates[baseCurrency];
  if (!baseUsdRate) return null;
  return rawRates[code] / baseUsdRate;
}

// --- GET /rates?base=USD&currencies=EUR,GBP ---
app.get('/rates', async (req, res) => {
  const { base, currencies } = req.query;
  const baseCurrency = (base || 'USD').toUpperCase();

  try {
    const result = await fetchRates();

    if (!result.success && !result.rates) {
      return res.status(503).json({
        error: 'All sources are currently unavailable',
        timestamp: Date.now()
      });
    }

    const data = result.rates;
    const ageSeconds = Math.floor((Date.now() - (data.timestamp || cache.lastAttempt)) / 1000);

    // Build the rate set cross-converted to the requested base
    const targets = currencies
      ? currencies.split(',').map(c => c.toUpperCase())
      : TARGET_CURRENCIES;

    const converted = {};
    converted[baseCurrency] = 1;
    targets.forEach(c => {
      if (c === baseCurrency) return;
      const rate = convertRate(data.rates, c, baseCurrency);
      if (rate != null) converted[c] = rate;
    });

    res.json({
      base: baseCurrency,
      rates: converted,
      timestamp: data.timestamp || cache.lastAttempt,
      source: data.source || cache.source,
      age_seconds: ageSeconds,
      cached: result.cached || false,
      freshness: ageSeconds < 120 ? 'fresh' : ageSeconds < 600 ? 'stale' : 'very-stale'
    });

    // Update cache after successful fetch (store raw USD-based data)
    if (!result.cached) {
      cache = {
        rates: data.rates,
        timestamp: Date.now(),
        source: data.source || cache.source,
        lastAttempt: Date.now()
      };
    }
  } catch (err) {
    console.error('Fetch error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- GET /health ---
app.get('/health', (req, res) => {
  const age = cache.rates ? Math.floor((Date.now() - cache.timestamp) / 1000) : null;
  res.json({
    status: cache.rates ? 'ok' : 'no-data',
    cache_age_seconds: age,
    last_source: cache.source
  });
});

// --- Background refresh (every 5 minutes) ---
const REFRESH_INTERVAL = 5 * 60 * 1000;
setInterval(async () => {
  console.log('[Background] Refreshing rates...');
  try {
    const result = await fetchRates();
    if (result.success && result.rates) {
      cache = {
        rates: result.rates.rates,
        timestamp: Date.now(),
        source: result.rates.source,
        lastAttempt: Date.now()
      };
      console.log(`[Background] Cache updated from ${result.rates.source}`);
    }
  } catch (err) {
    console.error('[Background] Refresh failed:', err.message);
  }
}, REFRESH_INTERVAL);

// Initial fetch at startup
app.listen(PORT, async () => {
  console.log(`Exchange Rate Service running on port ${PORT}`);
  try {
    const result = await fetchRates();
    if (result.success && result.rates) {
      cache = {
        rates: result.rates.rates,
        timestamp: Date.now(),
        source: result.rates.source,
        lastAttempt: Date.now()
      };
      console.log(`[Startup] Initial cache loaded from ${result.rates.source}`);
    }
  } catch (err) {
    console.error('[Startup] Initial fetch failed:', err.message);
  }
});
