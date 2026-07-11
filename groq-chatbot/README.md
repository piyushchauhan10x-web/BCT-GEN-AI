# Groq AI Chatbot 🤖⚡

A production-ready, beginner-friendly AI chatbot powered by [Groq](https://groq.com)'s
ultra-fast inference API. Streaming responses, conversation memory, a clean modern UI,
and zero frontend build tools.

![status](https://img.shields.io/badge/status-active-brightgreen) ![node](https://img.shields.io/badge/node-%3E%3D18-339933) ![license](https://img.shields.io/badge/license-MIT-blue)

---

## ✨ Features

- ⚡ **Real-time streaming** — replies appear token-by-token, just like ChatGPT/Claude
- 🧠 **Conversation memory** — the full chat history is sent with every request
- 💾 **Persistent history** — conversations survive a page refresh via `localStorage`
- 🔒 **Secure by design** — your Groq API key never leaves the backend
- 🚦 **Built-in rate limiting** — protects your Groq usage/bill from abuse
- ✅ **Input validation & graceful error handling** on both frontend and backend
- 🎨 **Modern, responsive UI** — no frameworks, no build step, just HTML/CSS/JS
- ☁️ Simple enough to deploy anywhere Node.js runs (Render, Railway, Fly.io, a VPS, etc.)

---

## 📁 Project Structure

```
groq-chatbot/
├── backend/
│   ├── server.js          # Express server + Groq API integration
│   ├── package.json
│   ├── .env.example       # copy to .env and add your key
│   └── .gitignore
├── frontend/
│   ├── index.html         # chat UI structure
│   ├── style.css          # modern responsive styling
│   └── script.js          # streaming fetch logic + state
├── README.md               # you are here
├── SETUP.md                # step-by-step install & run guide
└── DOCUMENTATION.md         # full technical / architecture reference
```

---

## 🚀 Quick Start

```bash
cd backend
npm install
cp .env.example .env        # then paste your Groq API key inside
npm start
```

Open **http://localhost:3000** — the same server serves the API and the UI.

👉 For detailed, step-by-step instructions (including testing and deployment), see **[SETUP.md](./SETUP.md)**.
👉 For architecture, API reference, and customization details, see **[DOCUMENTATION.md](./DOCUMENTATION.md)**.

---

## 🧰 Tech Stack

| Layer | Tech |
|---|---|
| Backend | Node.js, Express, `groq-sdk` |
| Frontend | Vanilla HTML / CSS / JavaScript (no framework, no build step) |
| AI Provider | [Groq](https://groq.com) (default model: `openai/gpt-oss-120b`) |
| Persistence | Browser `localStorage` (client-side only) |

---

## 🔑 Getting a Groq API Key

1. Sign up for free at [console.groq.com](https://console.groq.com)
2. Go to **API Keys → Create API Key**
3. Copy the key (starts with `gsk_...`) into your `.env` file

No credit card is required for the free tier.

---

## 🩹 Troubleshooting

Full table of common issues is in [DOCUMENTATION.md](./DOCUMENTATION.md#-troubleshooting), but the two most common ones:

| Symptom | Fix |
|---|---|
| `Missing GROQ_API_KEY` on startup | Run `cp .env.example .env` and paste your key |
| `401` error in browser | Regenerate your key at console.groq.com/keys |

---

## 📄 License

MIT — free to use, modify, and deploy for personal or commercial projects.
