module.exports = function (mqttClient, io) {
    const express = require('express');
    const router = express.Router();
    const emailService = require('../utils/emailService');

    // Initialize email service
    emailService.initializeEmailService();

    // Store messages per topic and thresholds per user
    let mqttMessages = {};
    let userThresholds = {};

    // Set up MQTT message handling once
    mqttClient.on('message', (topic, message) => {
        const msg = message.toString();
        mqttMessages[topic] = msg;
        io.emit('soilMoisture', { topic, message: msg });
        console.log('Emitted soilMoisture to all clients:', topic, msg);

        // Extract user email from topic (assuming topic format is email/soilMoisture/data)
        const userEmail = topic.split('/')[0];
        
        // Get user threshold or use default 30 if not set
        const threshold = userThresholds[userEmail] || 30;
        
        // Check if moisture exceeds threshold
        if (parseInt(msg) > threshold) {
            console.log(`High soil moisture level detected (${msg}), threshold: ${threshold}`);
            
            // Send email alert using the email service
            emailService.sendAlertEmail(
                userEmail,
                'High Soil Moisture Alert',
                msg,
                threshold,
                'Please check your irrigation system. Soil moisture level exceeds your set threshold.'
            ).then(result => {
                if (result.throttled) {
                    console.log('Alert email was throttled');
                } else {
                    console.log('Alert email sent successfully');
                }
            }).catch(err => {
                console.error('Failed to send alert email:', err);
            });
        }
    });

    const authMiddleware = (req, res, next) => {
        if (!req.session.name) {
            return res.redirect('/');
        }
        next();
    };

    router.use(authMiddleware);

    router.get('/soil-moisture', (req, res) => {
        const topic = `${req.session.name}/soilMoisture/data`;
        const userEmail = req.session.name;

        // Subscribe to the topic if not already subscribed
        mqttClient.subscribe(topic);
        console.log('Subscribed to topic:', topic);

        // Get current threshold or default to 30
        const threshold = userThresholds[userEmail] || 30;

        res.render('dashboard/soilMoisture', {
            email: userEmail,
            mqttData: mqttMessages,
            topic: topic,
            threshold: threshold // Pass the threshold to the template
        });
    });

    // Handle irrigation control button
    router.post('/soilMoisture', (req, res) => {
        const { state } = req.body;
        const topic = `${req.session.name}/soilMoisture`;
        const message = `${state}`;
        console.log(message, topic);

        mqttClient.publish(topic, message);
        res.json({ success: true });
    });

    // Add endpoint to update threshold
    router.post('/update-threshold', (req, res) => {
        const { threshold } = req.body;
        const userEmail = req.session.name;
        
        // Validate threshold
        const thresholdValue = parseInt(threshold);
        if (isNaN(thresholdValue) || thresholdValue < 0 || thresholdValue > 100) {
            return res.status(400).json({ 
                success: false, 
                message: 'Threshold must be a number between 0 and 100.' 
            });
        }

        // Save the new threshold
        userThresholds[userEmail] = thresholdValue;
        console.log(`Updated threshold for ${userEmail} to ${thresholdValue}`);

        res.json({ success: true, threshold: thresholdValue });
    });

    return router;
};