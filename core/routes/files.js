const createError = require('http-errors');
const express = require('express');
const fs = require("fs");
const mkdirp = require("mkdirp");
const path = require("path");

const fileManager = require('../fileManager');
const preferences = require("../preferences");
const log = require('../log');

const files = function(getRelativeDirectory, getFilePath) {
    if (!getRelativeDirectory) getRelativeDirectory = req => preferences.get("files");
    if (!getFilePath) getFilePath = req => path.join(getRelativeDirectory(req), decodeURIComponent(req.path));

    const router = express.Router();

    router.use(async function (req, res, next) {
        let relativeDirectory = getRelativeDirectory(req);
        try {
            const stats = await fs.promises.stat(relativeDirectory);
            if (stats && stats.isDirectory()) await mkdirp(getRelativeDirectory(req));
            next();
        } catch (err) {
            log.write(err);
            next(createError(500));
        }
    });

    router.delete("/*", async function (req, res, next) {
        const relativeDirectory = getRelativeDirectory(req);
        const filePath = getFilePath(req);
        try {
            await fileManager.deleteFile(filePath, relativeDirectory);
            res.sendStatus(200);
        } catch {
            res.sendStatus(404);
        }
    });

    router.get('/*', async function (req, res, next) {
        const filePath = getFilePath(req);
        const fileName = path.basename(filePath);
        const relativeDirectory = getRelativeDirectory(req);
        const parameter = Object.keys(req.query)[0];

        let stats;
        try {
            stats = await fs.promises.stat(filePath);
        } catch (err) {
            return next(createError(404));
        }

        if (stats.isDirectory()) {
            switch (parameter) {
                case "download":
                    const archiveStream = await fileManager.createArchive(filePath);
                    fileManager.downloadFolder(archiveStream, (req.path !== "/") ? fileName : null, req, res, next)
                    break;
                default:
                    await fileManager.renderDirectory(filePath, relativeDirectory, req, res, next);
                    break;
            }
        } else {
            const fileStream = await fileManager.readFile(filePath);
            switch (parameter) {
                case "download":
                    fileManager.downloadFile(fileStream, fileName, req, res, next);
                    break;
                case "view":
                    await fileManager.renderFile(req, res, next);
                    break;
                default:
                    fileManager.inlineFile(fileStream, fileName, req, res, next);
                    break;
            }
        }
    });

    router.post("/*", async function (req, res, next) {
        const filePath = getFilePath(req);
        try {
            const stats = await fs.promises.stat(filePath);
            if (stats.isDirectory()) {
                await fileManager.processUpload(filePath, false, req, res, next);
            } else {
                res.status(400);
            }
        } catch {
            res.status(404);
        }
    });

    router.put("/*", async function (req, res, next) {
        const filePath = getFilePath(req);
        try {
            const stats = await fs.promises.stat(filePath);
            if (!stats.isDirectory()) {
                await fileManager.processUpload(path.dirname(filePath), true, req, res, next);
            } else {
                res.status(400);
            }
        } catch {
            res.status(404);
        }
    });
    return router;
}

module.exports = files;
