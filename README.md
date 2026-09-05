# SafeSign

A pre-transaction security layer that uses Webacy's DD.xyz risk APIs to analyze
wallets, contracts, tokens, approvals, and transaction behavior **before** a
user signs — turning raw on-chain risk signals into a clear, evidence-backed
verdict: **Safe / Caution / Danger**.

Built for the DD.xyz by Webacy Startup Accelerator Grant.

## How it works

1. You give SafeSign the address/contract you're about to interact with
   (and optionally your wallet + the calldata).
2. The backend calls three real Webacy DD API endpoints in parallel:
   - `GET /addresses/{to}` — is the destination address itself known-risky?
   - `GET /addresses/{from}/approvals` — does your wallet already have risky
     token approvals?
   - `POST /scan/{from}/transactions` — simulate this exact transaction
     before it's signed.
3. Results are combined into one verdict, following Webacy's own guidance to
   **fail closed**: any check that errors or comes back unknown pulls the
   verdict toward caution — it is never silently treated as safe.

## Project structure

```
 safesign/
  backend/    Express server, proxies Webacy's API (keeps your API key server-side)
  frontend/   React + Vite UI
```

## Running it locally

### 1. Backend

```bash
cd backend
cp .env.example .env
# edit .env and paste in your key from https://developers.webacy.co/billing
npm install
npm run dev
```

Runs on `http://localhost:8787`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173` and proxies `/api/*` to the backend.

#

- **Why this fits DD.xyz / Webacy**: it's a direct, user-facing showcase of
  Webacy's own risk intelligence API, applied at the single highest-leverage
  moment — the instant before someone signs.
- **MVP scope (what's built now)**: web app, three-signal risk check
  (address / approvals / simulation), plain-language verdict with evidence.
- **Roadmap**: browser extension that intercepts wallet signing popups
  directly (MetaMask-style), EIP-712 message scanning (`/scan/{from}/eip712`),
  and result caching per Webacy's latency guidance.

## Security note

Your Webacy API key lives only in `backend/.env` and is never sent to the
browser — the frontend only ever talks to your own backend, per Webacy's own
"server-side only" key guidance.
