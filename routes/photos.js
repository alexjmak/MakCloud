const express = require('express');
const fs = require("fs");
const mime = require('mime');
const createError = require('http-errors');
const os = require('os');
const path = require('path');
const readify = require('readify');
const url = require('url');

const accountManager = require('../accountManager');
const authorization = require('../authorization');
const fileManager = require("../fileManager");
const log = require('../core/log');
const preferences = require('../preferences');

const router = express.Router();

router.delete("/*", function(req, res, next) {
    let filePath = decodeURIComponent(url.parse(req.url).pathname).substring(1);
    fileManager.deleteFile("photos", filePath, authorization.getID(req), function(result) {
        if (result) res.sendStatus(200);
        else res.sendStatus(404);
    });
});

router.get("/", function(req, res, next) {
    let filePath = decodeURIComponent(url.parse(req.url).pathname).substring(1);
    let realFilePath = path.join(preferences.get("files"), authorization.getID(req), "photos", filePath);
    fs.readdir(realFilePath, function (err, files) {
        if (err !== null) return next();
        readify(realFilePath, {sort: 'date', order: 'desc'}).then(function (files) {
            let fileNames = [];
            for (let fileData in files.files) {
                if (!files.files.hasOwnProperty(fileData)) continue;
                fileData = files.files[fileData];
                fileNames.push(fileData.name)
            }
            let supportedTypes = ["apng", "bmp", "gif", "ico", "cur", "jpg", "jpeg", "pjpeg", "pjp", "png", "svg", "webp"];
            let photos = fileNames.filter(function(file) {
                let extension = file.split(".").pop().toLowerCase();
                return !file.startsWith(".") && supportedTypes.includes(extension);
            });
            accountManager.getInformation("username", "id", authorization.getID(req), function (username) {
                res.render('photos', {username: username, photos: photos});
            });
        });

    })

});

router.get("/*", function(req, res, next) {
    let filePath = decodeURIComponent(url.parse(req.url).pathname).substring(1);
    let realFilePath = path.join(preferences.get("files"), authorization.getID(req), "photos", filePath);
    let urlFilePath = path.join(req.baseUrl, filePath);

    const parameter = Object.keys(req.query)[0];

    const key = req.session.encryptionKey;
    const iv = req.session.encryptionIV;

    fs.stat(realFilePath, function(err, stats) {
        if (err !== null) return next();
        if (stats.isDirectory()) {
            next(createError(404));
        } else {
            switch(parameter) {
                case "download":
                    fileManager.readFile(realFilePath, key, iv, function(contentStream) {
                        res.writeHead(200, {"Content-Type": "application/octet-stream", "Content-Disposition" : "attachment"});
                        contentStream.pipe(res);
                    });
                    break;
                case "view":
                    accountManager.getInformation("username", "id", authorization.getID(req), function (username) {
                        res.render('fileViewer', {
                            username: username,
                            hostname: os.hostname()
                        });
                    });
                    break;
                default:
                    fileManager.readFile(realFilePath, key, iv, function(contentStream) {
                        res.writeHead(200, {"Content-Disposition" : "inline", "Content-Type": mime.getType(realFilePath)});
                        contentStream.pipe(res);
                    });
                    break;
            }
        }
    });
});

router.post("/", function (req, res, next) {
    let filePath = decodeURIComponent(url.parse(req.url).pathname).substring(1);
    let realFilePath = path.join(preferences.get("files"), authorization.getID(req), "photos", filePath);

    const parameter = Object.keys(req.query)[0];

    const key = req.session.encryptionKey;
    const iv = req.session.encryptionIV;

    fs.stat(realFilePath, function(err, stats) {
        if (err !== null && next !== undefined) return next();
        if (parameter === "upload") {
            if (stats.isDirectory()) {
                fileManager.processUpload(realFilePath, key, iv)(req, res, next);
            }
        }
    });


});

module.exports = router;
