const express = require('express');
const router = express.Router();
const url = require('url');
const fs = require('fs');
const createError = require('http-errors');
const authorization = require('../authorization');
const accountManager = require('../accountManager');
const sharingManager = require('../sharingManager');
const strftime = require('strftime');
const webserver = require('../webServer');

router.get('/*', function(req, res, next) {
    let originalLink = decodeURIComponent(url.parse(req.url).pathname).substring(1).split("/");
    let fileName = originalLink[originalLink.length - 1];
    let key = originalLink[0];
    const download = req.url.endsWith("?download") === true;

    sharingManager.linkExists(key, fileName, function(exists) {
        if (exists && originalLink.length === 2) {
            if (!download) {
                accountManager.getInformation("username", "id", authorization.getTokenSubject(req), function (username) {
                    res.render('fileEditor', {
                        username: username,
                        file: {path: fileName}
                    });
                });
            } else {
                sharingManager.getLinkInformation("file", "key", key, function(filePath) {
                    sharingManager.getLinkInformation("owner", "key", key, function(owner) {
                        let realFilePath = sharingManager.getRealFilePath(filePath, owner);
                        fs.stat(realFilePath, function (err, stats) {
                            if (err == null) {
                                fs.readFile(realFilePath, function (err, contents) {
                                    if (err === null) {
                                        res.send(contents);
                                    } else {
                                        showError(createError(500), req, res);
                                    }
                                });
                            } else {
                                showError(createError(404), req, res);
                            }

                        });
                    });
                });
            }
        } else {
            showError(createError(404), req, res);
        }
    });



});

function showError(err, req, res) {
    let text = req.originalUrl + " (" + (err.status || 500) + " " + err.message + ")";
    console.log("[Webserver] [" + strftime("%H:%M:%S") + "] [" + (req.ip) + "]: " + req.method + " " + text);
    res.status(err.status || 500);
    accountManager.getInformation("username", "id", authorization.getTokenSubject(req), function(username) {
        res.render('error', {message: err.message, status: err.status, username: username});
    });
}

module.exports = router;
