const express = require('express');
const fs = require('fs');
const createError = require('http-errors');
const readify = require('readify');
const url = require('url');

const accountManager = require('../accountManager');
const authorization = require('../authorization');
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
                        if (err) next(createError(404));
                        switch (parameter) {
                            case "authorize":
                                sharingManager.doAuthorization(key, fileName, req, res, function (token) {
                                    if (!token) return next(createError(403));
                                    res.send(token);
                                });
                                break;
                            case "download":
                                sharingManager.doAuthorization(key, fileName, req, res, function (token) {
                                    if (!token) return next(createError(403));
                                    fs.readFile(realFilePath, function (err, contents) {
                                        if (err) return next(createError(500));
                                        res.send(contents);
                                    });
                                });
                                break;
                            default:
                                if (stats.isDirectory()) {
                                    readify(realFilePath, {sort: 'type'}).then(function (files) {
                                        res.render('directory', {
                                            username: username,
                                            directory: {path: fileName, files: JSON.stringify(files.files)}
                                        });
                                    });
                                } else {
                                    res.render('fileViewer', {username: username, file: {path: fileName}});
                                }
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
