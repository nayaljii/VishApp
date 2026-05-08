const mongoose = require("mongoose");

const privateMessageSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
    },
    sender: {
        type: String,
        required: true,
    },
    receiver: {
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

module.exports = mongoose.model("PrivateMessage", privateMessageSchema);