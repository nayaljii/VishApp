const chatForm = document.getElementById("bot-chatForm");
const messageInput = document.getElementById("bot-messageInput");
const chatBox = document.getElementById("bot-chatBox");

const username =
  localStorage.getItem("name") || localStorage.getItem("username");

const API_BASE_URL = "https://groupchat-app-fut2.onrender.com";

function goBack() {
  window.location.href = "/";
}

function formatText(text) {
  if (!text) return "";

  let formatted = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  formatted = formatted.replace(/\*(.*?)\*/g, "<em>$1</em>");
  formatted = formatted.replace(/`(.*?)`/g, "<code>$1</code>");

  formatted = formatted.replace(/\n/g, "<br>");

  return formatted;
}

function addMessage(text, sender) {
  if (sender === "bot") {
    removeTypingMessage();
  }

  const messageDiv = document.createElement("div");
  messageDiv.classList.add("bot-message", sender);

  const bubble = document.createElement("div");
  bubble.classList.add("bot-bubble");
  bubble.innerHTML = formatText(text);

  messageDiv.appendChild(bubble);
  chatBox.appendChild(messageDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function addTypingMessage() {
  removeTypingMessage();

  const typingDiv = document.createElement("div");
  typingDiv.classList.add("bot-message", "bot");
  typingDiv.id = "bot-typingMessage";

  const bubble = document.createElement("div");
  bubble.classList.add("bot-bubble", "typing");
  bubble.innerHTML = `
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
  `;

  typingDiv.appendChild(bubble);
  chatBox.appendChild(typingDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function removeTypingMessage() {
  const typingMessage = document.getElementById("bot-typingMessage");
  if (typingMessage) {
    typingMessage.remove();
  }
}

async function loadHistory() {
  try {
    chatBox.innerHTML = "";

    if (!username) {
      addMessage("User not found. Please login again.", "bot");
      return;
    }

    const res = await fetch(
      `${API_BASE_URL}/ai/history/${encodeURIComponent(username)}`
    );
    const data = await res.json();

    if (!Array.isArray(data) || !data.length) {
      addMessage("Hey! How can I help you today?", "bot");
      return;
    }

    data.forEach((chat) => {
      addMessage(chat.message, "user");
      addMessage(chat.reply, "bot");
    });
  } catch (error) {
    console.error("History load error:", error);
    addMessage("Hey! How can I help you today?", "bot");
  }
}

async function clearChat() {
  if (!username) {
    addMessage("User not found. Please login again.", "bot");
    return;
  }

  const confirmClear = confirm("Are you sure you want to clear AI chat history?");
  if (!confirmClear) return;

  try {
    const response = await fetch(
      `${API_BASE_URL}/ai/history/${encodeURIComponent(username)}`,
      {
        method: "DELETE"
      }
    );

    const data = await response.json();

    if (data.success) {
      chatBox.innerHTML = "";
      addMessage("Chat cleared successfully. How can I help you now?", "bot");
    } else {
      addMessage(data.error || "Failed to clear chat.", "bot");
    }
  } catch (error) {
    console.error("Clear chat error:", error);
    addMessage("Unable to clear chat right now.", "bot");
  }
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const message = messageInput.value.trim();
  if (!message) return;

  if (!username) {
    addMessage("User not found. Please login again.", "bot");
    return;
  }

  addMessage(message, "user");
  messageInput.value = "";
  addTypingMessage();

  try {
    const response = await fetch(`${API_BASE_URL}/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username,
        message
      })
    });

    const data = await response.json();

    if (data.reply) {
      addMessage(data.reply, "bot");
    } else {
      addMessage(data.error || "Something went wrong", "bot");
    }
  } catch (error) {
    console.error("Chat error:", error);
    addMessage("Server se connect nahi ho pa raha.", "bot");
  } finally {
    removeTypingMessage();
  }
});

loadHistory();