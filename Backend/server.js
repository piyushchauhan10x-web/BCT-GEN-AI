import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 🔥 ABSOLUTE PATH BINDING: Yeh node ko direct 'frontend' folder par point karega
const frontendPath = path.resolve(__dirname, '../frontend');
app.use(express.static(frontendPath));

/**
 * Groq API Proxy Route
 */
app.post('/api/generate-docs', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt field is missing.' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey.startsWith('gsk_your')) {
      return res.status(500).json({ error: 'Server error: Valid Groq API key is missing in .env' });
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `Groq API Error: ${errorText}` });
    }

    const data = await response.json();
    const parsedText = data.choices[0]?.message?.content || '';
    res.json({ text: parsedText.trim() });
  } catch (err) {
    console.error("Backend runtime failure:", err);
    res.status(500).json({ error: 'Internal server proxy execution failed.' });
  }
});

// Wildcard routing to catch all traffic and serve the main index page
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 [Success] Full-Stack App is running successfully!`);
  console.log(`👉 Open your browser and go to: http://localhost:${PORT}\n`);
});