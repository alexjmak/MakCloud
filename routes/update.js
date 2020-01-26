const express = require('express');
const os = require("os");
const createError = require('http-errors');
const authorization = require("../authorization");
const accountManager = require("../accountManager");
const router = express.Router();

router.get('/', function(req, res, next) {
    let id = authorization.getLoginTokenAudience(req);
    accountManager.getInformation("privilege", "id", id, function(privilege) {
        if (privilege === 100) {
            res.render('update', {hostname: os.hostname()});
        } else {
            next(createError(401));
        }
    });
});


router.post('/', function(req, res) {
    let server = req.body.server;

    //send post request to update server
    getRequest("localhost" + "/update/files", function(xmlHttpRequest) {
        if (xmlHttpRequest.status === 200) {
            console.log(xmlHttpRequest.responseText);
        }
    });

    res.sendStatus(200);
});

router.get('/files', function(req, res) {
    res.send("1");
});

module.exports = router;
