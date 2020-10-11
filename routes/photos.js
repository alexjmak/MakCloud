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
const filesRouter = require("./files");
const render = require("../core/render");
const readify = require("readify")


const router = express.Router();

const getRelativeDirectory = (req) => path.join(preferences.get("files"), authorization.getID(req), "photos");
const getFilePath = req => path.join(getRelativeDirectory(req), decodeURIComponent(req.path));

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


router.get('/*', async function(req, res, next) {
    const filePath = getFilePath(req);
    const key = req.session.encryptionKey;
    const parameter = Object.keys(req.query)[0];

    let stats;
    try {
        stats = await fs.promises.stat(filePath);
    } catch {
        return next();
    }
    if (stats && stats.isDirectory()) {
        switch(parameter) {
            case "download":
                next();
                break;
            default:
                const data = await readify(filePath, {sort: 'date', order: 'desc'})
                let fileNames = [];
                const decryptedData = await encryptionManager.decryptReadifyNames(data, key);
                const supportedTypes = ["apng", "bmp", "gif", "ico", "cur", "jpg", "jpeg", "pjpeg", "pjp", "png", "svg", "webp"];
                for (const fileData of decryptedData.files) { // todo replace for loop
                    let name = fileData.name;
                    let decrypted_name = fileData.decrypted_name;
                    let displayName = decrypted_name ? decrypted_name : name;
                    let extension = displayName.split(".").pop().toLowerCase();
                    if (!displayName.startsWith(".") && supportedTypes.includes(extension)) {
                        fileNames.push(name)
                    }
                }
                await render("photos", {photos: fileNames}, req, res, next);
                break;
        }
    } else {
        next();
    }
});

router.use(filesRouter(getRelativeDirectory, getFilePath))

module.exports = router;
