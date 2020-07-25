const express = require('express');
const createError = require("http-errors");
const os = require("os");

const accountManager = require("../accountManager");
const authorization = require("../authorization");
const log = require("../log");
const render = require('../render');

const router = express.Router();

router.use(function(req, res, next) {
    let id = authorization.getID(req);
    accountManager.getInformation("privilege", "id", id, function(privilege) {
        if (privilege === 100) next();
        else next(createError(403));
    });
});

router.get('/', function(req, res, next) {
    render('log', null, req, res, next);
});

router.get('/raw', function(req, res, next) {
    let send = log.get();
    let start = req.query.start;
    if (start) {
        start = parseInt(start);
        if (Number.isInteger(start) && 0 <= start && start < send.length) send = send.substring(start);
    }
    res.send(send);
});

router.get('/size', function(req, res) {
    let hash = log.get().length;
    res.send(hash.toString());
});

module.exports = router;
