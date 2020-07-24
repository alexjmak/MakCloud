const createError = require('http-errors');
const express = require('express');
const fs = require("fs");
const mkdirp = require("mkdirp");
const path = require("path");
const stream = require('stream');
const url = require('url');

const authorization = require('../authorization');
const fileManager = require('../fileManager');
const preferences = require("../preferences");
const sharingManager = require('../sharingManager');

let files = function(getRelativeDirectory, encryption) {
    if (!getRelativeDirectory) getRelativeDirectory = (req) => path.join(preferences.get("files"), authorization.getID(req), "files");

    const router = express.Router();

    router.use(function(req, res, next) {
        mkdirp(getRelativeDirectory(req)).then(function() {
            next();
        }).catch(function(err) {
            log.write(err);
            next(createError(500));
        });
    });

    router.delete("/*", function(req, res, next) {
        let urlPath = getUrlPath(req);
        let relativeDirectory = getRelativeDirectory(req);
        let filePath = path.join(relativeDirectory, urlPath);
        fileManager.deleteFile(filePath, relativeDirectory, function(result) {
            if (result) res.sendStatus(200);
            else res.sendStatus(404);
        });
    });

    router.get('/*', function(req, res, next) {
        const urlPath = getUrlPath(req);
        const relativeDirectory = getRelativeDirectory(req);
        const filePath = path.join(relativeDirectory, urlPath);
        const key = encryption ? req.session.encryptionKey : null;
        const parameter = Object.keys(req.query)[0];

        fs.stat(filePath, function(err, stats) {
            if (err !== null) return next();
            if (stats.isDirectory()) {
                switch(parameter) {
                    case "download":
                        let name = filePath.trim() === "" ? "MakCloud" : path.basename(filePath);
                        name += "-" + (Date.now() / 1000);
                        fileManager.downloadFolder(filePath, name, key, req, res, next)
                        break;
                    case "sharing":
                    //TODO folder sharing
                    default:
                        fileManager.renderDirectory(filePath, relativeDirectory, key, req, res, next);
                        break;
                }
            } else {
                switch(parameter) {
                    case "download":
                        fileManager.downloadFile(filePath, key, req, res, next);
                        break;
                    case "sharing":
                        let filePathSplit = filePath.split("/");
                        let fileName = filePathSplit.pop();
                        let parent = filePathSplit.join("/");
                        if (!parent.startsWith("/")) parent = "/" + parent;
                        let owner = authorization.getID(req);

                        sharingManager.getLinkSummary(parent, fileName, owner, function(result) {
                            res.json(result);
                        });
                        break;
                    case "view":
                        fileManager.renderFile(filePath, key, req, res, next);
                        break;
                    default:
                        fileManager.inlineFile(filePath, key, req, res, next);
                        break;
                }
            }
        });
    });

    router.post("/*", function(req, res, next) {
        const urlPath = getUrlPath(req);
        const relativeDirectory = getRelativeDirectory(req);
        const filePath = path.join(relativeDirectory, urlPath);
        const key = encryption ? req.session.encryptionKey : null;
        const parameter = Object.keys(req.query)[0];

        fs.stat(filePath, function(err, stats) {
            if (err !== null && next !== undefined) return res.status(404);
            if (parameter === "upload") {
                if (stats.isDirectory()) {
                    fileManager.processUpload(filePath, key)(req, res, next);
                }
            }

            if (parameter === "sharing") {
                sharingManager.handle(req, res, next);
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

        if (fileContents) {
            let contents = new stream.PassThrough();
            contents.end(fileContents);
            fileManager.writeFile(realFilePath, contents, key, function(err) {
                if (err) res.status(500).send("Save failed");
                else res.send("Saved file");
            })
        } else {
            res.status(400).send("No contents");
        }
    });

    function getUrlPath(req) {
        return decodeURIComponent(req.path).substring(1);
    }

    return router;
}


module.exports = files;
