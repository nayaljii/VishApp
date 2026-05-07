// ================= GLOBAL VARIABLES =================
const BASE_URL = "https://groupchat-app-fut2.onrender.com";
const socket = io(BASE_URL);
const token = localStorage.getItem("token");   
const name = localStorage.getItem("username");
const messageContainer = document.querySelector('.container');
const messageInput = document.getElementById('messageInp');
const chatUsersDiv = document.getElementById("chat-users");
const registeredUsersDiv = document.getElementById("registered-users");
const toggleRegisteredUsersBtn = document.getElementById("toggle-registered-users");
const typingIndicator = document.getElementById('typing-indicator');
const form = document.getElementById('send-container');
const toggle = document.getElementById('menu-toggle');
const anim = document.getElementById("sendAnim");
const emojiBtn = document.getElementById("emojiBtn");
const pickerContainer = document.getElementById("emojiPickerContainer");
const emojiPicker = document.getElementById("emojiPicker");

if(!name) {
    window.location.href = "/home.html";
}
if(!token) {
    window.location.href = "/home.html";
}

// ================= State variables =================
let chatMode = "group";
let selectedUser = null;
let replyingTo = null;
let lastDateKey = "";
let hasUserInteracted = false;
let userAtBottom = true;
let allUsers = [];
let currentOnlineUsers = [];
let unreadCounts = {};
let registeredVisible = false;
let typingTimeout;
let pickerOpen = false;
let ignoreNextInputFocus = false;

// ================= AUDIO =================
// Send msg notification audio
var audio0 = new Audio('Upload/sms.mp3');
audio0.preload = "auto";
audio0.volume = 1;

// Receive msg notification audio
var audio1 = new Audio('Upload/astute.mp3');
audio1.preload = "auto";
audio1.volume = 1;

// ================= LOAD FUNCTIONS =================
// Load all group messages
async function loadMessages(){
    try{
        const res = await fetch(`${BASE_URL}/messages`);

        const messages = await res.json();
        messageContainer.innerHTML = ""; //clear old
        lastDateKey = "";

        messages.forEach(msg => {
            if(msg.name == name){
                append({
                    name: "You",
                    message: msg.message,
                    time: msg.time,
                    replyTo: msg.replyTo,
                    reactions: msg.reactions
                }, 'right', msg._id);
            }
            else{
                append({
                    name: msg.name,
                    message: msg.message,
                    time: msg.time,
                    replyTo: msg.replyTo,
                    reactions: msg.reactions
                }, 'left', msg._id);
            }
        });
    }catch(err){
        console.error("Error loading messages:", err);
    }
}

// Load private messages
async function loadPrivateMessages(sender, receiver) {
    try {
        const res = await fetch(`${BASE_URL}/private/messages/${sender}/${receiver}`);
        const messages = await res.json();

        messageContainer.innerHTML = "";
        lastDateKey = "";

        messages.forEach(msg => {
            if (msg.sender === name) {
                append({
                    name: "",
                    message: msg.message,
                    time: msg.time,
                    replyTo: msg.replyTo,
                    reactions: msg.reactions
                }, "right", msg._id);
            } else {
                append({
                    name: msg.sender,
                    message: msg.message,
                    time: msg.time,
                    replyTo: msg.replyTo,
                    reactions: msg.reactions
                }, "left", msg._id);
            }
        });
    } catch (err) {
        console.error("Private messages load error:", err);
    }
}

// Load registered users
async function loadRegisteredUsers() {
    try {
        const res = await fetch(`${BASE_URL}/api/auth/users`);
        const users = await res.json();
        allUsers = users;

        registeredUsersDiv.innerHTML = "";

        users.forEach(user => {
            const userEl = document.createElement("div");
            userEl.classList.add("registered-user");

            const isOnline = currentOnlineUsers.includes(user.username);

            userEl.innerHTML = `
                <b>${user.username}</b>
                <small>${isOnline ? "Online" : formatLastSeen(user.lastSeen)}</small>
            `;

            // Private Chat Console
            userEl.addEventListener("click", () => {
                if (user.username === name) return;
                openPrivateChat(user);
            });

            registeredUsersDiv.appendChild(userEl);
        });

    } catch (error) {
        console.error("Error loading registered users:", error);
    }
}

