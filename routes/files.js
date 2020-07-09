const express = require('express');
const fs = require("fs");
const mime = require('mime');
const os = require('os');
const path = require("path");
const readify = require('readify');
const stream = require('stream');
const url = require('url');

const accountManager = require('../accountManager');
const authorization = require('../authorization');
const fileManager = require('../fileManager');
const log = require("../core/log");
const preferences = require("../preferences");
const sharingManager = require('../sharingManager');

const router = express.Router();

router.delete("/*", function(req, res, next) {
    let filePath = decodeURIComponent(url.parse(req.url).pathname).substring(1);
    let owner = authorization.getID(req);
    if (req.baseUrl === "/public") owner = "public";
    fileManager.deleteFile("files", filePath, owner, function(result) {
        if (result) res.sendStatus(200);
        else res.sendStatus(404);
    });
});

router.get('/*', function(req, res, next) {
    let filePath = decodeURIComponent(url.parse(req.url).pathname).substring(1);
    let owner = authorization.getID(req);
    if (req.baseUrl === "/public") owner = "public";
    let realFilePath = path.join(preferences.get("files"), owner, "files", filePath);

    const parameter = Object.keys(req.query)[0];

    let key = owner !== "public" ? req.session.encryptionKey : undefined;
    let iv = owner !== "public" ? req.session.encryptionIV : undefined;


    if (req.baseUrl === "/logs") {
        filePath = path.join("logs", filePath);
        realFilePath = filePath;
        console.log(filePath);
        key = undefined;
        iv = undefined;
    }

    fs.stat(realFilePath, function(err, stats) {
        if (err !== null) return next();
        if (stats.isDirectory()) {
            switch(parameter) {
                case "download":
                    let directory = path.join(preferences.get("files"), owner, "files", filePath);
                    fileManager.createArchive(directory, key, iv, function(contentStream) {
                        if (filePath === "") filePath = path.basename(preferences.get("files"));
                        let fileName = path.basename(filePath + ".zip");
                        res.writeHead(200, {"Content-Type": "application/octet-stream", "Content-Disposition" : "attachment; filename=" + fileName});
                        contentStream.pipe(res);
                    });
                    break;
                case "sharing":
                    //TODO
                default:
                    fs.readdir(realFilePath, function (err, files) {
                        if (err !== null) return next();
                        accountManager.getInformation("username", "id", authorization.getID(req), function (username) {
                            readify(realFilePath, {sort: 'type'}).then(function(files) {
                                function render(decryptedFileNames) {
                                    if (decryptedFileNames) {
                                        decryptedFileNames = Buffer.from(JSON.stringify(decryptedFileNames)).toString("base64");
                                    }
                                    res.render('directory', {
                                        username: username,
                                        hostname: os.hostname(),
                                        directory: {files: Buffer.from(JSON.stringify(files.files)).toString("base64"),
                                                    decryptedFileNames: decryptedFileNames}
                                    });
                                }

                                if (!key || !iv) render();
                                else {
                                    const encryptionManager = require('../encryptionManager');
                                    encryptionManager.decryptFileNames(files.files.map(x => x.name), key, iv, function(decryptedFileNames) {
                                        render(decryptedFileNames);
                                    })

                                }



                            });
                        });
                    });
                    break;
            }
        } else {
            switch(parameter) {
                case "download":
                    fileManager.readFile(realFilePath, key, iv, function(contentStream) {
                        res.writeHead(200, {"Content-Type": "application/octet-stream", "Content-Disposition" : "attachment"});
                        contentStream.pipe(res);
                    });
                    break;
                case "sharing":
                    let filePathSplit = filePath.split("/");
                    let fileName = filePathSplit.pop();
                    let parent = filePathSplit.join("/");
                    if (!parent.startsWith("/")) parent = "/" + parent;

                    sharingManager.getLinkSummary(parent, fileName, owner, function(result) {
                        res.json(result);
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

router.post("/*", function(req, res, next) {
    let filePath = decodeURIComponent(url.parse(req.url).pathname).substring(1);
    let owner = authorization.getID(req);
    if (req.baseUrl === "/public") owner = "public";
    let realFilePath = path.join(preferences.get("files"), owner, "files", filePath);
    let filePathSplit = filePath.split("/");
    let fileName = filePathSplit.pop();
    let parent = filePathSplit.join("/");
    if (!parent.startsWith("/")) parent = "/" + parent;

    const parameter = Object.keys(req.query)[0];

    const key = owner !== "public" ? req.session.encryptionKey : undefined;
    const iv = owner !== "public" ? req.session.encryptionIV : undefined;

    fs.stat(realFilePath, function(err, stats) {
        if (err !== null && next !== undefined) return res.status(404);
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
                            if (result) res.status(200).send(id);
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
                        if (result) res.status(200).send(id);
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
    let owner = authorization.getID(req);
    if (req.baseUrl === "/public") owner = "public";
    let realFilePath = path.join(preferences.get("files"), owner, "files", filePath);
    let fileContents = req.files.data.data;

    const key = owner !== "public" ? req.session.encryptionKey : undefined;
    const iv = owner !== "public" ? req.session.encryptionIV : undefined;

    if (fileContents) {
        let contents = new stream.PassThrough();
        contents.end(fileContents);
        fileManager.writeFile(realFilePath, contents, key, iv, function(err) {
            if (err) res.status(500).send("Save failed");
            else res.send("Saved file");
        })
    } else {
        res.status(400).send("No contents");
    }
});

module.exports = router;
