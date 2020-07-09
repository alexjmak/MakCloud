const archiver = require('archiver');
const child_process = require('child_process');
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const createError = require('http-errors');
const os = require("os");
const path = require('path');
const request = require('request');
const unzipper = require('unzipper');

const accountManager = require("../accountManager");
const authorization = require("../authorization");
const log = require('../core/log');

const router = express.Router();

router.get('/files', function(req, res, next) {
    let token = req.headers.authorization;
    let isValidToken = authorization.verifyToken(token, req).sub === "updateToken";
    if (!isValidToken) return next(createError(403));

    let updateArchiveName = "tmp-" + crypto.randomBytes(4).toString("hex") + ".zip";
    let fileOutput = fs.createWriteStream(updateArchiveName);
    fileOutput.on('close', function () {
        res.sendFile(path.join(__dirname, "..", updateArchiveName), function() {
            try {
                fs.unlinkSync(path.join(__dirname, "..", updateArchiveName));
            }
            catch {}
        });
    });

    let archive = archiver('zip');
    archive.on('error', function(err){
        throw err;
    });
    archive.pipe(fileOutput);
    archive.glob("core/**");
    archive.glob("keys/**");
    archive.glob("static/**");
    archive.glob("routes/**");
    archive.glob("views/**");
    archive.glob("keys/**");
    archive.glob("webdav/**");
    archive.glob("*.js");
    archive.glob("package.json");
    archive.glob("package-lock.json");
    archive.finalize();
});

router.use(authorization.doAuthorization);

router.use(function(req, res, next) {
    let id = authorization.getID(req);
    accountManager.getInformation("privilege", "id", id, function(privilege) {
        if (privilege === 100) next();
        else next(createError(403));
    });
});

router.get('/', function(req, res, next) {
    accountManager.getInformation("username", "id", authorization.getID(req), function (username) {
        res.render('update', {hostname: os.hostname(), username: username});
    });
});

router.post('/', function(req, res) {
    authorization.createJwtToken({sub: "updateToken"}, function(err, authorizationToken) {
        if (err) {
            return res.sendStatus(500);
        }
        request(req.protocol + "://" + req.body.server + "/update/files", {encoding: "binary", headers: {authorization: authorizationToken}}, function(err, response, body) {
            if (response !== undefined && response.statusCode === 200) {
                log.writeServer(req, "Updating server...");
                fs.writeFile("update.zip", body, "binary", function(err) {
                    let readSteam = fs.createReadStream('update.zip');
                    let pipeSteam = readSteam.pipe(unzipper.Extract({ path: path.join(__dirname, "..") }));
                    pipeSteam.on("finish", function() {
                        fs.unlink("update.zip", function() {
                            log.writeServer(req, "Update complete");
                            if (!res.headersSent) res.sendStatus(200);
                            child_process.exec("sudo service MakCloud restart");
                        });
                    });
                    let error = function(e) {
                        log.writeServer(req, "Update failed. " + e);
                        fs.unlink("update.zip", function() {
                            if (!res.headersSent) res.sendStatus(500);
                        });
                    };
                    readSteam.on("error", error);
                    pipeSteam.on("error", error);
                });
            } else {
                if (response !== undefined) log.writeServer(req, "Update failed. Update server responded with error " + response.statusCode);
                else log.writeServer(req, "Update failed. No response from server.");
                res.sendStatus(400);
            }
        });
    }, 10 * 1000);

});

module.exports = router;
