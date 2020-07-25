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
        const parameter = Object.keys(req.query)[0];

        fs.stat(filePath, function(err, stats) {
            if (err !== null) return next();
            if (stats.isDirectory()) {
                switch(parameter) {
                    case "download":
                        fileManager.downloadFolder(filePath, req, res, next)
                        break;
                    default:
                        fileManager.renderDirectory(filePath, relativeDirectory, req, res, next);
                        break;
                }
            } else {
                switch(parameter) {
                    case "download":
                        fileManager.downloadFile(filePath, req, res, next);
                        break;
                    case "view":
                        fileManager.renderFile(filePath, req, res, next);
                        break;
                    default:
                        fileManager.inlineFile(filePath, req, res, next);
                        break;
                }
            }
        });
    });

    router.post("/*", function(req, res, next) {
        const urlPath = getUrlPath(req);
        const relativeDirectory = getRelativeDirectory(req);
        const filePath = path.join(relativeDirectory, urlPath);
        const parameter = Object.keys(req.query)[0];

        fs.stat(filePath, function(err, stats) {
            if (err !== null && next !== undefined) return res.status(404);
            if (parameter === "upload") {
                if (stats.isDirectory()) {
                    fileManager.processUpload(filePath)(req, res, next);
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

        if (fileContents) {
            let contents = new stream.PassThrough();
            contents.end(fileContents);
            fileManager.writeFile(realFilePath, contents, function(err) {
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
