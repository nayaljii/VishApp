// ================= IMPORTS =================
require('dotenv').config();
const path = require('path');
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const cors = require("cors");
const OpenAI = require("openai");

// ================= MODELS =================
const Message = require("./models/Message");
const Chat = require("./models/Chat");
const User = require("./models/User");
const PrivateMessage = require("./models/PrivateMessage");

// ================= ROUTES =================
const authRoutes = require("./routes/auth");

// ================= DATABASE CONNECTION =================
mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log("Connected to MongoDB"))
.catch((err) => console.log("MongoDB connection error:", err));

// ================= MIDDLEWARE =================
const allowedOrigins = [
    "http://localhost:3000",
    "https://vishsup-nayaljii.vercel.app",
    "https://vishapp-nayaljii.vercel.app"
];

app.use(express.json());
app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

// ================= STATIC FILES =================
app.use(express.static(path.join(__dirname, "../frontend")));

// ================= AUTH ROUTES =================
app.use("/api/auth", authRoutes);

// ================= OPENROUTER CLIENT =================
const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: {
        "HTTP-Referer": "https://VishApp-nayaljii.vercel.app",
        "X-Title": "Vish AI Chatbot",
    },
});

// ================= CHAT LIST API =================
app.get("/chat-list/:username", async (req, res) => {
    try {
        const { username } = req.params;

        const groupLastMsg = await Message.findOne().sort({ time: -1 });

        const privateMessages = await PrivateMessage.find({
            $or: [
                { sender: username },
                { receiver: username }
            ]
        }).sort({ time: -1 });

        const chatMap = new Map();

        if (groupLastMsg) {
            chatMap.set("GROUP_CHAT", {
                type: "group",
                username: "Group Chat",
                lastMessage: groupLastMsg.message,
                time: groupLastMsg.time
            });
        }

        privateMessages.forEach(msg => {
            const otherUser = msg.sender === username ? msg.receiver : msg.sender;

            if (!chatMap.has(otherUser)) {
                chatMap.set(otherUser, {
                    type: "private",
                    username: otherUser,
                    lastMessage: msg.message,
                    time: msg.time
                });
            }
        });

        const chats = Array.from(chatMap.values()).sort(
            (a, b) => new Date(b.time) - new Date(a.time)
        );

        res.json(chats);

    } catch (err) {
        console.error("Chat list error:", err);
        res.status(500).json({ error: "Failed to load chats" });
    }
});

// ================= GROUP MESSAGE APIs =================
app.get('/messages', async (req, res) => {
    try {
        const messages = await Message.find().sort({ time: 1 });
        res.json(messages);
    } catch (err) {
        console.error("Error fetching messages:", err);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// ================= Delete GROUP MESSAGE APIs =================
app.delete('/message/:id', async (req, res) => {
    const messageId = req.params.id;
    if(!mongoose.Types.ObjectId.isValid(messageId)){
        return res.status(400).json({ error: 'Invalid message ID' });
    }
    try {
        await Message.findByIdAndDelete(messageId);
        res.json({ success: true });
    } catch (err) {
        console.error("Error deleting message:", err);
        res.status(500).json({ error: 'Failed to delete message' });
    }
});

// ================= AI CHAT APIs =================
app.get("/ai/history/:username", async (req, res) => {
    const { username } = req.params;

    if (!username) {
        return res.status(400).json({ error: "Username is required" });
    }

    try {
        const chats = await Chat.find({ username }).sort({ createdAt: 1 });
        res.json(chats);
    } catch (error) {
        console.error("AI history fetch error:", error);
        res.status(500).json({ error: "Failed to fetch AI history" });
    }
});

app.post("/ai/chat", async (req, res) => {
    const { username, message } = req.body;

    if (!username || !message) {
        return res.status(400).json({ error: "Username and message are required" });
    }

    try {
        const previousChats = await Chat.find({ username })
        .sort({ createdAt: -1 })
        .limit(6);

        const historyMessages = previousChats
        .reverse()
        .flatMap((chat) => [
            { role: "user", content: chat.message },
            { role: "assistant", content: chat.reply }
        ]);

        const completion = await client.chat.completions.create({
            model: "openrouter/free",
            messages: [
                {
                    role: "system",
                    content: "You are VishAI assistant. Reply in a clean, friendly, modern chat style. Keep answers readable, well-spaced, and not too long unless asked. Use short paragraphs and simple formatting where useful."
                },
                ...historyMessages,
                { role: "user", content: message }
            ]
        });

        const aiReply = completion.choices?.[0]?.message?.content || "No response";

        const savedChat = await Chat.create({
            username,
            message,
            reply: aiReply
        });

        res.json({
            reply: aiReply,
            id: savedChat._id,
            createdAt: savedChat.createdAt
        });
        } catch (err) {
            console.error("AI chat route error:", err);
            res.status(500).json({
                error: err.message || "Something went wrong"
        });
    }
});

app.delete("/ai/history/:username", async (req, res) => {
    const { username } = req.params;

    try {
        await Chat.deleteMany({ username });
        res.json({ success: true, message: "AI history cleared" });
    } catch (error) {
        console.error("AI history delete error:", error);
        res.status(500).json({ error: "Failed to clear AI history" });
    }
});

// ================= PRIVATE CHAT APIs =================
app.get("/private/messages/:user1/:user2", async (req, res) => {
    try {
        const { user1, user2 } = req.params;
        const roomId = getPrivateRoom(user1, user2);

        const messages = await PrivateMessage.find({ roomId }).sort({ time: 1 });

        res.json(messages);
    } catch (err) {
        console.error("Private messages fetch error:", err);
        res.status(500).json({ error: "Failed to fetch private messages" });
    }
});

// ================= SOCKET.IO SETUP =================
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
    methods: ["GET", "POST"],
    cradentials: true
  }
});

