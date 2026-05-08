const express = require("express");
const router = express.Router();
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const PrivateMessage = require("../models/PrivateMessage");

const { OAuth2Client } = require("google-auth-library");
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// GET REGISTERED USERS
router.get("/users", async (req, res) => {
    try {
        const users = await User.find({}, "username email lastSeen lastLogin")
            .sort({ lastLogin: -1, username: 1 });
        res.json(users);
    } catch (error) {
        console.error("Users fetch error:", error);
        res.status(500).json({ msg: "Failed to fetch users" });
    }
});

// GOOGLE LOGIN
router.post("/google-login", async (req, res) => {
    try {
        const { credential } = req.body;

        if (!credential) {
            return res.status(400).json({ msg: "Google credential is required" });
        }

        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();

        const googleId = payload.sub;
        const email = payload.email;
        const username = payload.name || email.split("@")[0];

        if (!email) {
            return res.status(400).json({ msg: "Email not found from Google account" });
        }

        let user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            user = await User.create({
                username,
                email: email.toLowerCase(),
                isVerified: true,
                authProvider: "google",
                googleId,
            });
        } else {
            user.isVerified = true;
            user.authProvider = user.authProvider || "google";
            user.googleId = user.googleId || googleId;
            await user.save();
        }

        user.lastLogin = new Date();
        await user.save();

        const token = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
            },
        });

    } catch (err) {
        console.error("Google login error:", err);
        res.status(500).json({ msg: "Google login failed" });
    }
});

// LOGIN
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const normalizedEmail = email.toLowerCase().trim();

        const user = await User.findOne({ email: normalizedEmail });
        if (!user) return res.status(400).json({ msg: "User not found" });

        if (!user.password) {
            return res.status(400).json({
                msg: "Please login with Google first and set your password from Change Password."
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: "Wrong password" });

        user.lastLogin = new Date();
        await user.save();

        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.json({
            token,
            user: {
                username: user.username,
                email: user.email
            }
        });

    } catch (err) {
        console.error("Error during login:", err);
        res.status(500).json({ msg: "Server error" });
    }
});

// CHANGE PASSWORD
router.post("/change-password", async (req, res) => {
    try {
        const { username, newPassword, confirmPassword } = req.body;

        if (!username || !newPassword || !confirmPassword) {
            return res.status(400).json({ msg: "All fields are required" });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ msg: "Passwords do not match" });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ msg: "Password must be at least 6 characters" });
        }

        const user = await User.findOne({ username });

        if (!user) {
            return res.status(404).json({ msg: "User not found" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        user.password = await bcrypt.hash(newPassword, 10);
        user.authProvider = "local";
        await user.save();

        res.json({ msg: "Password changed successfully" });

    } catch (err) {
        console.error("Change password error:", err);
        res.status(500).json({ msg: "Server error" });
    }
});

// Unread Count
router.get("/unread/:username", async (req, res) => {
    try {

        const username = req.params.username;

        const unreadMessages = await PrivateMessage.find({
            receiver: username,
            status: { $ne: "seen" }
        });

        const unreadCounts = {};

        unreadMessages.forEach(msg => {

            if (!unreadCounts[msg.sender]) {
                unreadCounts[msg.sender] = 0;
            }

            unreadCounts[msg.sender]++;
        });

        res.json(unreadCounts);

    } catch (err) {
        console.error("Unread fetch error:", err);
        res.status(500).json({ msg: "Server error" });
    }
});

module.exports = router;