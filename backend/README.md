# Skywatch promo API

Fastify service behind the Lumendrift Aerospace "Get Skywatch" promo card: it serves the card's app data and sends a download link by SMS or email (delivery is logged with a masked destination; plug a provider in through `buildApp({ deliver })`).

- Run: `npm install && npm start` (Node.js 22; listens on `PORT`, default 3000).
- Test: `npm test` (runs offline against an in-process instance).
- Configure: `ALLOWED_ORIGIN` (single CORS origin, default same-origin only), `TRUST_PROXY=true` (behind your own proxy), `LOG_LEVEL`.

Endpoints (full contract in [CONTRACT.md](CONTRACT.md)):

- `GET /api/app` — rating, downloads, carousel screens and per-platform links (cached for 5 minutes).
- `GET /download/phone`, `GET /download/tablet` — `302` to the matching link (fallback for pages without JavaScript).
- `POST /api/app-link` — `{ channel, destination, platform, company }`; returns the masked destination. Limited to 5 requests per IP per 10 minutes and 3 per recipient per hour.
