const express = require('express');
const os = require("os");

const authorization = require('../authorization');
const accountManager = require('../accountManager');

const router = express.Router();

router.get('/', function(req, res) {
    if (authorization.verifyToken(req.cookies.loginToken)) {
        accountManager.accountExists(authorization.getLoginTokenAudience(req), true, function(exists) {
            if (exists) res.redirect("/");
            else res.render('login', {hostname: os.hostname()});
        });

    } else res.render('login', {hostname: os.hostname()});

});


router.use('/token', authorization.login);

module.exports = router;
