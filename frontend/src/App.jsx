import { useState, useEffect, useCallback } from 'react';

const BASE_CURRENCIES = ['USD', 'EUR', 'GBP'];
const API_BASE = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'}`;

// Format seconds into human-readable age string
function ageLabel(seconds) {
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s ago`;
}

// Freshness indicator dot + label
function StatusBadge({ freshness, cached, ageSeconds }) {
  const config = {
    'fresh': { label: 'Live', cls: 'fresh' },
    'stale': { label: 'Stale', cls: 'stale' },
    'very-stale': { label: 'Very stale', cls: 'very-stale' },
    'error': { label: 'Unavailable', cls: 'error' }
  };
  const entry = config[freshness] || config['error'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span className={`status-dot ${entry.cls}`} />
      <span>
        {entry.label}
        {cached ? ' (cached)' : ''}
        {' · '}{ageSeconds !== null && ageLabel(ageSeconds)}
      </span>
    </div>
  );
}

export default function App() {
  const [base, setBase] = useState('USD');
  const [rates, setRates] = useState([]);
  const [status, setStatus] = useState({
    freshness: null,
    source: null,
    cached: false,
    ageSeconds: null,
    loading: true,
    error: null
  });

  const fetchRates = useCallback(async () => {
    setStatus(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch(`${API_BASE}?base=${base}`);
      if (res.status === 503) {
        const errData = await res.json();
        setStatus(prev => ({
          ...prev,
          loading: false,
          freshness: 'error',
          error: errData.error || 'Service unavailable'
        }));
        return;
      }
      const data = await res.json();

      // Convert rates object to array for display
      const rateList = Object.entries(data.rates)
        .filter(([code]) => code !== base)
        .map(([code, rate]) => ({ code, rate }));

      setRates(rateList);
      setStatus({
        freshness: data.freshness || 'fresh',
        source: data.source,
        cached: data.cached || false,
        ageSeconds: data.age_seconds,
        loading: false,
        error: null
      });
    } catch (err) {
      setStatus(prev => ({
        ...prev,
        loading: false,
        freshness: 'error',
        error: 'Connection failed. Retrying...'
      }));
    }
  }, [base]);

  // Fetch on mount and every 60 seconds
  useEffect(() => {
    fetchRates();
    const interval = setInterval(fetchRates, 60_000);
    return () => clearInterval(interval);
  }, [fetchRates]);

  const isRefreshing = status.loading && status.freshness !== 'error';

  return (
    <div className="container">
      <header>
        <h1>Exchange Rate Tracker</h1>
        <p>Real-time currency rates for travelers and freelancers</p>
      </header>

      <div className="controls">
        <select
          value={base}
          onChange={(e) => setBase(e.target.value)}
        >
          {BASE_CURRENCIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button onClick={fetchRates} disabled={isRefreshing}>
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {status.source && (
        <div className="status-bar">
          <StatusBadge {...{
            freshness: status.freshness,
            cached: status.cached,
            ageSeconds: status.ageSeconds
          }} />
          <span className="source">Source: {status.source}</span>
        </div>
      )}

      {status.error && !rates.length && (
        <div className="error-state">
          <h3>{status.error}</h3>
          <p>Our sources are temporarily down. We'll retry automatically.</p>
        </div>
      )}

      {rates.length > 0 && (
        <div className="rates-grid">
          {rates.map(({ code, rate }) => (
            <div className="rate-card" key={code}>
              <div className="pair">{base} → {code}</div>
              <div className="rate">{rate.toFixed(4)}</div>
              <div className="detail">
                1 {base} = {rate.toFixed(4)} {code}
              </div>
            </div>
          ))}
        </div>
      )}

      {status.loading && !rates.length && !status.error && (
        <div className="loading">Loading exchange rates...</div>
      )}

      <div className="footer">
        Free tier · Rates refresh automatically ·{' '}
        <a href="https://api.exchangerate-api.com" target="_blank" rel="noopener">
          Powered by ExchangeRateAPI
        </a>
      </div>
    </div>
  );
}
