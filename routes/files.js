const createError = require('http-errors');
const express = require('express');
const fs = require("fs");
const mkdirp = require("mkdirp");
const path = require("path");

const authorization = require("../authorization");
const fileManager = require('../fileManager');
const preferences = require("../core/preferences");
const log = require('../core/log');
const encryptionManager = require('../encryptionManager');
const filesRouter = require("../core/routes/files");




const files = function(getRelativeDirectory, getFilePath) {
    if (!getRelativeDirectory) getRelativeDirectory = (req) => path.join(preferences.get("files"), authorization.getID(req), "files");
    if (!getFilePath) getFilePath = req => path.join(getRelativeDirectory(req), decodeURIComponent(req.path));

    const router = express.Router();

    router.use(async function (req, res, next) {
        let relativeDirectory = getRelativeDirectory(req);
        try {
            await mkdirp(relativeDirectory);
        } catch (err) {
            log.write(err);
            return next(createError(500));
        }
        next();
    });


    router.get('/*', async function (req, res, next) {
        const filePath = getFilePath(req);
        const fileName = path.basename(filePath);
        const relativeDirectory = getRelativeDirectory(req);
        const parameter = Object.keys(req.query)[0];

        const key = req.session.encryptionKey;
        const decryptedFileName = await encryptionManager.decryptFileName(filePath, key);
        const displayName = (decryptedFileName) ? path.basename(decryptedFileName) : fileName;

        let stats;
        try {
            stats = await fs.promises.stat(filePath);
        } catch (err) {
            return next(createError(404));
        }

        if (stats.isDirectory()) {
            switch (parameter) {
                case "download":
                    const archiveStream = await fileManager.createArchive(filePath, key);
                    fileManager.downloadFolder(archiveStream, (req.path !== "/") ? displayName : null, req, res, next)
                    break;
                default:
                    await fileManager.renderDirectory(filePath, relativeDirectory, key, req, res, next);
                    break;
            }
        } else {
            const fileStream = (await fileManager.readFile(filePath, key)).readStream;
            switch (parameter) {
                case "download":
                    fileManager.downloadFile(fileStream, displayName, req, res, next);
                    break;
                case "view":
                    await fileManager.renderFile(displayName, req, res, next);
                    break;
                default:
                    fileManager.inlineFile(fileStream, displayName, req, res, next);
                    break;
            }
        }
    });

    router.post("/*", async function (req, res, next) {
        const filePath = getFilePath(req);
        const key = req.session.encryptionKey;
        try {
            const stats = await fs.promises.stat(filePath);
            if (stats.isDirectory()) {
                await fileManager.processUpload(filePath, key, false, req, res, next);
            } else {
                res.status(400);
            }
        } catch {
            res.status(404);
        }
    });

    router.put("/*", async function (req, res, next) {
        const filePath = getFilePath(req);
        const key = req.session.encryptionKey;
        try {
            const stats = await fs.promises.stat(filePath);
            if (!stats.isDirectory()) {
                await fileManager.processUpload(path.dirname(filePath), key, true, req, res, next);
            } else {
                res.status(400);
            }
        } catch {
            res.status(404);
        }
    });

    router.use(filesRouter(getRelativeDirectory, getFilePath))

    return router;

}

module.exports = files;

