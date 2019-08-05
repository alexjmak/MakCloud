const express = require('express');
const router = express.Router();
const path = require("path");
const fs = require("fs");
const os = require('os');
const url = require('url');
const readify = require('readify');
const accountManager = require('../accountManager');
const authorization = require('../authorization');

const DEFAULT_FILES_LOCATION = "./files";

router.get('/*', function(req, res, next) {
    let filePath = decodeURIComponent(url.parse(req.url).pathname);
    let realFilePath = path.join(DEFAULT_FILES_LOCATION, authorization.getTokenSubject(req).toString(), filePath);
    let urlFilePath = path.join(req.baseUrl, filePath);

    fs.stat(realFilePath, function(err, stats) {
        if (err == null) {
            if (Object.keys(req.query)[0] === "download") {
                if (stats.isDirectory()) {
                    res.redirect(urlFilePath);
                } else {
                    fs.readFile(realFilePath, function (err, contents) {
                        if (err === null) {
                            res.send(contents);
                        } else next();

                    });
                }
            } else {
                if (stats.isDirectory()) {
                    fs.readdir(realFilePath, function(err, files) {
                        if (err === null) {
                            accountManager.getInformation("username", "id", authorization.getTokenSubject(req), function (username) {
                                readify(realFilePath, {sort: 'type'}).then(function(files) {
                                    res.render('directory', {
                                        username: username,
                                        hostname: os.hostname(),
                                        directory: {path: filePath, files: JSON.stringify(files.files)}
                                    });
                                });
                            });
                        } else next();

                    });
                } else {
                    accountManager.getInformation("username", "id", authorization.getTokenSubject(req), function (username) {
                        fs.readFile(realFilePath, function (err, contents) {
                            res.render('fileEditor', {
                                username: username,
                                hostname: os.hostname(),
                                file: {path: urlFilePath}
                            });
                        });
                    });
                }

            }
        } else {
            if (filePath === "/") {
                fs.mkdir(DEFAULT_FILES_LOCATION, function() {
                    fs.mkdir(path.join(DEFAULT_FILES_LOCATION, authorization.getTokenSubject(req).toString()), function() {res.redirect('back')});
                });

            } else next();
        }
    });

});

module.exports = router;
