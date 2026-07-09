// ============================================================================
// script.js — Frontend chat logic
//
// Responsibilities:
//   1. Keep track of the conversation (an array of { role, content }).
//   2. Send that conversation to our backend (/api/chat) whenever the user
//      submits a new message.
//   3. Read the STREAMED response and update the UI token-by-token, so text
//      appears the way it does in ChatGPT/Claude.
//   4. Persist conversation history in localStorage so a page refresh
//      doesn't lose the chat.
//   5. Handle loading states and errors gracefully.
// ============================================================================

// ---- Grab references to DOM elements once, up front ------------------------
const chatWindow = document.getElementById('chatWindow');
const emptyState = document.getElementById('emptyState');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');
const errorBanner = document.getElementById('errorBanner');
const errorText = document.getElementById('errorText');
const dismissError = document.getElementById('dismissError');

const STORAGE_KEY = 'groq-chatbot-history';

// ---- Conversation state ------------------------------------------------
// This array is the single source of truth for the conversation. Each item:
// { role: 'user' | 'assistant', content: string }
let conversation = loadHistory();

// A flag so we can disable the input while a response is streaming in,
// preventing the user from firing off a second request mid-stream.
let isStreaming = false;

// ---- Boot: render any saved history on page load ---------------------------
renderAllMessages();

// ============================================================================
// EVENT LISTENERS
// ============================================================================

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  handleSend();
});

// Let Enter submit, but Shift+Enter make a new line (like most chat apps).
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

// Auto-grow the textarea as the user types, up to the CSS max-height.
messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = `${messageInput.scrollHeight}px`;
});

clearBtn.addEventListener('click', () => {
  if (isStreaming) return; // don't allow clearing mid-response
  conversation = [];
  saveHistory();
  chatWindow.innerHTML = '';
  chatWindow.appendChild(emptyState);
  emptyState.style.display = 'block';
});

dismissError.addEventListener('click', hideError);

// ============================================================================
// CORE SEND / STREAM LOGIC
// ============================================================================

async function handleSend() {
  const text = messageInput.value.trim();
  if (!text || isStreaming) return; // ignore empty submits or double-sends

  hideError();

  // 1. Add the user's message to state + UI immediately (optimistic update).
  conversation.push({ role: 'user', content: text });
  renderMessage('user', text);
  saveHistory();

  // 2. Reset the input box.
  messageInput.value = '';
  messageInput.style.height = 'auto';

  // 3. Show a placeholder "typing" bubble for the assistant, which we'll
  //    fill in as tokens stream in.
  const assistantBubble = renderMessage('assistant', '', { typing: true });

  setStreaming(true);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversation }),
    });

    // The backend sends JSON only when there's an error (before streaming
    // starts). If the response isn't ok, parse and show that error.
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `Server error (${response.status})`);
    }

    // ---- Read the streaming body chunk by chunk -------------------------
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    assistantBubble.classList.remove('typing-dots-wrapper');
    assistantBubble.innerHTML = ''; // clear the typing dots
    assistantBubble.classList.add('cursor');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;
      assistantBubble.textContent = fullText; // update UI live
      scrollToBottom();
    }

    assistantBubble.classList.remove('cursor');

    if (!fullText.trim()) {
      throw new Error('Received an empty response from the AI. Please try again.');
    }

    // 4. Save the completed assistant reply into conversation state.
    conversation.push({ role: 'assistant', content: fullText });
    saveHistory();
  } catch (err) {
    console.error('Chat request failed:', err);
    // Remove the empty/partial assistant bubble so we don't leave a broken
    // message in the chat, then show a clear error banner instead.
    assistantBubble.closest('.message-row')?.remove();
    showError(err.message || 'Something went wrong. Please check your connection and try again.');
  } finally {
    setStreaming(false);
  }
}

// ============================================================================
// UI HELPERS
// ============================================================================

function renderMessage(role, content, { typing = false } = {}) {
  emptyState.style.display = 'none';

  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (typing) {
    bubble.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
  } else {
    bubble.textContent = content;
  }

  row.appendChild(bubble);
  chatWindow.appendChild(row);
  scrollToBottom();

  return bubble; // return the bubble element so we can update it live
}

function renderAllMessages() {
  if (conversation.length === 0) return;
  emptyState.style.display = 'none';
  conversation.forEach((msg) => renderMessage(msg.role, msg.content));
}

function scrollToBottom() {
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function setStreaming(streaming) {
  isStreaming = streaming;
  sendBtn.disabled = streaming;
  messageInput.disabled = streaming;
}

function showError(message) {
  errorText.textContent = message;
  errorBanner.classList.remove('hidden');
}

function hideError() {
  errorBanner.classList.add('hidden');
}

// ============================================================================
// PERSISTENCE (localStorage)
// ============================================================================

function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversation));
  } catch (err) {
    // localStorage can fail in private browsing / storage-full scenarios.
    // Not critical to the chat working, so we just log it.
    console.warn('Could not save chat history:', err);
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('Could not load chat history:', err);
    return [];
  }
}
