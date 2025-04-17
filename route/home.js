const express = require('express')
const User = require('../model/user')

const router = express.Router()

router.get('/', (req, res) => {
    if (!req.session.name) {

        return res.redirect('/home')
    }
    return res.redirect('/login')
})


router.get('/home', (req, res) => {
    if (!req.session.name) {
        return res.redirect('/login')
    }
    res.render('home', { name: req.session.name , role : req.session.role} )
})
module.exports = router