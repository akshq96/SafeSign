import { useState } from 'react';

const CHAINS = [
  { id: 'eth', label: 'Ethereum' },
  { id: 'base', label: 'Base' },
  { id: 'arb', label: 'Arbitrum' },
  { id: 'pol', label: 'Polygon' },
  { id: 'bsc', label: 'BNB Chain' },
  { id: 'opt', label: 'Optimism' },
  { id: 'avax', label: 'Avalanche' },
];

const VERDICT_COPY = {
  safe: {
    label: 'Safe to sign',
    stamp: 'CLEAR',
    blurb: 'No meaningful risk signals turned up across the checks we ran.',
  },
  caution: {
    label: 'Proceed with caution',
    stamp: 'CAUTION',
    blurb: 'Something here is worth a second look before you sign.',
  },
  danger: {
    label: 'Do not sign',
    stamp: 'DANGER',
    blurb: 'This transaction carries meaningful risk of loss.',
  },
};

export default function App() {
  const [chain, setChain] = useState('eth');
  const [to, setTo] = useState('');
  const [from, setFrom] = useState('');
  const [data, setData] = useState('');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!to.trim()) {
      setError('Enter the address or contract you\u2019re about to interact with.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: to.trim(),
          from: from.trim() || undefined,
          chain,
          data: data.trim() || undefined,
          value: value.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Something went wrong.');
      setResult(body);
    } catch (err) {
      setError(err.message || 'Could not reach the risk check service.');
    } finally {
      setLoading(false);
    }
  }

  const verdict = result?.verdict?.level ? VERDICT_COPY[result.verdict.level] : null;

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow-mark">SafeSign</p>
        <h1>
          Read the risk
          <br />
          before you sign.
        </h1>
        <p className="hero-sub">
          Paste in what you're about to sign. SafeSign runs it through Webacy's
          on-chain risk intelligence and hands back a plain verdict — not a wall
          of numbers.
        </p>
      </header>

      <main className="desk">
        <form className="paper" onSubmit={handleSubmit}>
          <div className="paper-heading">
            <span>Transaction review</span>
            <span className="paper-line" />
          </div>

          <label className="field">
            <span>Network</span>
            <select value={chain} onChange={(e) => setChain(e.target.value)}>
              {CHAINS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Contract or address you're interacting with</span>
            <input
              type="text"
              placeholder="0x..."
              value={to}
              onChange={(e) => setTo(e.target.value)}
              required
            />
          </label>

          <label className="field">
            <span>Your wallet address <em>(optional — enables approval &amp; simulation checks)</em></span>
            <input
              type="text"
              placeholder="0x..."
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Calldata <em>(optional)</em></span>
              <input
                type="text"
                placeholder="0x..."
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </label>
            <label className="field field-narrow">
              <span>Value (wei) <em>(optional)</em></span>
              <input
                type="text"
                placeholder="0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
          </div>

          <button type="submit" disabled={loading}>
            {loading ? 'Checking\u2026' : 'Check this transaction'}
          </button>

          {error && <p className="error">{error}</p>}
        </form>

        <div className="verdict-slot">
          {!result && !loading && (
            <div className="verdict-placeholder">
              <p>Your verdict will appear here, stamped like a notarized page.</p>
            </div>
          )}

          {loading && (
            <div className="verdict-placeholder">
              <p>Running the address, approvals, and simulation checks\u2026</p>
            </div>
          )}

          {result && verdict && (
            <div className={`verdict-card verdict-${result.verdict.level}`}>
              <div className="stamp">{verdict.stamp}</div>
              <h2>{verdict.label}</h2>
              <p className="verdict-blurb">{verdict.blurb}</p>
              <ul className="reasons">
                {result.verdict.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>

      <footer className="footer">
        <p>Powered by Webacy's DD.xyz risk intelligence APIs.</p>
      </footer>
    </div>
  );
}