// Load chat users
async function loadChatUsers() {
    try {
        const res = await fetch(`${BASE_URL}/chat-list/${name}`);
        const chatUsers = await res.json();

        chatUsersDiv.innerHTML = "";

        if (chatUsers.length === 0) {
            chatUsersDiv.innerHTML = `<small>No chats yet</small>`;
            return;
        }

        chatUsers.forEach(chat => {
            const userEl = document.createElement("div");
            userEl.classList.add("chat-user");

            const unread = unreadCounts[chat.username] || 0;

            userEl.innerHTML = `
                <div style="display:flex; justify-content:space-between;">
                    <b>${chat.type === "group" ? "Vish'sUp Group" : chat.username}</b>
                    ${unread > 0 ? `<span class="unread-badge">${unread}</span>` : ""}
                </div>
                <small>${chat.lastMessage || "No messages yet"}</small>
            `;

            userEl.addEventListener("click", () => {
                if (chat.type === "group") {
                    openGroupChat();
                } else {
                    const fullUser = allUsers.find(u => u.username === chat.username);

                    openPrivateChat({
                        username: chat.username,
                        lastSeen: fullUser?.lastSeen || null
                    });
                }
            });

            chatUsersDiv.appendChild(userEl);
        });

    } catch (err) {
        console.error("Error loading chat users:", err);
    }
}

