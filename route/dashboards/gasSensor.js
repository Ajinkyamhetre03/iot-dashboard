module.exports = function (mqttClient, io) {
    const express = require('express');
    const router = express.Router();
    const emailService = require('../utils/emailService');
    
    // Initialize email service
    emailService.initializeEmailService();

    // Store messages per topic and user thresholds
    let mqttMessages = {};
    let userThresholds = {}; // Store user-specific thresholds

    // Set up MQTT message handling once
    mqttClient.on('message', (topic, message) => {
        console.log('Received MQTT message on topic:', topic);
        
        try {
            // Parse the JSON message
            const parsed = JSON.parse(message.toString());
            
            // Store the message
            mqttMessages[topic] = parsed;
            
            // Check if gasLevel property exists
            if (parsed.gasLevel !== undefined) {
                console.log('Gas level detected:', parsed.gasLevel);
                
                // Extract user email from topic (assuming topic format is email/gasSensor/data)
                const userEmail = topic.split('/')[0];
                
                // Get user threshold or use default 400 if not set
                const threshold = userThresholds[userEmail] || 400;
                
                if (parsed.gasLevel > threshold) {
                    console.log(`High gas level detected: ${parsed.gasLevel}, threshold: ${threshold}`);
                    
                    // Send email alert using the email service
                    emailService.sendAlertEmail(
                        userEmail,
                        'High Gas Level Alert',
                        parsed.gasLevel,
                        threshold,
                        'Please check your environment immediately from gasSensor device'
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
            }
            
            // Emit the parsed data to clients
            io.emit('gasSensor', parsed);
        } catch (error) {
            console.error('Error parsing MQTT message:', error);
            io.emit('error', { message: 'Invalid data format received' });
        }
    });

    const authMiddleware = (req, res, next) => {
        if (!req.session.name) {
            return res.redirect('/');
        }
        next();
    };

    router.use(authMiddleware);

    router.get('/mq2', (req, res) => {
        const topic = `${req.session.name}/gasSensor/data`;
        const userEmail = req.session.name;

        // Subscribe to the topic if not already subscribed
        mqttClient.subscribe(topic);
        console.log('Subscribed to topic:', topic);

        // Get current threshold or default to 400
        const threshold = userThresholds[userEmail] || 400;

        res.render('dashboard/gasSensor', {
            email: userEmail,
            mqttData: mqttMessages,
            topic: topic,
            threshold: threshold // Pass the threshold to the template
        });
    });

    // Handle motor control button
    router.post('/gasSensor', (req, res) => {
        const { state } = req.body;
        const topic = `${req.session.name}/gasSensor`;
        const message = `${state}`;
        console.log(message, topic);

        mqttClient.publish(topic, message);
        res.json({ success: true });
    });

    // Add endpoint to update threshold
    router.post('/update-gas-threshold', (req, res) => {
        const { threshold } = req.body;
        const userEmail = req.session.name;
        
        // Validate threshold
        const thresholdValue = parseInt(threshold);
        if (isNaN(thresholdValue) || thresholdValue < 0 || thresholdValue > 1000) {
            return res.status(400).json({ 
                success: false, 
                message: 'Threshold must be a number between 0 and 1000 PPM.' 
            });
        }

        // Save the new threshold
        userThresholds[userEmail] = thresholdValue;
        console.log(`Updated gas threshold for ${userEmail} to ${thresholdValue} PPM`);

        res.json({ success: true, threshold: thresholdValue });
    });

    // Add endpoint to update email throttle time
    router.post('/update-throttle-time', (req, res) => {
        const { minutes } = req.body;
        
        // Validate minutes
        const minutesValue = parseInt(minutes);
        if (isNaN(minutesValue) || minutesValue < 1) {
            return res.status(400).json({ 
                success: false, 
                message: 'Throttle time must be at least 1 minute.' 
            });
        }

        // Convert minutes to milliseconds
        const throttleTimeMs = minutesValue * 60 * 1000;
        
        // Update throttle time in email service
        if (emailService.setThrottleTime && typeof emailService.setThrottleTime === 'function') {
            emailService.setThrottleTime(throttleTimeMs);
            console.log(`Updated email throttle time to ${minutesValue} minutes`);
            res.json({ success: true, minutes: minutesValue });
        } else {
            console.error('setThrottleTime method not available in emailService');
            res.status(500).json({ 
                success: false, 
                message: 'Email service does not support throttle time adjustment.' 
            });
        }
    });

    return router;
};