# Technical Documentation

Deep-dive reference for how the Groq AI Chatbot works internally, its API
contract, configuration options, and how to extend it. For install
instructions, see [SETUP.md](./SETUP.md); for a high-level overview, see
[README.md](./README.md).

## Table of Contents

- [1. Architecture Overview](#1-architecture-overview)
- [2. Request Lifecycle](#2-request-lifecycle)
- [3. Backend Reference (`server.js`)](#3-backend-reference-serverjs)
- [4. Frontend Reference (`script.js`)](#4-frontend-reference-scriptjs)
- [5. API Reference](#5-api-reference)
- [6. Configuration & Customization](#6-configuration--customization)
- [7. Security Model](#7-security-model)
- [8. Rate Limiting](#8-rate-limiting)
- [9. Data & Persistence](#9-data--persistence)
- [10. 🩹 Troubleshooting](#10--troubleshooting)
- [11. Suggested Next Steps](#11-suggested-next-steps)

---

## 1. Architecture Overview

This is a two-tier app with **one server process**:

```
┌─────────────────────────────┐        ┌──────────────────────┐
│         Browser              │        │      Groq API         │
│  index.html + style.css      │        │  (chat completions,   │
│  + script.js                 │        │   stream: true)        │
│                              │        └──────────▲─────────────┘
│  fetch('/api/chat')          │                   │
└──────────────┬───────────────┘                   │ groq-sdk
               │ HTTP (same origin)                │
               ▼                                    │
┌─────────────────────────────────────────────────┐│
│              Express server (server.js)           ││
│  • serves static frontend files                   ││
│  • POST /api/chat  ────────────────────────────────┘
│  • GET  /api/health
│  • in-memory per-IP rate limiter
└───────────────────────────────────────────────────┘
```

Key design decision: **one server serves both the API and the static
frontend**, so there's no separate frontend build step, no CORS
configuration headaches, and only one process to deploy.

---

## 2. Request Lifecycle

1. The user types a message and submits the form (or presses Enter).
2. The frontend pushes `{ role: 'user', content: text }` onto an in-memory
   `conversation` array and immediately renders it (optimistic UI update).
3. The **entire** `conversation` array is POSTed to `/api/chat`. Sending
   the full history on every request is what gives the bot "memory" —
   the underlying model itself is stateless between calls.
4. The backend validates the payload, trims it to the last 20 messages,
   prepends a system prompt, and calls Groq with `stream: true`.
5. Groq streams the response back token-by-token. The backend forwards
   each token to the browser immediately via chunked `text/plain`
   transfer — it does not buffer the full reply before responding.
6. The frontend reads the stream with `response.body.getReader()` and
   appends each chunk into the assistant's message bubble live, creating
   the "typing" effect.
7. Once the stream ends, the frontend pushes the completed assistant
   message into `conversation` and persists the whole array to
   `localStorage`.

---

## 3. Backend Reference (`server.js`)

### Startup validation

The server refuses to boot if `GROQ_API_KEY` isn't set, printing a clear
message instead of failing confusingly mid-conversation later:

```js
if (!process.env.GROQ_API_KEY) {
  console.error('Missing GROQ_API_KEY...');
  process.exit(1);
}
```

### Middleware

- `cors()` — allows cross-origin calls (harmless here since frontend and
  backend share an origin, but useful if you split them later).
- `express.json({ limit: '1mb' })` — parses JSON bodies and caps size to
  guard against oversized payloads.
- `express.static(...)` — serves `frontend/index.html`, `style.css`, and
  `script.js` directly from the same server.

### Routes

| Route | Method | Purpose |
|---|---|---|
| `/` and static assets | `GET` | Serves the frontend files |
| `/api/health` | `GET` | Returns `{ status: 'ok', model }` for uptime checks |
| `/api/chat` | `POST` | Main chat endpoint; validates input, streams Groq's reply |
| `/api/*` (unmatched) | any | Returns `404 { error: 'Not found' }` |

### `/api/chat` internals

1. Rate-limit check per IP (see [Rate Limiting](#8-rate-limiting)).
2. Validates `req.body.messages` is a non-empty array where every item has
   `role` in `['user', 'assistant']` and non-empty string `content`.
3. Slices to the **last 20 messages** (`messages.slice(-20)`) to keep
   requests fast, cheap, and within the model's context window.
4. Prepends a `system` message defining the bot's personality/behavior.
5. Calls `groq.chat.completions.create({ model, messages, temperature: 0.7,
   max_tokens: 1024, stream: true })`.
6. Iterates the async stream with `for await (const chunk of stream)`,
   writing each `chunk.choices[0]?.delta?.content` piece directly to the
   HTTP response as it arrives.
7. On error: if no headers have been sent yet, responds with a clean JSON
   error (`401` for bad API keys, `500` otherwise). If streaming already
   started, it simply ends the response — the frontend detects the
   incomplete/empty reply and shows an error banner.

---

## 4. Frontend Reference (`script.js`)

The frontend is plain JavaScript with no framework or bundler. Key pieces:

- **State**: a single `conversation` array (`{ role, content }[]`) is the
  source of truth, initialized from `localStorage` on load.
- **`handleSend()`**: the core function — pushes the user message,
  renders an optimistic bubble, POSTs to `/api/chat`, then reads the
  response body stream and updates the assistant bubble's `textContent`
  on every chunk.
- **`renderMessage(role, content, { typing })`**: creates a message bubble
  DOM node; when `typing: true` it shows animated dots until real content
  starts arriving.
- **`setStreaming(bool)`**: disables the input/send button while a
  response is in flight, preventing overlapping requests.
- **`saveHistory()` / `loadHistory()`**: read/write the conversation array
  to `localStorage` under the key `groq-chatbot-history`, wrapped in
  `try/catch` since storage can fail (e.g. private browsing mode).
- **Error handling**: network failures or non-OK responses remove the
  partially-rendered assistant bubble and show a dismissible error banner
  instead of leaving a stuck spinner.
- **UX details**: Enter submits, Shift+Enter inserts a newline; the
  textarea auto-grows as you type, up to a CSS-defined max height.

---

## 5. API Reference

### `POST /api/chat`

**Request body:**

```json
{
  "messages": [
    { "role": "user", "content": "Hello!" },
    { "role": "assistant", "content": "Hi there! How can I help?" },
    { "role": "user", "content": "What's the capital of France?" }
  ]
}
```

- `messages` — required, non-empty array.
- Each item requires `role` (`"user"` or `"assistant"`) and `content`
  (non-empty string).
- Only the **last 20** messages are sent to the model, regardless of how
  many you include in the request.

**Success response:** `200 OK`, `Content-Type: text/plain; charset=utf-8`,
body streamed as raw text chunks (the assistant's reply, token by token).

**Error responses:**

| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "Request must include a non-empty \"messages\" array." }` | Missing/empty `messages` |
| `400` | `{ "error": "Each message needs a role..." }` | Malformed message shape |
| `401` | `{ "error": "Invalid Groq API key. Check your .env file." }` | Groq rejected the API key |
| `429` | `{ "error": "Too many requests. Please slow down and try again shortly." }` | Rate limit exceeded |
| `500` | `{ "error": "Something went wrong talking to the AI. Please try again." }` | Any other Groq/network error |

### `GET /api/health`

Returns:

```json
{ "status": "ok", "model": "openai/gpt-oss-120b" }
```

Useful for uptime monitors and hosting-platform health checks.

---

## 6. Configuration & Customization

| What | Where | How |
|---|---|---|
| Bot personality/behavior | `server.js` | Edit the `systemMessage.content` string |
| Model | `.env` | Set `GROQ_MODEL` (see [console.groq.com/docs/models](https://console.groq.com/docs/models)) |
| Response length | `server.js` | Change `max_tokens` in the `groq.chat.completions.create(...)` call |
| Creativity/randomness | `server.js` | Change `temperature` (0 = focused/deterministic, 1+ = more creative) |
| History sent to model | `server.js` | Change `messages.slice(-20)` |
| Rate limit | `server.js` | Adjust `RATE_LIMIT` (requests) / `RATE_WINDOW_MS` (window) |
| Colors / theme | `frontend/style.css` | Edit the CSS custom properties in `:root` |
| Port | `.env` | Set `PORT` |

---

## 7. Security Model

- **API key isolation**: `GROQ_API_KEY` is read only in `server.js` via
  `process.env` and is never sent to, or accessible from, the browser.
  This is the entire reason a backend exists instead of calling Groq
  directly from client-side JS.
- **Input validation**: every request to `/api/chat` is validated for
  shape and type before being forwarded to Groq, preventing malformed or
  malicious payloads from reaching the AI provider.
- **`.env` excluded from git**: `backend/.gitignore` already lists `.env`,
  so your key won't accidentally be committed — but always double-check
  before pushing to a public repository.
- **Body size cap**: `express.json({ limit: '1mb' })` prevents oversized
  request bodies from being processed.

This setup is appropriate for personal projects, demos, and small-scale
production use. For larger-scale production, see
[Suggested Next Steps](#11-suggested-next-steps).

---

## 8. Rate Limiting

A simple in-memory, per-IP rate limiter guards `/api/chat`:

```js
const RATE_LIMIT = 20;          // max requests
const RATE_WINDOW_MS = 60_000;  // per 1 minute
```

For each incoming IP, timestamps of recent requests are kept in a `Map`;
requests older than the window are discarded, and if the remaining count
exceeds `RATE_LIMIT`, the request is rejected with `429`.

**Limitations to be aware of:**
- State is in-memory only — it resets on server restart and isn't shared
  across multiple server instances/replicas.
- It's keyed by `req.ip`, so users behind the same NAT/proxy share a
  limit unless you configure `trust proxy` and forwarded headers
  correctly on your hosting platform.

For real production traffic, swap this for `express-rate-limit` backed by
Redis (see [Suggested Next Steps](#11-suggested-next-steps)).

---

## 9. Data & Persistence

There is **no server-side database or storage** in this project. All
conversation history lives:

1. In memory, in the frontend's `conversation` JS array (source of truth
   for the current tab session).
2. Mirrored to the browser's `localStorage` under the key
   `groq-chatbot-history`, so a page refresh restores it.

This means:
- History is per-browser, not per-user-account — there's no login system.
- Clearing browser data / using a different browser or device starts a
  fresh conversation.
- The server never sees or stores previous conversations beyond the
  single request it's currently handling.

---

## 10. 🩹 Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Server won't start, "Missing GROQ_API_KEY" | `.env` missing or empty | Run `cp .env.example .env` and paste your key |
| `401` error in the browser | Invalid/expired API key | Regenerate a key at console.groq.com/keys |
| `429 Too many requests` | Hit the built-in rate limiter or Groq's own rate limit | Wait a minute, or raise `RATE_LIMIT` in `server.js` |
| Chat bubble stays empty forever | Model name deprecated/invalid | Check current models at console.groq.com/docs/models, update `GROQ_MODEL` in `.env` |
| CORS error in console | Frontend served from a different origin than backend | Keep using `http://localhost:3000` for both — don't open `index.html` directly via `file://` |
| Changes to `server.js` not taking effect | Server still running old code | Stop it (Ctrl+C) and restart, or use `npm run dev` |

Server-side errors always print to your terminal (`console.error(...)` in
`server.js`) — check there first.

---

## 11. Suggested Next Steps

Natural extensions if you want to keep building on this project:

- Swap the in-memory rate limiter for `express-rate-limit` + Redis for
  real production traffic across multiple server instances.
- Add user authentication if you need per-user chat history instead of
  one shared browser's `localStorage`.
- Add a proper database (Postgres/SQLite) so history survives across
  devices and browsers.
- Render markdown (e.g. with `marked.js`) in assistant replies instead of
  plain text — the system prompt already asks the model to use markdown.
- Add automated tests (e.g. with `supertest` for the API, and a headless
  browser tool for the frontend flow).
- Add structured logging and monitoring for production deployments.

---

## Already Built In ✅

- API key stays server-side only, never exposed to the browser.
- Input validation on every request (shape, type, emptiness).
- Basic per-IP rate limiting to protect your Groq bill.
- Startup validation — fails fast with a clear message if misconfigured.
- Conversation history trimmed before sending to the model (cost/latency control).
- Graceful error handling on both frontend and backend, with user-visible
  messages instead of silent failures or stuck spinners.
- Streaming responses for a responsive, modern feel.
