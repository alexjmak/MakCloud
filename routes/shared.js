const express = require('express');
const router = express.Router();
const url = require('url');
const fs = require('fs');
const readify = require('readify');
const createError = require('http-errors');
const authorization = require('../authorization');
const accountManager = require('../accountManager');
const sharingManager = require('../sharingManager');
const strftime = require('strftime');

router.get('/*', function(req, res, next) {
    let link = decodeURIComponent(url.parse(req.url).pathname).substring(1);
    let key = link.substring(0, link.indexOf("/"));
    let fileName = link.substring(link.indexOf("/") + 1, link.length);

    const download = req.url.endsWith("?download") === true;
    const authorize = req.url.endsWith("?authorize") === true;

    sharingManager.linkCheck(key, fileName, authorization.getLoginTokenAudience(req),function(exists) {
        if (exists === true) {
            sharingManager.getRealFilePathLink(key, fileName,  function(realFilePath) {
                accountManager.getInformation("username", "id", authorization.getLoginTokenAudience(req), function (username) {
                    fs.stat(realFilePath, function (err, stats) {
                        if (err === null) {
                            if (!download && !authorize) {
                                if (stats.isDirectory()) {
                                    readify(realFilePath, {sort: 'type'}).then(function (files) {
                                        res.render('directory', {
                                            username: username,
                                            directory: {path: fileName, files: JSON.stringify(files.files)}
                                        });
                                    });
                                } else {
                                    res.render('fileEditor', {
                                        username: username,
                                        file: {path: fileName},
                                    });
                                }
                            } else {
                                sharingManager.doAuthorization(key, fileName, req, res,function(token) {
                                    if (token !== false) {
                                        if (download) {
                                            fs.readFile(realFilePath, function (err, contents) {
                                                if (err === null) {
                                                    res.send(contents);
                                                } else {
                                                    showError(createError(500), req, res);
                                                }
                                            });
                                        } else {
                                            res.send(token);
                                        }
                                    } else {
                                        showError(createError(403), req, res);
                                    }
                                });
                            }
                        } else {
                            showError(createError(404), req, res);
                        }
                    });
                });
            });
        } else {
            if (exists === false) res.redirect("/login?redirect=shared/" + key + "/" + fileName);
            else showError(createError(exists), req, res);
        }
    });
});

function showError(err, req, res) {
    let text = req.originalUrl + " (" + (err.status || 500) + " " + err.message + ")";
    console.log("[Webserver] [" + strftime("%H:%M:%S") + "] [" + (req.ip) + "]: " + req.method + " " + text);
    res.status(err.status || 500);
    accountManager.getInformation("username", "id", authorization.getLoginTokenAudience(req), function(username) {
        res.render('error', {message: err.message, status: err.status, username: username});
    });
}

module.exports = router;
