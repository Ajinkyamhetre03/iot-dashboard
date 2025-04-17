module.exports = function (mqttClient, io) {
    const express = require('express');
    const router = express.Router();

    // Store messages per topic
    let mqttMessages = {};

    mqttClient.subscribe('ajinkya');
    mqttClient.subscribe('mhetre');

    mqttClient.on('message', (topic, message) => {
        const msg = message.toString();
        mqttMessages[topic] = msg;
        io.emit('mqttUpdate', { topic, message: msg });

        console.log('Emitted mqttUpdate to all clients:', topic, msg); // Debug
    });

    const authMiddleware = (req, res, next) => {
        if (!req.session.name) {
            return res.redirect('/');
        }
        next();
    };

    router.use(authMiddleware);

    router.get('/home-automation', (req, res) => {
        res.render('dashboard/smartHome', {
            email: req.session.name,
            mqttData: mqttMessages
        });
    });

    router.post('/smartHome', (req, res) => {
        const { section, device, state } = req.body;
        const topic = `${req.session.name}/smartHome`;
        const message = `${section}/${device}/${state}`;
        console.log(message, topic);


        mqttClient.publish(topic, message);
        res.json({ success: true });
    });

    return router;
};
