const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    time: {
        type: Date,
        default: Date.now,
    },
    replyTo: {
        id: String,
        sender: String,
        message: String
    },
    reactions: {
        type: Map,
        of: [String],
        default: {}
    },
    status: {
        type: String,
        enum: ["sent", "delivered", "seen"],
        default: "sent"
    }
});

module.exports = mongoose.model("Message", messageSchema);