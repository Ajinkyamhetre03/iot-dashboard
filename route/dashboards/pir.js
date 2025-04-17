module.exports = function (mqttClient, io) {
    const express = require('express');
    const router = express.Router();

    // Store messages per topic and current light status
    let mqttMessages = {};
    let lightStatus = false; // Default status

    // Set up MQTT message handling
    mqttClient.on('message', (topic, message) => {
        try {
            // Parse the JSON message or handle string messages
            let parsed;
            try {
                parsed = JSON.parse(message.toString());
            } catch {
                // If not JSON, assume it's a string status like "on" or "off"
                const msgStr = message.toString().toLowerCase();
                parsed = msgStr === "on" || msgStr === "true" || msgStr === "1";
            }
            
            // Store the message and update light status
            mqttMessages[topic] = parsed;
            lightStatus = parsed;
            
            // Emit to clients
            io.emit('pir', lightStatus);
            
            console.log('Emitted to all clients:', topic, lightStatus);
        } catch (error) {
            console.error('Error handling MQTT message:', error);
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

    // GET handler for light status page
    router.get('/pir', (req, res) => {
        const topic = `${req.session.name}/pir/data`;

        // Subscribe to the topic if not already subscribed
        mqttClient.subscribe(topic);
        console.log('Subscribed to topic:', topic);

        res.render('dashboard/pir', {
            email: req.session.name,
            lightStatus: lightStatus, // Pass the current status
            mqttData: mqttMessages,
            topic: topic
        });
    });

    // Add toggle endpoint for the UI
    router.get('/toggle', (req, res) => {
        const newStatus = req.query.status === 'on';
        const topic = `${req.session.name}/pir`;
        const message = newStatus ? 'on' : 'off';
        
        console.log(`Publishing to ${topic}: ${message}`);
        mqttClient.publish(topic, message);

        topic2 = `${req.session.name}/pir/data`;
        mqttClient.publish(topic2 , message);
        console.log('Published to topic:', topic2, message);
        
        // Update the stored status
        lightStatus = newStatus;
        
        res.json({ success: true });
    });

    // Keep your existing POST handler
    router.post('/pir', (req, res) => {
        const { state } = req.body;
        const topic = `${req.session.name}/pir`;
        const message = `${state}`;
        console.log(message, topic);

        mqttClient.publish(topic, message);
        res.json({ success: true });
    });

    return router;
};