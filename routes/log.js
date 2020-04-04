const express = require('express');
const createError = require("http-errors");
const accountManager = require("../accountManager");
const authorization = require("../authorization");
const log = require("../log");

const router = express.Router();

router.get('/', function(req, res, next) {
    let id = authorization.getLoginTokenAudience(req);
    accountManager.getInformation("privilege", "id", id, function(privilege) {
        if (privilege === 100) {
            res.send("<pre>" + log.get() + "</pre>");
        } else {
            next(createError(403));
        }
    });
});

router.get('/raw', function(req, res, next) {
    let id = authorization.getLoginTokenAudience(req);
    accountManager.getInformation("privilege", "id", id, function(privilege) {
        if (privilege === 100) {
            res.send(log.get());
        } else {
            next(createError(403));
        }
    });
});


module.exports = router;
