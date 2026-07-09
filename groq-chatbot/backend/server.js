// ============================================================================
// server.js — Backend for the Groq AI Chatbot
//
// What this file does:
//   1. Starts a small web server (Express).
//   2. Exposes one main endpoint: POST /api/chat
//   3. That endpoint takes the conversation so far, sends it to Groq's API,
//      and STREAMS the AI's reply back to the browser token-by-token.
//   4. It also serves the frontend (the HTML/CSS/JS files) so you only need
//      to run ONE server for the whole app.
//
// Why a backend at all (instead of calling Groq directly from the browser)?
//   Your GROQ_API_KEY is a secret. If you put it in frontend JavaScript,
//   anyone visiting your site can open dev tools and steal it. The backend
//   keeps the key safely on the server and never sends it to the browser.
// ============================================================================

// Load variables from the .env file into process.env (must be first!)
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const Groq = require('groq-sdk');

// ----------------------------------------------------------------------------
// 1. STARTUP VALIDATION
// Fail fast and loud if the API key is missing, instead of crashing later
// mid-conversation with a confusing error.
// ----------------------------------------------------------------------------
if (!process.env.GROQ_API_KEY) {
  console.error('\n❌ Missing GROQ_API_KEY.');
  console.error('   1. Copy .env.example to .env');
  console.error('   2. Paste your key from https://console.groq.com/keys\n');
  process.exit(1); // stop the server, no point running without a key
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const app = express();
const PORT = process.env.PORT || 3000;

// Which model to use. Groq deprecates/updates models periodically —
// check https://console.groq.com/docs/models for the current list.
// openai/gpt-oss-120b is a strong, fast, low-cost general-purpose model.
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

// ----------------------------------------------------------------------------
// 2. MIDDLEWARE
// ----------------------------------------------------------------------------
app.use(cors()); // allows the frontend to call this API (safe here since we serve both from one origin, but handy if you split them later)
app.use(express.json({ limit: '1mb' })); // parses incoming JSON request bodies, caps size to prevent abuse

// Serve the frontend static files (index.html, style.css, script.js)
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Simple in-memory rate limiter (per IP) — prevents someone from hammering
// your API key and running up your Groq bill. Good enough for a small/demo
// app; swap for a package like express-rate-limit for serious production use.
const requestLog = new Map(); // ip -> array of timestamps
const RATE_LIMIT = 20; // max requests
const RATE_WINDOW_MS = 60 * 1000; // per 1 minute

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT;
}

// ----------------------------------------------------------------------------
// 3. HEALTH CHECK
// Handy for confirming the server is alive, and required by most hosting
// platforms (Render, Railway, etc.) to know your app is up.
// ----------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', model: MODEL });
});

// ----------------------------------------------------------------------------
// 4. MAIN CHAT ENDPOINT
// Expects: { messages: [{ role: 'user' | 'assistant', content: string }, ...] }
// Responds with: a plain-text stream of the AI's reply (chunked transfer).
// ----------------------------------------------------------------------------
app.post('/api/chat', async (req, res) => {
  const ip = req.ip;

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please slow down and try again shortly.' });
  }

  const { messages } = req.body;

  // ---- Input validation --------------------------------------------------
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Request must include a non-empty "messages" array.' });
  }

  const isValidShape = messages.every(
    (m) => m && typeof m.content === 'string' && m.content.trim().length > 0 && ['user', 'assistant'].includes(m.role)
  );
  if (!isValidShape) {
    return res.status(400).json({ error: 'Each message needs a role of "user" or "assistant" and non-empty string content.' });
  }

  // Only keep the last 20 messages. This keeps requests fast/cheap and stays
  // well within the model's context window for a simple chatbot.
  const recentHistory = messages.slice(-20);

  // A system prompt sets the assistant's personality/behavior. Customize this!
  const systemMessage = {
    role: 'system',
    content:
      'You are a helpful, friendly AI assistant in a chat app. Give clear, ' +
      'concise answers. Use markdown formatting (like **bold** or lists) when it improves readability.',
  };

  try {
    // stream: true tells Groq to send the response back piece by piece,
    // instead of waiting for the whole answer to finish generating.
    const stream = await groq.chat.completions.create({
      model: MODEL,
      messages: [systemMessage, ...recentHistory],
      temperature: 0.7, // 0 = deterministic/focused, 1+ = more creative/random
      max_tokens: 1024, // cap on reply length
      stream: true,
    });

    // We stream plain text back to the browser as it arrives.
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || '';
      if (token) {
        res.write(token); // send this piece to the browser immediately
      }
    }

    res.end(); // signal the stream is complete
  } catch (err) {
    console.error('Groq API error:', err?.message || err);

    // If we haven't sent any headers yet, we can still send a clean JSON error.
    if (!res.headersSent) {
      const status = err?.status === 401 ? 401 : 500;
      const message =
        status === 401
          ? 'Invalid Groq API key. Check your .env file.'
          : 'Something went wrong talking to the AI. Please try again.';
      res.status(status).json({ error: message });
    } else {
      // If streaming had already started, just end the response —
      // the frontend's error handling will catch an incomplete reply.
      res.end();
    }
  }
});

// ----------------------------------------------------------------------------
// 5. CATCH-ALL 404 for unknown API routes (keep this AFTER real routes)
// ----------------------------------------------------------------------------
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ----------------------------------------------------------------------------
// 6. START SERVER
// ----------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n✅ Groq chatbot server running at http://localhost:${PORT}`);
  console.log(`   Using model: ${MODEL}\n`);
});
