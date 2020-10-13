const archiver = require('archiver');
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const createError = require('http-errors');
const path = require('path');
const got = require('got');
const unzipper = require('unzipper');

const authorization = require("../authorization");
const log = require('../log');
const terminal = require('../terminal');
const render = require('../render');
const preferences = require('../preferences');
const router = express.Router();

router.get('/files', function(req, res, next) {
    const token = req.headers.authorization;
    const isValidToken = authorization.verifyToken(token, req).sub === "updateToken";
    if (!isValidToken) return next(createError(403));

    const updateArchiveName = "tmp-" + crypto.randomBytes(4).toString("hex") + ".zip";
    const fileOutput = fs.createWriteStream(updateArchiveName);
    fileOutput.on('close', function() {
        res.sendFile(path.resolve(updateArchiveName), async function () {
            try {
                await fs.promises.unlink(updateArchiveName);
            } catch {}
        });
    });

    let archive = archiver('zip');
    archive.on('error', function(err) {
        throw err;
    });
    archive.pipe(fileOutput);
    archive.glob("core/**"); //TODO non-blocking method
    archive.glob("keys/**");
    archive.glob("locales/**");
    archive.glob("modules/**");
    archive.glob("static/**");
    archive.glob("routes/**");
    archive.glob("views/**");
    archive.glob("*.js");
    archive.glob("package.json");
    archive.glob("package-lock.json");
    archive.finalize();
});

router.use(authorization.doAuthorization);

router.use((req, res, next) => authorization.checkPrivilege(req, res, next, 100));

router.get('/', function(req, res, next) {
    render('update', null, req, res, next);
});

router.post('/', async function(req, res) {
    let authorizationToken;
    try {
        authorizationToken = await authorization.createJwtToken({sub: "updateToken"});
    } catch {
        res.sendStatus(500);
        return;
    }

    log.writeServer(req, "Requesting update from " + req.protocol + "://" + req.body.server + "/update/files")
    const response = await got.stream(req.protocol + "://" + req.body.server + "/update/files", {
            timeout: 10 * 1000,
            headers: {authorization: authorizationToken}
    });

    log.writeServer(req, "Updating server...");
    const pipeSteam = response.pipe(unzipper.Extract({path: path.resolve(".")}));
    const error = async function (e) {
        log.writeServer(req, "Update failed. " + e);
        try {
            await fs.promises.unlink("update.zip");
        } catch {}
        if (!res.headersSent) res.sendStatus(500);
    };
    response.on("error", error);
    pipeSteam.on("error", error);
    pipeSteam.on("finish", async function () {
        await terminal("npm install", null);
        await terminal("npm audit fix", null);
        log.writeServer(req, "Update complete");
        if (!res.headersSent) res.sendStatus(200);
        const serviceName = preferences.get("serviceName");
        if (serviceName) {
            await terminal(`sudo service ${serviceName} restart`);
        }
    });

});

module.exports = router;
