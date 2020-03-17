const express = require('express');
const os = require("os");
const createError = require('http-errors');
const request = require('request');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');
const authorization = require("../authorization");
const accountManager = require("../accountManager");

const router = express.Router();

router.get('/files', function(req, res, next) {
    let token = req.headers.authorization;
    let isValidToken = authorization.verifyToken(token).sub === "updateToken";
    if (!isValidToken) return next(createError(403));

    var zip = archiver('zip');
    var fileOutput = fs.createWriteStream("tmp.zip");
    fileOutput.on('close', function () {
        res.sendFile(path.join(__dirname, "..", "tmp.zip"), function() {
            fs.unlinkSync(path.join(__dirname, "..", "tmp.zip"));
        });
    });

    zip.pipe(fileOutput);
    zip.glob("keys/**");
    zip.glob("public/**");
    //zip.glob("node_modules/**");
    zip.glob("routes/**");
    zip.glob("views/**");
    zip.glob("keys/**");
    zip.glob("*.js");
    zip.glob("*.json");
    zip.on('error', function(err){
        throw err;
    });
    zip.finalize();
});

router.use(authorization.doAuthorization);

router.get('/', function(req, res, next) {
    let id = authorization.getLoginTokenAudience(req);
    accountManager.getInformation("privilege", "id", id, function(privilege) {
        if (privilege === 100) {
            accountManager.getInformation("username", "id", authorization.getLoginTokenAudience(req), function (username) {
                res.render('update', {hostname: os.hostname(), username: username});
            });
        } else {
            next(createError(403));
        }
    });
});

router.post('/', function(req, res) {
    let authorizationToken = authorization.createToken({sub: "updateToken"}, "10s");
    request(req.protocol + "://" + req.body.server + "/update/files", {encoding: "binary", headers: {authorization: authorizationToken}}, function(err, response, body) {
        fs.writeFile("update.zip", body, "binary", function(err) {
            fs.createReadStream('update.zip').pipe(unzipper.Extract({ path: path.join(__dirname, "..") }));
            res.sendStatus(200);
        })

    });

});

module.exports = router;
