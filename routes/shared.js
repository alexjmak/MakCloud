const express = require('express');
const fs = require('fs');
const mime = require('mime');
const createError = require('http-errors');
const url = require('url');

const accountManager = require('../accountManager');
const authorization = require('../authorization');
const fileManager = require('../fileManager');
const sharingManager = require('../sharingManager');

const router = express.Router();

router.get('/*', function(req, res, next) {
    let link = decodeURIComponent(url.parse(req.url).pathname).substring(1);
    let key = link.substring(0, link.indexOf("/"));
    let fileName = link.substring(link.indexOf("/") + 1, link.length);

    const parameter = Object.keys(req.query)[0];

    sharingManager.linkCheck(key, fileName, authorization.getLoginTokenAudience(req),function(exists) {
        if (exists === true) {
            sharingManager.getRealFilePathLink(key, fileName, function (realFilePath) {
                accountManager.getInformation("username", "id", authorization.getLoginTokenAudience(req), function (username) {
                    fs.stat(realFilePath, function (err, stats) {
                        if (err || !stats) return next(createError(404));
                        switch (parameter) {
                            case "download":
                                sharingManager.doAuthorization(key, fileName, req, res, function (token) {
                                    if (!token) {
                                        if (req.method === "HEAD") next(createError(403));
                                        else res.redirect(req.originalUrl + "?view");
                                    } else {
                                        if (req.method === "HEAD") return res.sendStatus(200);
                                        else {
                                            fileManager.readFile(realFilePath, null, null, function (contentStream) {
                                                res.writeHead(200, {
                                                    "Content-Type": "application/octet-stream",
                                                    "Content-Disposition": "attachment"
                                                });
                                                contentStream.pipe(res);
                                            });
                                        }
                                    }
                                });
                                break;
                            case "view":
                                res.render('fileViewer', {username: username, file: {path: fileName}})
                                break;
                            default:
                                sharingManager.doAuthorization(key, fileName, req, res, function (token) {
                                    if (!token) {
                                        if (req.method === "HEAD") next(createError(403));
                                        else res.redirect(fileName + "?view");
                                    } else {
                                        if (req.method === "HEAD") return res.sendStatus(200);
                                        else {
                                            fileManager.readFile(realFilePath, null, null, function(contentStream) {
                                                res.writeHead(200, {
                                                    "Content-Disposition": "inline",
                                                    "Content-Type": mime.getType(realFilePath)
                                                });
                                                contentStream.pipe(res);
                                            });
                                        }
                                    }
                                });
                                break;
                        }
                    });
                });
            });
        } else {
            if (exists === false) res.redirect("/login?redirect=shared/" + key + "/" + fileName);
            else next(createError(exists));
        }
    });
});

module.exports = router;