// ================= MESSAGE UI =================
// Append message to UI
const append = (data, position, id) => {

    // Date Format
    if (position !== "system" && data.time) {
        const msgDate = new Date(data.time);
        const currentDateKey = msgDate.toDateString();

        if (currentDateKey !== lastDateKey) {
            const dateDiv = document.createElement("div");
            dateDiv.classList.add("date-separator");
            dateDiv.innerText = formatDateLabel(data.time);

            messageContainer.appendChild(dateDiv);
            lastDateKey = currentDateKey;
        }
    }

    // Button Div
    const wrapper = document.createElement("div");
    wrapper.classList.add("message-wrapper", position);

    const messageElement = document.createElement("div");
    messageElement.classList.add("message", position);
    messageElement.setAttribute("data-id", id);

    // Button Container
    const actions = document.createElement("div");
    actions.classList.add("msg-actions");

    // Long Press Touch
    let pressTimer;
    let longPressed = false;
    wrapper.addEventListener("touchstart", (e) => {
        pressTimer = setTimeout(() => {
            longPressed = true;
            document.querySelectorAll(".message-wrapper").forEach(w => {
                w.classList.remove("active");
            });

            wrapper.classList.add("active");

            if (navigator.vibrate) navigator.vibrate(40);
        }, 500);
    });

    wrapper.addEventListener("touchend", () => {
        clearTimeout(pressTimer);
        setTimeout(() => {
            longPressed = false;
        }, 100);
    });

    wrapper.addEventListener("touchmove", () => {
        clearTimeout(pressTimer);
        longPressed = false;
    });

    wrapper.addEventListener("click", (e) => {
        if (longPressed) {
            e.preventDefault();
            e.stopPropagation();
        }
    });

    

    // Button
    const replyBtn = document.createElement("button");
    replyBtn.innerHTML = `<i class="ph ph-arrow-bend-up-left"></i>`;
    replyBtn.classList.add("reply-btn");
    replyBtn.onclick = () => {
        replyingTo = {
            id,
            sender: data.name,
            message: data.message
        };

        document.getElementById("replyPreview").style.display = "flex";

        if (chatMode === "private") {
            document.getElementById("replyText").innerText = data.message;
        } else {
            document.getElementById("replyText").innerText = `Replying to ${data.name}: ${data.message}`;
        }
    };

    const reactBtn = document.createElement("button");
    reactBtn.innerHTML = `<i class="ph ph-smiley"></i>`;
    reactBtn.classList.add("react-btn");
    reactBtn.onclick = (e) => {
        e.stopPropagation();
        showReactionPicker(messageElement, id);
    };

    // For delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.innerHTML = `<i class="ph ph-trash"></i>`;
    deleteBtn.classList.add("delete-btn");

    deleteBtn.onclick = () => {
        if (chatMode === "private") {
            socket.emit("delete-private-message", id);
        } else {
            socket.emit("delete-message", id);
        }
    };

    if (position !== "system" && id) {
        actions.appendChild(replyBtn);
        actions.appendChild(reactBtn);

        if (position === "right") {
            actions.appendChild(deleteBtn);
        }
    }

    // Logic
    if (position === "right") {
        wrapper.appendChild(actions);
        wrapper.appendChild(messageElement);
    } else {
        wrapper.appendChild(messageElement);
        wrapper.appendChild(actions);
    }

    messageContainer.appendChild(wrapper);

    // For Name Div
    const nameDiv = document.createElement('div');
    nameDiv.classList.add('msg-name');
    nameDiv.innerText = data.name;

    // For Reply msg Div
    let touchStartX = 0;
    let touchEndX = 0;
    
    if (data.replyTo) {
        const replyBox = document.createElement("div");
        replyBox.classList.add("reply-box");
        if (chatMode === "private") {
            replyBox.innerHTML = `
                <span>${data.replyTo.message}</span>
            `;
        } else {
            replyBox.innerHTML = `
                <b>${data.replyTo.sender}</b>
                <span>${data.replyTo.message}</span>
            `;
        }

        replyBox.addEventListener("click", () => {
            const originalMsg = document.querySelector(`[data-id="${data.replyTo.id}"]`);

            if (originalMsg) {
                originalMsg.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });

                originalMsg.classList.add("highlight-msg");

                setTimeout(() => {
                    originalMsg.classList.remove("highlight-msg");
                }, 1500);
            }
        });

        messageElement.appendChild(replyBox);
    }

    // For message text div
    const textDiv = document.createElement('div');
    textDiv.classList.add('msg-text');
    textDiv.innerText = data.message;
    
    // For Time Div
    const timeDiv = document.createElement('div');
    timeDiv.classList.add('msg-time');
    timeDiv.innerText = formatTime(data.time);
    
    if (chatMode !== "private") {
        const nameDiv = document.createElement('div');
        nameDiv.classList.add('msg-name');
        nameDiv.innerText = data.name;

        messageElement.appendChild(nameDiv);
    }

    messageElement.appendChild(textDiv);
    messageElement.appendChild(timeDiv);
    messageElement.setAttribute('data-id', id);
    
    // Auto scroll to bottom of container
    if(position=='right' || userAtBottom){
        messageContainer.scrollTop = messageContainer.scrollHeight;
    }

    messageElement.addEventListener("touchstart", (e) => {
        touchStartX = e.changedTouches[0].screenX;
    });

    messageElement.addEventListener("touchend", (e) => {
        touchEndX = e.changedTouches[0].screenX;

        const swipeDistance = touchEndX - touchStartX;

        if (Math.abs(swipeDistance) > 70) {
            replyingTo = {
                id,
                sender: data.name,
                message: data.message
            };

            document.getElementById("replyPreview").style.display = "flex";

            if (chatMode === "private") {
                document.getElementById("replyText").innerText = data.message;
            } else {
                document.getElementById("replyText").innerText = `Replying to ${data.name}: ${data.message}`;
            }

            messageInput.focus();

            messageElement.classList.add("swipe-reply-effect");
            setTimeout(() => {
                messageElement.classList.remove("swipe-reply-effect");
            }, 250);
        }
    });

    renderReactions(messageElement, data.reactions);
};

