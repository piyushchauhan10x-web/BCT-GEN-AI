# Setup Guide

Step-by-step instructions to get the Groq AI Chatbot running locally, testing it,
and deploying it. Should take about 5 minutes for local setup.

## Table of Contents

- [1. Prerequisites](#1-prerequisites)
- [2. Get a Groq API Key](#2-get-a-groq-api-key)
- [3. Local Installation](#3-local-installation)
- [4. Running the App](#4-running-the-app)
- [5. Testing It](#5-testing-it)
- [6. Environment Variables Reference](#6-environment-variables-reference)
- [7. Deployment](#7-deployment)
- [8. Troubleshooting](#8-troubleshooting)

---

## 1. Prerequisites

- **Node.js 18 or newer.** Check your version with:
  ```bash
  node -v
  ```
  If it's missing or older, install it from [nodejs.org](https://nodejs.org) (the LTS version is recommended).
- **npm** (comes bundled with Node.js).
- A **Groq account** and API key — see the next section.
- Any modern web browser (Chrome, Firefox, Edge, Safari).

No Docker, no database, and no build tools are required for this project.

---

## 2. Get a Groq API Key

1. Go to [console.groq.com](https://console.groq.com) and sign up (free, no credit card required).
2. Navigate to **API Keys** in the left sidebar.
3. Click **Create API Key**, give it a name, and copy the value.
   It will look like: `gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
4. Keep this key private — treat it like a password. Never commit it to git or share it publicly.

---

## 3. Local Installation

Unzip/clone the project, then install backend dependencies:

```bash
cd groq-chatbot/backend
npm install
```

This installs the four dependencies listed in `package.json`:

| Package | Purpose |
|---|---|
| `express` | Web server framework |
| `cors` | Allows cross-origin requests (useful if you split frontend/backend later) |
| `dotenv` | Loads variables from `.env` into `process.env` |
| `groq-sdk` | Official Groq client used to call the chat completion API |

Next, create your local environment file:

```bash
cp .env.example .env
```

Open `.env` in a text editor and paste your real key:

```bash
GROQ_API_KEY=gsk_your_real_key_here
```

---

## 4. Running the App

Start the server:

```bash
npm start
```

You should see:

```
✅ Groq chatbot server running at http://localhost:3000
   Using model: openai/gpt-oss-120b
```

Open **http://localhost:3000** in your browser. The same Express server hosts
both the API and the static frontend files, so there is nothing else to run.

### Development mode (auto-restart on save)

```bash
npm run dev
```

This uses Node's built-in `--watch` flag, so the server restarts automatically
whenever you edit `server.js`.

---

## 5. Testing It

### Manual test (recommended for a chat app)

1. Type **"Hello, who are you?"** and press Enter — you should see a typing
   indicator, then the reply streaming in token-by-token.
2. Send a follow-up like **"What did I just ask you?"** — this confirms
   conversation memory is working (the full history is sent each time).
3. Click **Clear** — confirms the conversation resets.
4. Refresh the page mid-conversation — confirms `localStorage` persistence
   (your history should still be there).

### API test with `curl`

With the server running:

```bash
curl -N -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Say hi in 5 words"}]}'
```

The `-N` flag disables curl's output buffering so you can watch the tokens
stream in live rather than all at once at the end.

### Health check

```bash
curl http://localhost:3000/api/health
```

Expected response:

```json
{ "status": "ok", "model": "openai/gpt-oss-120b" }
```

---

## 6. Environment Variables Reference

All variables live in `backend/.env` (copy from `.env.example`):

| Variable | Required | Default | Description |
|---|---|---|---|
| `GROQ_API_KEY` | ✅ Yes | — | Your secret key from console.groq.com. The server refuses to start without it. |
| `PORT` | No | `3000` | Port the Express server listens on. |
| `GROQ_MODEL` | No | `openai/gpt-oss-120b` | Which Groq model to use for chat completions. See [console.groq.com/docs/models](https://console.groq.com/docs/models) for the current list — Groq updates these periodically. |

---

## 7. Deployment

Any Node.js host works. Two simple, low-cost/free options:

### Option A: Render.com (simplest)

1. Push this project to a GitHub repository.
2. On [render.com](https://render.com), click **New → Web Service** and connect your repo.
3. Set **Root Directory** to `backend`.
4. **Build Command:** `npm install`
   **Start Command:** `npm start`
5. Add an environment variable `GROQ_API_KEY` (and optionally `GROQ_MODEL`) in the
   Render dashboard — never commit `.env` to git.
6. Click **Deploy**. Render will give you a public URL serving both the API and the frontend.

### Option B: Railway.app

1. Push to GitHub, then on [railway.app](https://railway.app) choose
   **New Project → Deploy from GitHub repo**.
2. Set the root/service directory to `backend`.
3. Add `GROQ_API_KEY` under **Variables**.
4. Railway auto-detects `npm start`. Deploy, and you'll get a public URL.

### Pre-deployment checklist

- [ ] `.env` is listed in `.gitignore` (it is, by default) — **never** commit your API key.
- [ ] `npm install` runs cleanly with no errors.
- [ ] `npm start` has been tested locally one final time.
- [ ] The `GROQ_API_KEY` environment variable is set in your hosting provider's dashboard.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Server won't start: `Missing GROQ_API_KEY` | `.env` missing or empty | Run `cp .env.example .env` and paste your key |
| `401` error in the browser | Invalid or expired API key | Regenerate a key at console.groq.com/keys |
| `429 Too many requests` | Hit the built-in rate limiter (20 req/min) or Groq's own limit | Wait a minute, or raise `RATE_LIMIT` in `server.js` |
| Chat bubble stays empty forever | Model name deprecated or invalid | Check current models at console.groq.com/docs/models, update `GROQ_MODEL` in `.env` |
| CORS error in console | Frontend served from a different origin than backend | Keep using `http://localhost:3000` for both — don't open `index.html` directly via `file://` |
| Changes to `server.js` not taking effect | Server is still running old code | Stop it (Ctrl+C) and restart, or use `npm run dev` |

Server-side errors always print to your terminal (via `console.error(...)` in
`server.js`) — check there first if something goes wrong.

For architecture details and how to customize the bot's behavior, see
[DOCUMENTATION.md](./DOCUMENTATION.md).
