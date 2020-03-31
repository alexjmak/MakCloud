const express = require('express');
const router = express.Router();
const createError = require('http-errors');
const fs = require("fs");
const os = require('os');
const path = require('path');
const url = require('url');
const accountManager = require('../accountManager');
const authorization = require('../authorization');
const fileManager = require("../fileManager");
const preferences = require('../preferences');

router.get("/", function(req, res, next) {
    let filePath = decodeURIComponent(url.parse(req.url).pathname).substring(1);
    let realFilePath = path.join(preferences.get()["files"], authorization.getLoginTokenAudience(req).toString(), "photos", filePath);
    fs.readdir(realFilePath, function(err, files) {
        if (err === null) {
            let supportedTypes = ["apng", "bmp", "gif", "ico", "cur", "jpg", "jpeg", "pjpeg", "pjp", "png", "svg", "webp"];
            let photos = files.filter(function(file) {
                let extension = file.split(".").pop().toLowerCase();
                return !file.startsWith(".") && supportedTypes.includes(extension);
            });
            accountManager.getInformation("username", "id", authorization.getLoginTokenAudience(req), function (username) {
                res.render('photos', {username: username, photos: photos});
            });
        }
    });
});

router.get("/*", function(req, res, next) {
    let filePath = decodeURIComponent(url.parse(req.url).pathname).substring(1);
    let realFilePath = path.join(preferences.get()["files"], authorization.getLoginTokenAudience(req).toString(), "photos", filePath);
    let urlFilePath = path.join(req.baseUrl, filePath);

    const parameter = Object.keys(req.query)[0];

    fs.stat(realFilePath, function(err, stats) {
        if (err !== null) return next();
        if (stats.isDirectory()) {
            next(createError(404));
        } else {
            if (parameter === "download") {
                fs.readFile(realFilePath, function (err, contents) {
                    if (err === null) {
                        res.send(contents);
                    } else next();
                });
            } else {
                accountManager.getInformation("username", "id", authorization.getLoginTokenAudience(req), function (username) {
                    res.render('fileViewer', {
                        username: username,
                        hostname: os.hostname(),
                        file: {path: urlFilePath}
                    });
                });
            }
        }
    });
});

router.post("/", function (req, res, next) {
    let filePath = decodeURIComponent(url.parse(req.url).pathname).substring(1);
    let realFilePath = path.join(preferences.get()["files"], authorization.getLoginTokenAudience(req).toString(), "photos", filePath);

    const parameter = Object.keys(req.query)[0];

    fs.stat(realFilePath, function(err, stats) {
        if (err !== null && next !== undefined) return next();
        if (parameter === "upload") {
            if (stats.isDirectory()) {
                fileManager.uploadFiles(req.files, realFilePath, function (err) {
                    if (err !== undefined) return res.status(500).send("Upload failed");
                    if (Object.keys(req.files).length === 1) res.send("Uploaded photo");
                    else res.send("Uploaded photos");
                });
            }
        }
    });


});

router.delete("/*", function(req, res, next) {
    let filePath = decodeURIComponent(url.parse(req.url).pathname).substring(1);
    fileManager.deleteFile("photos", filePath, authorization.getLoginTokenAudience(req), function(result) {
        if (result) res.sendStatus(200);
        else res.sendStatus(404);
    });
});

module.exports = router;