// Format time
function formatTime(date) {
    const d = new Date(date);
    let hours = d.getHours();
    let minutes = d.getMinutes();

    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${minutes} ${ampm}`;
}

// Format date
function formatDateLabel(date) {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date();

    yesterday.setDate(today.getDate() - 1);

    const isToday =
        d.toDateString() === today.toDateString();

    const isYesterday =
        d.toDateString() === yesterday.toDateString();

    if (isToday) return "Today";
    if (isYesterday) return "Yesterday";

    const diffDays = Math.floor(
        (today - d) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 7) {
        return d.toLocaleDateString("en-US", { weekday: "long" });
    }

    return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

// ================= REPLY + REACTIONS =================
// Show reaction picker
function showReactionPicker(messageElement, id) {
    const oldPicker = document.querySelector(".reaction-picker");
    if (oldPicker) oldPicker.remove();

    const picker = document.createElement("div");
    picker.classList.add("reaction-picker");

    ["👍", "❤️", "😂", "😮", "😢"].forEach(emoji => {
        const btn = document.createElement("button");
        btn.innerText = emoji;

        btn.onclick = () => {
            socket.emit("react-message", {
                id,
                emoji,
                username: name,
                chatMode
            });

            picker.remove();
        };

        picker.appendChild(btn);
    });

    document.body.appendChild(picker);

    const rect = messageElement.getBoundingClientRect();
    picker.style.top = `${rect.top - 45}px`;

    let left = rect.left;
    if (chatMode === "private" || messageElement.classList.contains("right")) {
        left = rect.right - 190;
    }

    picker.style.left = `${Math.max(10, left)}px`;

    setTimeout(() => {
        document.addEventListener("pointerdown", closeReactionPicker);
    }, 0);
}

// Close reaction picker
function closeReactionPicker(e) {
    const picker = document.querySelector(".reaction-picker");

    if (
        picker &&
        !picker.contains(e.target) &&
        !e.target.closest(".react-btn") &&
        !e.target.closest(".reaction-display")
    ) {
        picker.remove();
        document.removeEventListener("pointerdown", closeReactionPicker);
    }
}

// Render reactions UI
function renderReactions(messageElement, reactions = {}) {
    let reactionDiv = messageElement.querySelector(".reaction-display");

    if (!reactions || Object.keys(reactions).length === 0) {
        if (reactionDiv) reactionDiv.remove();
        return;
    }

    if (!reactionDiv) {
        reactionDiv = document.createElement("div");
        reactionDiv.classList.add("reaction-display");
        messageElement.appendChild(reactionDiv);
    }

    reactionDiv.innerHTML = "";

    Object.entries(reactions).forEach(([emoji, users]) => {
        if (users.length > 0) {
            const span = document.createElement("span");
            span.innerText = `${emoji} ${users.length}`;
            if (users.includes(name)) {
                span.classList.add("my-reaction");
            }

            span.onclick = (e) => {
                e.stopPropagation();
                showReactionUsers(reactions, messageElement.dataset.id);
            };

            reactionDiv.appendChild(span);
        }
    });

    if (reactionDiv.innerHTML === "") {
        reactionDiv.remove();
    }
}

// Show who reacted user
function showReactionUsers(reactions, messageId) {
    const old = document.querySelector(".reaction-users-popup");
    if (old) old.remove();

    const popup = document.createElement("div");
    popup.classList.add("reaction-users-popup");

    Object.entries(reactions).forEach(([emoji, users]) => {
        if (users.length === 0) return;

        users.forEach(user => {
            const row = document.createElement("div");
            row.classList.add("reaction-user-row");

            row.innerHTML = `
                <span class="emoji">${emoji}</span>
                <span class="users">${user === name ? "You" : user}</span>
            `;

            if (user === name) {
                row.classList.add("my-reaction-row");

                row.onclick = (e) => {
                    e.stopPropagation();

                    socket.emit("react-message", {
                        id: messageId,
                        emoji: emoji,
                        username: name,
                        chatMode: chatMode
                    });

                    popup.remove();
                };
            }
            popup.appendChild(row);
        });
    });

    document.body.appendChild(popup);

    // center popup
    popup.style.top = "50%";
    popup.style.left = "50%";
    popup.style.transform = "translate(-50%, -50%)";

    setTimeout(() => {
        document.addEventListener("click", closeReactionUsers);
    }, 0);
}

// Close reacted user
function closeReactionUsers(e) {
    const popup = document.querySelector(".reaction-users-popup");

    if (popup && !popup.contains(e.target)) {
        popup.remove();
        document.removeEventListener("click", closeReactionUsers);
    }
}

// ================= EMOJI SYSTEM =================
function openEmojiPicker() {
    pickerContainer.style.display = "block";
    pickerOpen = true;
    emojiBtn.innerHTML = `<i class="ph ph-keyboard"></i>`;
}

function closeEmojiPicker() {
    pickerContainer.style.display = "none";
    pickerOpen = false;
    emojiBtn.innerHTML = `<i class="ph ph-smiley-sticker"></i>`;
}

// ================= SOCKET EVENTS =================
// Notify server about new user joining
socket.on('connect', () => {
    socket.emit('new-user-joined', name);
});

// Update user
socket.on('update-users', (users) => {
    currentOnlineUsers = users.map(user => user.name);
    loadRegisteredUsers();
    refreshSelectedUserStatus();
});

// Receive group message
socket.on('receive', data => {
    if (chatMode !== "group") return;

    if(data.name === name){
        append({
            name: 'You',
            message: data.message,
            time: data.time || new Date(),
            replyTo: data.replyTo,
            reactions: data.reactions
        }, 'right', data.id);

        // Play sound only for msg send has interacted with the page
        if(hasUserInteracted){
            playSound(audio0);
        }
    }
    else{
        append({
            name: data.name,
            message: data.message,
            time: data.time || new Date(),
            replyTo: data.replyTo,
            reactions: data.reactions
        }, 'left', data.id);

        // Play sound only for incoming messages and if user has interacted with the page
        if(hasUserInteracted){
            playSound(audio1);
        }
    }
})

// Receive private message
socket.on("receive-private-message", (data) => {

    if (data.sender !== name) {
        if (chatMode !== "private" || data.sender !== selectedUser) {
            unreadCounts[data.sender] = (unreadCounts[data.sender] || 0) + 1;
        }
    }

    if (chatMode !== "private") return;
    if (data.sender !== selectedUser && data.sender !== name) return;

    if (data.sender === name) {
        append({
            name: "",
            message: data.message,
            time: data.time,
            replyTo: data.replyTo,
            reactions: data.reactions
        }, "right", data.id);

        // Play sound only for msg send has interacted with the page
        if(hasUserInteracted){
            playSound(audio0);
        }
    } else {
        append({
            name: data.sender,
            message: data.message,
            time: data.time,
            replyTo: data.replyTo,
            reactions: data.reactions
        }, "left", data.id);

        // Play sound only for incoming messages and if user has interacted with the page
        if(hasUserInteracted){
            playSound(audio1);
        }
    }
    loadChatUsers();
});

// Group message delete
socket.on('message-deleted', id => {
    const msg = document.querySelector(`[data-id="${id}"]`);
    if(msg){
        msg.closest(".message-wrapper")?.remove();
    }
});

// Private message delete
socket.on("private-message-deleted", id => {
    const msg = document.querySelector(`[data-id="${id}"]`);
    if (msg) {
        msg.closest(".message-wrapper")?.remove();
    }
    loadChatUsers();
});

// Reaction Update
socket.on("message-reaction-updated", ({ id, reactions }) => {
    const msg = document.querySelector(`[data-id="${id}"]`);
    if (msg) {
        renderReactions(msg, reactions);
    }
});

// Typing indicator
socket.on('user-typing', (typingname) => {
    if (chatMode !== "group") return;
    
    if (typingname !== name) {
        typingIndicator.innerText = `${typingname} is typing...`;
    }
});

// Stop Typing indicator
socket.on('user-stop-typing', () => {
    if (chatMode !== "group") return;
    typingIndicator.innerText = '';
});

// Private Typing indicator
socket.on("private-user-typing", ({ sender }) => {
    if (chatMode !== "private") return;
    if (sender !== selectedUser) return;

    typingIndicator.innerText = `${sender} is typing...`;
});

// Stop Private Typing indicator
socket.on("private-user-stop-typing", ({ sender }) => {
    if (chatMode !== "private") return;
    if (sender !== selectedUser) return;

    typingIndicator.innerText = "";
});

// ================= EVENT LISTENERS =================
// Toggle menu
if(toggle) {
    toggle.addEventListener('change', () => {
        document.body.classList.toggle("no-scroll", toggle.checked);
    });
}

// Send message
form.addEventListener('submit', (e) =>{
    e.preventDefault();
    
    const message = messageInput.value.trim();  //remove extra spaces form start and end
    
    pickerContainer.style.display = "none";
    pickerOpen = false;
    emojiBtn.innerHTML = `<i class="ph ph-smiley-sticker"></i>`;

    // msg empty check
    if(message === ""){
        return;
    }
    if (socket.connected) {
        if (chatMode === "private" && selectedUser) {
            socket.emit("private-message", {
                sender: name,
                receiver: selectedUser,
                message,
                replyTo: replyingTo
            });
        } else {
            socket.emit("send", {
                message,
                replyTo: replyingTo
            });
        }

        replyingTo = null;
        document.getElementById("replyPreview").style.display = "none";

        anim.play();
    }
    socket.emit('stop-typing');
    messageInput.value= '';
});

// User Joined or send message
document.addEventListener('click', () => {
    hasUserInteracted = true;
});

// Typing
messageInput.addEventListener('input', () => {
    if (chatMode === "private" && selectedUser) {
        socket.emit("private-typing", {
            sender: name,
            receiver: selectedUser
        });
    } else {
        socket.emit("typing", name);
    }

    clearTimeout(typingTimeout);

    typingTimeout = setTimeout(() => {
        if (chatMode === "private" && selectedUser) {
            socket.emit("private-stop-typing", {
                sender: name,
                receiver: selectedUser
            });
        } else {
            socket.emit("stop-typing");
        }
    }, 2000);
});

// Emoji button
emojiBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (pickerOpen) {
        closeEmojiPicker();
        messageInput.focus();
    } else {
        openEmojiPicker();
    }
});

emojiPicker.addEventListener("emoji-click", (event) => {
    ignoreNextInputFocus = true;

    const emoji = event.detail.unicode;
    const start = messageInput.selectionStart ?? messageInput.value.length;
    const end = messageInput.selectionEnd ?? messageInput.value.length;

    messageInput.value =
        messageInput.value.slice(0, start) +
        emoji +
        messageInput.value.slice(end);

    const cursorPos = start + emoji.length;
    messageInput.focus();
    messageInput.setSelectionRange(cursorPos, cursorPos);

    setTimeout(() => {
        ignoreNextInputFocus = false;
    }, 100);
});

messageInput.addEventListener("focus", () => {
    if (ignoreNextInputFocus) return;
    if (pickerOpen) closeEmojiPicker();
});

document.addEventListener("click", (e) => {
    const path = e.composedPath();

    if (path.includes(pickerContainer)) return;
    if (path.includes(emojiBtn)) return;

    if (pickerOpen) closeEmojiPicker();
});

// Register User button
toggleRegisteredUsersBtn.addEventListener("click", () => {
    registeredVisible = !registeredVisible;

    if (registeredVisible) {
        registeredUsersDiv.style.display = "flex";
        registeredUsersDiv.style.flexDirection = "column";
        loadRegisteredUsers();
    } else {
        registeredUsersDiv.style.display = "none";
    }
});

// Back Button
document.getElementById("backToChatsBtn").addEventListener("click", () => {
    document.body.classList.remove("chat-open");
    document.getElementById('chatBotBtn').style.display = "flex";
});

// Cancel Reply
document.getElementById("cancelReply").addEventListener("click", () => {
    replyingTo = null;
    document.getElementById("replyPreview").style.display = "none";
});

// Scroll if user already bottom
messageContainer.addEventListener('scroll', () => {
    const threshold = 50;
    if(messageContainer.scrollTop + messageContainer.clientHeight >= messageContainer.scrollHeight - threshold){
        userAtBottom = true;
    }
    else{
        userAtBottom = false;
    }
});

// PointerDown remove active class
document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".message-wrapper")) {
        document.querySelectorAll(".message-wrapper").forEach(w => {
            w.classList.remove("active");
        });
    }
});

// ================= AUTH =================
// get user details
async function getUserDetails(username) {
    try {
        const res = await fetch(`${BASE_URL}/api/auth/users`);
        const users = await res.json();

        return users.find(user => user.username === username);
    } catch (err) {
        console.error("User details fetch error:", err);
        return null;
    }
}

// Open Private Chat
async function openPrivateChat(user) {
    chatMode = "private";
    selectedUser = user.username;

    const menuToggle = document.getElementById("menu-toggle");
    if (menuToggle) {
        menuToggle.checked = false;
        document.body.classList.remove("no-scroll");
    }
    
    document.getElementById('chatBotBtn').style.display = "none";

    document.body.classList.add("chat-open");
    document.querySelector(".chat-layout").classList.add("chat-selected");
    
    const isOnline = currentOnlineUsers.includes(user.username);
    const statusText = isOnline ? "Online" : formatLastSeen(user.lastSeen);
    
    document.getElementById("chatTitle").innerText = user.username;
    document.getElementById("chatStatus").innerText = statusText;
    
    messageContainer.innerHTML = "";
    typingIndicator.innerText = "";

    socket.emit("join-private-room", {
        sender: name,
        receiver: selectedUser
    });

    unreadCounts[user.username] = 0;
    loadChatUsers();
    await loadPrivateMessages(name, selectedUser);
}

// Open Group chat
function openGroupChat() {
    chatMode = "group";
    selectedUser = null;

    document.getElementById('chatBotBtn').style.display = "none";

    document.body.classList.add("chat-open");
    document.querySelector(".chat-layout").classList.add("chat-selected");

    document.getElementById("chatTitle").innerText = "Vish'sUp";
    document.getElementById("chatStatus").innerText = "Group Chat";

    messageContainer.innerHTML = "";
    typingIndicator.innerText = "";
    lastDateKey = "";

    loadMessages();

    const menuToggle = document.getElementById("menu-toggle");
    if (menuToggle) {
        menuToggle.checked = false;
        document.body.classList.remove("no-scroll");
    }
}

// User LastSeen
function formatLastSeen(lastSeen) {
    if (!lastSeen) return "Not seen yet";

    const diff = Date.now() - new Date(lastSeen).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return "Last seen just now";
    if (minutes < 60) return `Last seen ${minutes} min ago`;
    if (hours < 24) return `Last seen ${hours} hr ago`;

    return `Last seen ${days} day ago`;
}

// Refresh Selected User Status
function refreshSelectedUserStatus() {
    if (chatMode !== "private" || !selectedUser) return;

    const selectedUserData = allUsers.find(u => u.username === selectedUser);
    const isOnline = currentOnlineUsers.includes(selectedUser);

    const statusText = isOnline
        ? "Online"
        : formatLastSeen(selectedUserData?.lastSeen);

    document.getElementById("chatStatus").innerText = statusText;
    document.getElementById("mobileChatStatus").innerText = statusText;
}

// Play sound
function playSound(audio){
    const sound = audio.cloneNode(); // Clone the audio element to allow overlapping sounds
    sound.play().catch(err => console.log("Audio blocked:", err));
}

//  Delete message
function deleteMessage(id){
    socket.emit('delete-message', id);
}

// Logout
function logout(){
    if(confirm("Are you sure you want to logout?")){
        if(socket){
            socket.disconnect();
        }
        // clear local storage
        localStorage.removeItem("token");
        localStorage.removeItem("username");
        socket.removeAllListeners(); // Remove all socket listeners
        // Redirect to home page
        window.location.href = "/home.html";
    }
}

// Open Chat Bot
function openChatBot() {
    window.location.href = "/chatbot.html";
}

// ================= INIT =================

window.addEventListener("DOMContentLoaded", () => {
    loadMessages();
    loadRegisteredUsers();
    loadChatUsers();
});
window.addEventListener("load", () => {
    socket.emit('stop-typing');
});