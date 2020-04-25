const express = require('express');
const fs = require("fs");
const os = require('os');
const path = require("path");
const readify = require('readify');
const url = require('url');

const accountManager = require('../accountManager');
const authorization = require('../authorization');
const fileManager = require('../fileManager');
const preferences = require("../preferences");
const sharingManager = require('../sharingManager');

const router = express.Router();

router.get('/*', function(req, res, next) {
    let filePath = decodeURIComponent(url.parse(req.url).pathname).substring(1);
    let realFilePath = path.join(preferences.get("files"), authorization.getLoginTokenAudience(req).toString(), "files", filePath);
    let urlFilePath = path.join(req.baseUrl, filePath);

    const parameter = Object.keys(req.query)[0];

    const key = req.session.encryptionKey;
    const iv = req.session.encryptionIV;

    fs.stat(realFilePath, function(err, stats) {
        if (err !== null) return next();
        if (stats.isDirectory()) {
            switch(parameter) {
                case "download":
                    fileManager.createFolderArchive("files", filePath, authorization.getLoginTokenAudience(req), function(archivePath) {
                        res.download(archivePath, path.basename(filePath + ".zip"), function() {
                            fs.unlinkSync(archivePath);
                        });
                    });
                    break;
                case "sharing":
                    //TODO
                default:
                    fs.readdir(realFilePath, function (err, files) {
                        if (err !== null) return next();
                        accountManager.getInformation("username", "id", authorization.getLoginTokenAudience(req), function (username) {
                            readify(realFilePath, {sort: 'type'}).then(function (files) {
                                res.render('directory', {
                                    username: username,
                                    hostname: os.hostname(),
                                    directory: {path: filePath, files: JSON.stringify(files.files)}
                                });
                            });
                        });
                    });
                    break;
            }
        } else {
            switch(parameter) {
                case "download":
                    fileManager.readFile(realFilePath, key, iv, function(contents) {
                        if (err === null) res.send(contents);
                        else next();
                    });
                    break;
                case "sharing":
                    let filePathSplit = filePath.split("/");
                    let fileName = filePathSplit.pop();
                    let parent = filePathSplit.join("/");
                    let owner = authorization.getLoginTokenAudience(req);
                    if (!parent.startsWith("/")) parent = "/" + parent;

                    sharingManager.getLinkSummary(parent, fileName, owner, function(result) {
                        res.json(result);
                    });
                    break;
                default:
                    accountManager.getInformation("username", "id", authorization.getLoginTokenAudience(req), function (username) {
                        fs.readFile(realFilePath, function (err, contents) {
                            res.render('fileViewer', {
                                username: username,
                                hostname: os.hostname(),
                                file: {path: urlFilePath}
                            });
                        });
                    });
                    break;
            }
        }
    });
});

router.post("/*", function(req, res, next) {
    let filePath = decodeURIComponent(url.parse(req.url).pathname).substring(1);
    let realFilePath = path.join(preferences.get("files"), authorization.getLoginTokenAudience(req).toString(), "files", filePath);
    let urlFilePath = path.join(req.baseUrl, filePath);
    let filePathSplit = filePath.split("/");
    let fileName = filePathSplit.pop();
    let parent = filePathSplit.join("/");
    let owner = authorization.getLoginTokenAudience(req);

    const parameter = Object.keys(req.query)[0];

    const key = req.session.encryptionKey;
    const iv = req.session.encryptionIV;

    fs.stat(realFilePath, function(err, stats) {
        if (err !== null && next !== undefined) return next();
        if (parameter === "upload") {
            if (stats.isDirectory()) {
                fileManager.writeFiles(req.files, realFilePath, key, iv, function(err) {
                    if (err !== undefined) return res.status(500).send("Upload failed");
                    if (Object.keys(req.files).length === 1) res.send("Uploaded file");
                    else res.send("Uploaded files");
                });
            }
        }

        if (parameter === "sharing") {
            let action = (req.body.action !== undefined) ? req.body.action : null;
            let expiration = (req.body.expiration !== undefined) ? req.body.expiration : null;
            let password = (req.body.password !== undefined) ? req.body.password : null;
            let access = (req.body.access !== undefined) ? req.body.access : null;
            let id = (req.body.id !== undefined) ? req.body.id : undefined;
            let username = (req.body.username !== undefined) ? req.body.username : undefined;

            switch (action) {
                case "create":
                    sharingManager.createLink(parent, fileName, owner, {expiration: expiration, password: password}, function(link) {
                        if (link !== false) res.status(201).send(link);
                        else res.sendStatus(409);
                    });
                    break;
                case "delete":
                    sharingManager.deleteLink(parent, fileName, owner, function(result) {
                        res.sendStatus(200)
                    });
                    break;
                case "addAccess":
                    let addLinkAccess = function(id) {
                        sharingManager.addLinkAccess(parent, fileName, owner, id, access, expiration,function(result) {
                            if (result) res.status(200).send(id.toString());
                            else res.sendStatus(400);
                        });
                    };
                    if (id === undefined && username !== undefined) {
                        accountManager.getInformation("id", "username", username, function(id) {
                            if (id === undefined) res.sendStatus(404);
                            else addLinkAccess(id);
                        });
                    } else addLinkAccess(id);
                    break;
                case "updateAccess":
                    sharingManager.updateLinkAccess(parent, fileName, owner, id, access, expiration, function(result) {
                        if (result) res.status(200).send(id.toString());
                        else res.sendStatus(400);
                    });
                    break;
                case "removeAccess":
                    sharingManager.removeLinkAccess(parent, fileName, owner, id, function(result) {
                        if (result) res.sendStatus(200);
                        else res.sendStatus(400);
                    });
                    break;
                case "setPassword":
                    if (!password) break;
                    sharingManager.updateLinkPassword(parent, fileName, owner, password, function(result) {
                        if (result) res.sendStatus(200);
                        else res.sendStatus(400);
                    });
                    break;
                case "deletePassword":
                    sharingManager.deleteLinkPassword(parent, fileName, owner, function(result) {
                        if (result) res.sendStatus(200);
                        else res.sendStatus(400);
                    });
                    break;
                default:
                    res.sendStatus(404);
                    break;
            }
        }
    });
});

router.put("/*", function(req, res, next) {
    let filePath = decodeURIComponent(url.parse(req.url).pathname).substring(1);
    let realFilePath = path.join(preferences.get("files"), authorization.getLoginTokenAudience(req).toString(), "files", filePath);
    let fileContents = req.files.data.data;
    const key = req.session.encryptionKey;
    const iv = req.session.encryptionIV;

    if (fileContents) {
        fileManager.writeFile(realFilePath, fileContents, key, iv, function(err) {
            if (err) res.status(500).send("Save failed");
            else res.send("Saved file");
        })
    } else {
        res.status(400).send("No contents");
    }
});


router.delete("/*", function(req, res, next) {
    let filePath = decodeURIComponent(url.parse(req.url).pathname).substring(1);
    fileManager.deleteFile("files", filePath, authorization.getLoginTokenAudience(req), function(result) {
        if (result) res.sendStatus(200);
        else res.sendStatus(404);
    });
});

module.exports = router;