// ================= SOCKET HELPERS =================
function getPrivateRoom(user1, user2) {
    return [user1, user2].sort().join("_");
}

function emitOnlineUsers() {
    const usersList = Object.keys(onlineUsers).map(username => ({
        name: username,
        id: onlineUsers[username]
    }));

    io.emit('update-users', usersList);
}

// ================= SOCKET STATE =================
const onlineUsers = {};

// ================= SOCKET EVENTS =================
io.on('connection', socket => {
    socket.on('new-user-joined', name => {
        socket.data.username = name;
        onlineUsers[name] = socket.id;

        emitOnlineUsers();
    });
    
    socket.on('send', async (data) => {
        try {
            const newMsg = new Message({
                name: socket.data.username,
                message: data.message,
                replyTo: data.replyTo || null
            });
            await newMsg.save();
            
            const msgData = {
                message: data.message,
                name: socket.data.username,
                id: newMsg._id,
                time: newMsg.time,
                replyTo: newMsg.replyTo,
                reactions: newMsg.reactions
            };
            
            socket.emit('receive', msgData);
            socket.broadcast.emit('receive', msgData);
        } catch (err) {
            console.error("Error saving message:", err);
        }
    });
    
    socket.on('delete-message', async (id) => {
        if (!id) return;
        try {
            await Message.findByIdAndDelete(id);
            io.emit('message-deleted', id);
        } catch (err) {
            console.error("Error deleting message:", err);
        }
    });
    
    socket.on('typing', () => {
        socket.broadcast.emit('user-typing', socket.data.username);
    });
    socket.on('stop-typing', () => {
        socket.broadcast.emit('user-stop-typing');
    });
    
    socket.on("private-typing", ({ sender, receiver }) => {
        const roomId = getPrivateRoom(sender, receiver);
        socket.to(roomId).emit("private-user-typing", { sender });
    });

    socket.on("private-stop-typing", ({ sender, receiver }) => {
        const roomId = getPrivateRoom(sender, receiver);
        socket.to(roomId).emit("private-user-stop-typing", { sender });
    });

    socket.on('disconnect', async () => {
        const name = socket.data.username;
        
        if(!name) return;
        
        delete onlineUsers[name];
        delete socket.data.username;
        
        try {
            await User.findOneAndUpdate(
                { username: name },
                { lastSeen: new Date() }
            );
        } catch (err) {
            console.error("Last seen update error:", err);
        }
        
        emitOnlineUsers();
    });
    
    socket.on("join-private-room", ({ sender, receiver }) => {
        const roomId = getPrivateRoom(sender, receiver);
        socket.join(roomId);
    });
    
    socket.on("private-message", async ({ sender, receiver, message, replyTo }) => {
        try {
            const roomId = getPrivateRoom(sender, receiver);
            
            const savedMsg = await PrivateMessage.create({
                roomId,
                sender,
                receiver,
                message,
                replyTo: replyTo || null
            });
            
            io.to(roomId).emit("receive-private-message", {
                id: savedMsg._id,
                roomId,
                sender,
                receiver,
                message,
                time: savedMsg.time,
                replyTo: savedMsg.replyTo
            });
            
        } catch (err) {
            console.error("Private message error:", err);
        }
    });
    
    // Private chat delete msg
    socket.on("delete-private-message", async (id) => {
        if (!id) return;
    
        try {
            await PrivateMessage.findByIdAndDelete(id);
            io.emit("private-message-deleted", id);
        } catch (err) {
            console.error("Private message delete error:", err);
        }
    });

    socket.on("react-message", async ({ id, emoji, username, chatMode }) => {
        try {
            const Model = chatMode === "private" ? PrivateMessage : Message;

            const msg = await Model.findById(id);
            if (!msg) return;

            if (!msg.reactions) msg.reactions = new Map();

            let alreadyReactedSameEmoji = false;

            for (const [oldEmoji, users] of msg.reactions.entries()) {
                if (users.includes(username)) {
                    if (oldEmoji === emoji) {
                        alreadyReactedSameEmoji = true;
                    }

                    const updatedUsers = users.filter(u => u !== username);

                    if (updatedUsers.length === 0) {
                        msg.reactions.delete(oldEmoji);
                    } else {
                        msg.reactions.set(oldEmoji, updatedUsers);
                    }
                }
            }

            if (!alreadyReactedSameEmoji) {
                const currentUsers = msg.reactions.get(emoji) || [];
                msg.reactions.set(emoji, [...currentUsers, username]);
            }

            await msg.save();

            io.emit("message-reaction-updated", {
                id,
                reactions: Object.fromEntries(msg.reactions)
            });

        } catch (err) {
            console.error("Reaction error:", err);
        }
    });
});

// ================= SPA FALLBACK =================
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));