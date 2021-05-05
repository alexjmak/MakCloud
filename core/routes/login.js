const express = require('express');
const os = require("os");

const authorization = require('../authorization');
const accountManager = require('../accountManager');
const render = require('../render');

const router = express.Router();

router.get('/', async function(req, res, next) {
    if (authorization.verifyToken(req.cookies.loginToken, req)) {
        const exists = await accountManager.idExists(authorization.getID(req), true);
        if (exists) {
            let redirect = req.query.redirect;
            if (redirect === undefined) redirect = "";
            res.redirect("/" + redirect);
        } else {
            render('login', null, req, res, next);
        }
    } else {
        render('login', null, req, res, next);
    }
});

router.head("/check", async function(req, res, next) {
    const isAuthorized = await authorization.isAuthorized(req);
    if (isAuthorized) res.sendStatus(200);
    else res.sendStatus(401);
});

router.use('/token', (req, res, next) => authorization.login(req, res, next));

module.exports = router;
