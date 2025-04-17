const express = require('express')
const path = require('path')
const mongoose = require('mongoose')
const mqtt = require('mqtt')
const cookieParser = require('cookie-parser')
const session = require("express-session")
const http = require('http')
const socket = require('socket.io')

const app = express()
const server = http.createServer(app)
const io = socket(server)

mongoose.connect('mongodb+srv://coppercloud2023:sOoFdXTHbRmv6vQ8@cluster0.imnm6.mongodb.net/Dashboard_Master')
    .then(() => { console.log('connected DB') })
    .catch((e) => { console.log('error', e) })


app.set('view engine', "ejs")
app.set('views', path.join(__dirname, 'views'))

const brokerUrl = 'mqtt://dev.coppercloud.in'
const mqttClient = mqtt.connect(brokerUrl)

mqttClient.on('connect', () => {
    console.log('connected to mqtt');

})


app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(session({
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}))

const Auth = require("./route/auth")
const Home = require("./route/home")
const smartHome = require('./route/dashboards/smartHome')(mqttClient, io)
const rtls = require('./route/dashboards/rtls')(mqttClient, io)
const soilMoisture = require('./route/dashboards/soilMoisture')(mqttClient, io)
const gasSensor = require('./route/dashboards/gasSensor')(mqttClient, io)
const dht = require('./route/dashboards/dht')(mqttClient, io)
const pir = require('./route/dashboards/pir')(mqttClient, io)

app.use('/', Home)
app.use('/', Auth)
app.use('/dashboard', smartHome)
app.use('/dashboard', rtls)
app.use('/dashboard', soilMoisture)
app.use('/dashboard', gasSensor)
app.use('/dashboard', dht)
app.use('/dashboard', pir)

app.use((req, res) => {
    res.status(404).render('404')
})


server.listen(3000, () => { console.log('listing on port 3000') })