module.exports = function (mqttClient, io) {
    const express = require('express');
    const router = express.Router();

    // Store messages per topic
    let mqttMessages = {};

    // Set up MQTT message handling once
    mqttClient.on('message', (topic, message) => {
        try {
            // Parse the JSON message
            const parsed = JSON.parse(message.toString());
            
            // Store the message
            mqttMessages[topic] = parsed;
            
            // Emit only the parsed data to clients
            io.emit('rtls', parsed);
            
            console.log('Emitted rtls to all clients:', topic, parsed);
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

    router.get('/rtls', (req, res) => {
        const topic = `${req.session.name}/rtls/data`;

        // Subscribe to the topic if not already subscribed
        mqttClient.subscribe(topic);
        console.log('Subscribed to topic:', topic);

        res.render('dashboard/rtls', {
            email: req.session.name,
            mqttData: mqttMessages,
            topic: topic // Pass the topic to the template
        });
    });

    // Handle irrigation control button
    router.post('/rtls', (req, res) => {
        const { state } = req.body;
        const topic = `${req.session.name}/rtls`;
        const message = `${state}`;
        console.log(message, topic);

        mqttClient.publish(topic, message);
        res.json({ success: true });
    });

    return router;
};