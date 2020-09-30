const createError = require('http-errors');
const express = require('express');
const fs = require("fs");
const path = require("path");
const readify = require('readify');

const authorization = require('../authorization');
const sharingManager = require('../sharingManager');
const log = require("../core/log");
const preferences = require("../preferences");
const render = require("../core/render");
const filesRouter = require('./files');

let shared = function() {
    let getRelativeDirectory = (req) => {
        return new Promise((resolve, reject) => {
            const key = getKey(req);
            sharingManager.getLinkInformation("filePath", "key", key, function(filePath) {
                if (filePath) {
                    resolve(filePath);
                } else {
                    reject(null);
                }
            })
        })
    }
    let getFilePath = (req, relativeDirectory) => {
        let urlPathSplit = req.path.split("/");
        urlPathSplit.splice(0, 2)
        return path.join(relativeDirectory, urlPathSplit.join("/"));
    }
    let encryption = false

    function getKey(req) {
        return req.path.split("/")[1];
    }

    const router = express.Router();

    router.delete("/*", function(req, res, next) {
        res.sendStatus(401);
    });

    router.use(function(req, res, next) {
        const key = getKey(req);
        const parameter = Object.keys(req.query)[0];

        sharingManager.linkCheck(key, authorization.getID(req), function(exists) {
            if (exists === true) {
                switch (parameter) {
                    case "view":
                        next();
                        break;
                    case "download":
                    default:
                        sharingManager.doAuthorization(key, req, res, function (token) {
                            if (!token) {
                                if (req.method === "HEAD") next(createError(403));
                                else res.redirect(req.baseUrl + req.path + "?view");
                            } else {
                                if (req.method === "HEAD") return res.sendStatus(200);
                                else {
                                    next();
                                }
                            }
                        });
                        break;
                }
            } else if (exists === false) {
                res.redirect("/login" + authorization.getRedirectUrl(req));
            } else {
                next(createError(exists));
            }
        });

    })


    router.use(function(req, res, next) {
        getRelativeDirectory(req)
            .then((relativeDirectory) => {
                const filePath = getFilePath(req, relativeDirectory);
                filesRouter(() => relativeDirectory, () => filePath, encryption)(req, res, next)
            })
            .catch(() => {
                next(createError(404));
            });
    });

    return router;
}


module.exports = shared;
