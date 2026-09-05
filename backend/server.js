import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8787;
const WEBACY_API_KEY = process.env.WEBACY_API_KEY;
const WEBACY_BASE = 'https://api.webacy.com';

if (!WEBACY_API_KEY) {
  console.warn(
    '⚠️  WEBACY_API_KEY is not set. Copy .env.example to .env and add your key from https://developers.webacy.co/billing'
  );
}

/**
 * Thin wrapper around the Webacy DD API.
 * Per Webacy's own docs: "Treat missing, stale, or errored data as unknown —
 * never as safe." So on any failure we return { ok: false } and the caller
 * must fail closed (surface "Unknown" risk), not silently treat it as safe.
 */
async function webacyGet(path) {
  const res = await fetch(`${WEBACY_BASE}${path}`, {
    headers: { 'x-api-key': WEBACY_API_KEY },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, status: res.status, error: body?.message || 'Webacy request failed' };
  }
  return { ok: true, status: res.status, data: body };
}

async function webacyPost(path, payload) {
  const res = await fetch(`${WEBACY_BASE}${path}`, {
    method: 'POST',
    headers: {
      'x-api-key': WEBACY_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, status: res.status, error: body?.message || 'Webacy request failed' };
  }
  return { ok: true, status: res.status, data: body };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(WEBACY_API_KEY) });
});

/**
 * Core SafeSign check.
 *
 * Body: {
 *   from: string          // the signer's wallet address
 *   to: string             // the contract / address they're about to interact with
 *   chain: string           // e.g. "eth", "base", "arb", "pol", "bsc", "avax", "opt", "sol"
 *   data?: string           // raw tx calldata, optional
 *   value?: string          // wei value, optional
 * }
 *
 * We gather three independent signals and combine them into one verdict:
 *   1. /addresses/{to}                -> is the address itself known-bad?
 *   2. /addresses/{from}/approvals     -> does the signer already have risky approvals?
 *   3. /scan/{from}/transactions       -> simulate this specific transaction (if calldata given)
 *
 * Any endpoint that errors is marked "unknown" and pulls the verdict toward
 * caution rather than being ignored — we never let a failed check read as safe.
 */
app.post('/api/check', async (req, res) => {
  const { from, to, chain = 'eth', data, value } = req.body || {};

  if (!to) {
    return res.status(400).json({ error: 'The "to" address is required.' });
  }

  const checks = {};

  // 1. Address / contract risk on the destination
  checks.addressRisk = await webacyGet(`/addresses/${to}?chain=${encodeURIComponent(chain)}`);

  // 2. Existing approval risk for the signer, if provided
  if (from) {
    checks.approvals = await webacyGet(`/addresses/${from}/approvals?chain=${encodeURIComponent(chain)}`);
  }

  // 3. Full transaction simulation, if we have enough to simulate
  if (from && data) {
    checks.simulation = await webacyPost(`/scan/${from}/transactions`, {
      to,
      data,
      value: value || '0',
      chain,
    });
  }

  const verdict = buildVerdict(checks);

  res.json({ checks, verdict });
});

/**
 * Turns the raw Webacy responses into a single Safe / Caution / Danger
 * verdict plus a short list of evidence strings a non-technical user can read.
 */
function buildVerdict(checks) {
  const reasons = [];
  let level = 'safe'; // safe -> caution -> danger, only ever escalates
  let unknownSignals = 0;

  const escalate = (next) => {
    const order = { safe: 0, caution: 1, danger: 2 };
    if (order[next] > order[level]) level = next;
  };

  // --- Address / contract risk ---
  const addr = checks.addressRisk;
  if (!addr || !addr.ok) {
    unknownSignals++;
    reasons.push('Could not verify the destination address right now — treat as unknown, not safe.');
  } else {
    const { overallRisk = 0, high = 0, medium = 0, issues = [] } = addr.data || {};
    if (high > 0 || overallRisk >= 60) {
      escalate('danger');
      reasons.push(`Destination address flagged high risk (score ${overallRisk}).`);
    } else if (medium > 0 || overallRisk >= 30) {
      escalate('caution');
      reasons.push(`Destination address has some risk signals (score ${overallRisk}).`);
    }
    for (const issue of issues.slice(0, 3)) {
      if (issue?.tags) {
        for (const tag of issue.tags) {
          if (tag?.description) reasons.push(tag.description);
        }
      }
    }
  }

  // --- Existing approvals ---
  const appr = checks.approvals;
  if (appr) {
    if (!appr.ok) {
      unknownSignals++;
      reasons.push('Could not check existing token approvals right now.');
    } else {
      const list = Array.isArray(appr.data) ? appr.data : appr.data?.approvals || [];
      const risky = list.filter((a) => a?.risk?.overallRisk >= 30 || a?.risk?.high > 0);
      if (risky.length > 0) {
        escalate('caution');
        reasons.push(`This wallet has ${risky.length} existing approval(s) flagged as risky.`);
      }
    }
  }

  // --- Transaction simulation ---
  const sim = checks.simulation;
  if (sim) {
    if (!sim.ok) {
      unknownSignals++;
      reasons.push('Could not simulate this transaction right now.');
    } else {
      const { overallRisk = 0, high = 0, medium = 0, issues = [] } = sim.data || {};
      if (high > 0 || overallRisk >= 60) {
        escalate('danger');
        reasons.push(`Transaction simulation flagged high risk (score ${overallRisk}).`);
      } else if (medium > 0 || overallRisk >= 30) {
        escalate('caution');
        reasons.push(`Transaction simulation flagged some risk (score ${overallRisk}).`);
      }
      for (const issue of issues.slice(0, 3)) {
        if (issue?.tags) {
          for (const tag of issue.tags) {
            if (tag?.description) reasons.push(tag.description);
          }
        }
      }
    }
  }

  // If everything we checked came back unknown, don't claim "safe"
  if (level === 'safe' && unknownSignals > 0) {
    level = 'caution';
    reasons.push('Not enough data to confirm this is safe — proceed carefully.');
  }

  if (reasons.length === 0) {
    reasons.push('No risk signals found across the checks we ran.');
  }

  return { level, reasons: [...new Set(reasons)] };
}

app.listen(PORT, () => {
  console.log(`SafeSign backend listening on http://localhost:${PORT}`);
});
