const express = require('express');
const os = require("os");

const authorization = require('../authorization');
const accountManager = require('../accountManager');
const firewall = require('../core/firewall');
const preferences = require('../preferences');

const router = express.Router();

router.get('/', function(req, res) {
    if (authorization.verifyToken(req.cookies.loginToken, req)) {
        accountManager.idExists(authorization.getID(req), true, function(exists) {
            if (exists) {
                let redirect = req.query.redirect;
                if (redirect === undefined) redirect = "";
                res.redirect("/" + redirect);
            }
            else res.render('login', {hostname: os.hostname()});
        });

    } else res.render('login', {hostname: os.hostname()});

});

router.use('/token', authorization.login);

module.exports = router;
