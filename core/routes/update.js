const archiver = require('archiver');
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const createError = require('http-errors');
const path = require('path');
const request = require('request-promise');
const unzipper = require('unzipper');

const accountManager = require("../accountManager");
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
        res.sendFile(path.join(__dirname, "..", updateArchiveName), async function () {
            try {
                await fs.promises.unlink(path.join(__dirname, "..", updateArchiveName));
            } catch {}
        });
    });

    let archive = archiver('zip');
    archive.on('error', function(err) {
        throw err;
    });
    archive.pipe(fileOutput);
    archive.glob("core/**"); //TODO non-blocking method
    archive.glob("webdav/**");
    archive.glob("keys/**");
    archive.glob("modules/**");
    archive.glob("static/**");
    archive.glob("routes/**");
    archive.glob("views/**");
    archive.glob("keys/**");
    archive.glob("*.js");
    archive.glob("package.json");
    archive.glob("package-lock.json");
    archive.finalize();
});

router.use(authorization.doAuthorization);

router.use(async function(req, res, next) {
    const id = authorization.getID(req);
    const privilege = await accountManager.getInformation("privilege", "id", id);
    if (privilege === 100) next();
    else next(createError(403));
});

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

    const response = await request(req.protocol + "://" + req.body.server + "/update/files", {
        resolveWithFullResponse: true,
        timeout: 10 * 1000,
        encoding: "binary",
        headers: {authorization: authorizationToken}
    });

    if (response && response.statusCode === 200) {
        log.writeServer(req, "Updating server...");
        await fs.promises.writeFile("update.zip", response.body, "binary");
        const readSteam = fs.createReadStream('update.zip');
        const pipeSteam = readSteam.pipe(unzipper.Extract({path: path.join(__dirname, "..")}));
        const error = async function (e) {
            log.writeServer(req, "Update failed. " + e);
            try {
                await fs.promises.unlink("update.zip");
            } catch {}
            if (!res.headersSent) res.sendStatus(500);
        };
        readSteam.on("error", error);
        pipeSteam.on("error", error);
        pipeSteam.on("finish", async function () {
            try {
                await fs.promises.unlink("update.zip");
            } catch {}
            await terminal("npm install", null);
            await terminal("npm audit fix", null);
            log.writeServer(req, "Update complete");
            if (!res.headersSent) res.sendStatus(200);
            const serviceName = preferences.get("serviceName");
            if (serviceName) {
                await terminal(`sudo service ${serviceName} restart`);
            }
        });
    } else {
        if (response) log.writeServer(req, "Update failed. Update server responded with error " + response.statusCode);
        else log.writeServer(req, "Update failed. No response from server.");
        res.sendStatus(400);
    }
});

module.exports = router;
