// emailService.js
const nodemailer = require('nodemailer');

// Configure email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS 
    }
});

// Initialize the email service
function initializeEmailService() {
    // Test email configuration
    transporter.verify(function(error, success) {
        if (error) {
            console.error('Email configuration error:', error);
        } else {
            console.log('Email server is ready to send messages');
        }
    });
}

// Track email alerts to prevent spamming
const alertSentTimestamps = {};

// Function to send alert email
function sendAlertEmail(recipient, subject, data, threshold , emailcontent) {
    console.log('Attempting to send email alert to:', recipient);
    
    // Check if we've sent an alert for this recipient in the last 10 minutes
    const now = Date.now();
    const recipientKey = `${recipient}-${subject}`;
    
    if (alertSentTimestamps[recipientKey] && now - alertSentTimestamps[recipientKey] < 60000) {
        console.log('Email alert throttled for recipient:', recipient);
        return Promise.resolve({ throttled: true });
    }

    // Update the timestamp for this recipient
    alertSentTimestamps[recipientKey] = now;
    
    const mailOptions = {
        from: 'coppercloud2023@gmail.com',
        to: recipient,
        subject: subject,
        html: `
            <h2>⚠️ ${subject}</h2>
            <p>The sensor has detected a high reading of <strong>${data}</strong>, which exceeds the safe threshold of ${threshold}.</p>
            <p>${emailcontent}</p>
            <p>Time of detection: ${new Date().toLocaleString()}</p>
            <p>This is an automated alert from your monitoring system.</p>
        `
    };

    return new Promise((resolve, reject) => {
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error sending email alert:', error);
                reject(error);
            } else {
                console.log('Email alert sent successfully to:', recipient);
                console.log('Response:', info.response);
                resolve(info);
            }
        });
    });
}

// Function to send custom email
function sendCustomEmail(from, to, subject, htmlContent) {
    const mailOptions = {
        from: from || 'coppercloud2023@gmail.com',
        to: to,
        subject: subject,
        html: htmlContent
    };

    return new Promise((resolve, reject) => {
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error sending email:', error);
                reject(error);
            } else {
                console.log('Email sent successfully to:', to);
                resolve(info);
            }
        });
    });
}

module.exports = {
    initializeEmailService,
    sendAlertEmail,
    sendCustomEmail
};