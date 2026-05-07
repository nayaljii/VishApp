const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

async function sendOtpEmail(to, otp) {
    const mailOptions = {
        from: `"VishApp" <${process.env.EMAIL_USER}>`,
        to: to,
        subject: "Your OTP for VishApp",
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>Email Verification</h2>
                <p>Your OTP is:</p>
                <h1 style="letter-spacing: 5px;">${otp}</h1>
                <p>This OTP will expire in 5 minutes.</p>
            </div>
            `,
    };
    await transporter.sendMail(mailOptions);
}

module.exports = sendOtpEmail;