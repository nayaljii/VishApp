const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Otp = require("../models/Otp");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { OAuth2Client } = require("google-auth-library");
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateOtp = require("../utils/generateOtp");
const sendOtpEmail = require("../utils/sendOtpEmail");

// OTP
router.post("/send-otp", async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const normalizedEmail = email.toLowerCase().trim();

        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        const otp = generateOtp();
        const expiresMinutes = Number(process.env.OTP_EXPIRES_MINUTES || 5);
        const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

        await Otp.deleteMany({ email: normalizedEmail });

        await Otp.create({
            email: normalizedEmail,
            otp,
            expiresAt,
        });

        await sendOtpEmail(normalizedEmail, otp);

        res.status(200).json({ message: "OTP sent successfully" });
    } catch (error) {
        console.error("send-otp error:", error);
        res.status(500).json({ message: "Failed to send OTP" });
    }
});

router.post("/verify-otp-register", async (req, res) => {
    try {

        const { username, email, password, otp } = req.body;

        if (!username || !email || !password || !otp) {
            return res.status(400).json({ message: "All fields are required" });
        }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

    const otpDoc = await Otp.findOne({ email: normalizedEmail }).sort({ createdAt: -1 });


    if (!otpDoc) {
        return res.status(400).json({ message: "OTP not found. Please request a new OTP." });
    }

    if (otpDoc.expiresAt < new Date()) {
        await Otp.deleteMany({ email: normalizedEmail });
        return res.status(400).json({ message: "OTP expired. Please request a new OTP." });
    }

    if (otpDoc.otp !== otp) {
        return res.status(400).json({ message: "Invalid OTP" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
        username,
        email: normalizedEmail,
        password: hashedPassword,
        isVerified: true,
        lastLogin: new Date()
    });

    await Otp.deleteMany({ email: normalizedEmail });

    const token = jwt.sign(
        { userId: user._id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );

    res.status(201).json({
        message: "Registration successful",
        token,
        user: {
            id: user._id,
            username: user.username,
            email: user.email,
        },
    });
    } catch (error) {
        console.error("verify-otp-register error:", error);
        res.status(500).json({ message: "Registration failed" });
    }
});

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

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ msg: "User not found" });
        if(!user.isVerified) return res.status(400).json({ msg: "Please verify your email first" })

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: "Wrong password" });
        user.lastLogin = new Date();
        await user.save();

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
                
        res.json({ token, user: { username: user.username, email: user.email}});
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

        user.password = hashedPassword;
        user.authProvider = "local";
        await user.save();

        res.json({ msg: "Password changed successfully" });

    } catch (err) {
        console.error("Change password error:", err);
        res.status(500).json({ msg: "Server error" });
    }
});

module.exports = router;