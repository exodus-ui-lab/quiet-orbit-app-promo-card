# API contract — Skywatch app promo card (Lumendrift Aerospace)

Stack: Node.js 22 + Fastify. Two endpoints under `/api`. All responses are JSON (`Content-Type: application/json; charset=utf-8`).
The frontend calls both with relative URLs and `Accept: application/json`.

The example bodies below are exactly what `demo.json` → `mockResponses` promises; the backend tests assert the same
status codes and body shapes.

---

## GET /api/app

Purpose: the promo card's data — rating, download count, the three carousel screens and the per-platform download links.
The page renders authored defaults first and then refreshes them from this response, so the body must match the
defaults shown in `frontend/index.html` (4.8, 12.4K ratings, 386K downloads, the two `.example` links).

Request headers: `Accept: application/json`. No body, no query parameters.

### 200 OK

```json
{
  "app": { "name": "Skywatch", "version": "3.4.1" },
  "rating": { "average": 4.8, "count": 12400 },
  "downloads": 386000,
  "screens": [
    { "id": "alerts", "title": "Pass alerts" },
    { "id": "compass", "title": "Sky compass" },
    { "id": "launches", "title": "Launch calendar" }
  ],
  "links": {
    "phone": "https://lumendrift.example/phone",
    "tablet": "https://lumendrift.example/tablet"
  }
}
```

Field types: `rating.average` number (0–5, one decimal), `rating.count` integer, `downloads` integer, `screens` array of
`{ id: string, title: string }` (exactly three, in carousel order), `links.phone` / `links.tablet` absolute https URLs on
the `lumendrift.example` host. Static data; serve from a module constant. Cache header: `Cache-Control: public, max-age=300`.

Other statuses: none expected. On any failure the frontend keeps its authored defaults.

Related, outside `/api`: the small-screen download buttons are authored as `GET /download/phone` and `GET /download/tablet`.
Serve each as a `302` redirect to the matching `links` entry above (the page swaps in the absolute links once
GET /api/app has answered, so the redirect is only the no-JavaScript fallback). Unknown platforms get a plain `404`.

---

## POST /api/app-link

Purpose: send the download link for one platform to a phone (SMS) or an email address, and return a masked destination
for the success message. The backend does not need a real SMS/email provider: log the delivery and respond.

Request headers: `Content-Type: application/json`, `Accept: application/json`.

Request body:

| Field | Type | Rules |
|---|---|---|
| `channel` | string | required; `"sms"` or `"email"` |
| `destination` | string | required; trimmed; max 254 characters. For `sms`: E.164 after removing spaces, hyphens, dots and parentheses, i.e. `/^\+[1-9]\d{6,14}$/`. For `email`: `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/`, max 254 chars, lower-cased domain |
| `platform` | string | required; `"phone"` or `"tablet"` (selects the link from the same table GET /api/app serves) |
| `company` | string | honeypot; optional; must be empty. The frontend always sends `""` |

Unknown fields are ignored. Body size limit: 4 KB (Fastify `bodyLimit: 4096`); larger or non-JSON bodies get a 400 with
the validation body below. The frontend sends the normalized phone number (spaces already removed) but the server must
normalize again.

### Example request (what the demo sends)

```http
POST /api/app-link
Content-Type: application/json

{ "channel": "sms", "destination": "+4791234532", "platform": "tablet", "company": "" }
```

### 200 OK (exact body for the request above)

```json
{
  "ok": true,
  "channel": "sms",
  "platform": "tablet",
  "maskedDestination": "+47 ••• •• 532",
  "message": "It can take up to a minute to arrive."
}
```

`message` is the human-readable line the UI prints under "Link sent to {maskedDestination}". It is the same fixed
sentence for every successful request.

Masking rules (`maskedDestination`):

- SMS, E.164 input `+CCNNNNNNNN`: keep the country code (1–3 digits — use the longest match from this list of common
  prefixes: 1, 7, 20, 27, 30–34, 36, 39, 40, 41, 43–49, 51–58, 60–66, 81, 82, 84, 86, 90–98, otherwise 3 digits) and
  the last three digits; everything in between becomes bullets grouped as `••• ••` (for 5 hidden digits) or one group of
  bullets per hidden digit, split into groups of three. Format: `+CC ••• •• 532` — country code, space, bullet groups,
  space, last three digits. For `+4791234532`: country code `47`, hidden digits `91234` → `••• ••`, visible `532` →
  `+47 ••• •• 532`.
- Email `local@domain`: first character of the local part, three bullets, then `@domain` in full. `sanna@example.com` →
  `s•••@example.com`.

Honeypot: if `company` is a non-empty string, respond `200` with the same success shape (so bots cannot tell) but do not
log a delivery.

### 400 Bad Request — validation

```json
{
  "ok": false,
  "error": "validation",
  "message": "Use an international number, like +47 912 34 567.",
  "fields": { "destination": "invalid_phone" }
}
```

`fields` keys: `channel` (`"invalid_channel"`), `destination` (`"required"`, `"invalid_phone"`, `"invalid_email"`,
`"too_long"`), `platform` (`"invalid_platform"`). `message` is a complete English sentence for the first problem; the UI
shows `message` under the input. Messages: channel → "Choose SMS or email."; destination required → "Enter where the
link should go."; invalid_phone → "Use an international number, like +47 912 34 567."; invalid_email → "That email
address does not look complete."; too_long → "That address is too long."; platform → "Choose Phone or Tablet."

### 429 Too Many Requests — rate limit

Two limits, both sliding windows kept in memory:

- per client IP (`request.ip`, trust `X-Forwarded-For` only when behind a proxy): 5 requests per 10 minutes;
- per recipient (normalized destination, lower-cased for email): 3 requests per hour.

Response has a `Retry-After` header in seconds and this body:

```json
{
  "ok": false,
  "error": "rate_limited",
  "message": "Too many requests. Try again in 10 minutes.",
  "retryAfterSeconds": 600
}
```

### 500 Internal Server Error

```json
{ "ok": false, "error": "server", "message": "Something went wrong on our side. Please try again in a moment." }
```

The UI treats any non-2xx or `ok: false` body by printing `message` under the input; a network failure prints its own
authored text.

---

## Protections (both endpoints)

- Strict JSON parsing; reject non-object bodies; `bodyLimit` 4096 bytes.
- Validation as above before any work; never echo raw input back (the masked destination is the only derived value).
- Rate limiting per IP and per recipient on POST /api/app-link (429 + `Retry-After`).
- Honeypot field `company`.
- Security headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Cache-Control: no-store` on POST.
- CORS: same-origin only by default. If `ALLOWED_ORIGIN` is set, allow exactly that origin for `GET, POST` with
  `Content-Type` header; no credentials.
- Log deliveries as structured lines `{ channel, platform, maskedDestination, ip }` — never the full destination.

## Tests to include

- GET /api/app returns 200 and deep-equals `demo.json` → `mockResponses["GET /api/app"].body`.
- POST /api/app-link with the demo request returns 200 and deep-equals the demo's POST body.
- `destination: "+47 912 34 532"` (with spaces) normalizes and returns the same masked value.
- `channel: "email"`, `destination: "sanna@example.com"` → `maskedDestination: "s•••@example.com"`.
- Invalid phone, invalid email, missing field, bad platform → 400 bodies as specified.
- Sixth request from one IP within 10 minutes → 429 with `Retry-After`.
- Honeypot filled → 200 success shape, no delivery logged.
