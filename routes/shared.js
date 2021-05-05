const createError = require('http-errors');
const express = require('express');
const fs = require("fs");
const mkdirp = require("mkdirp");
const path = require("path");

const authorization = require("../authorization");
const fileManager = require('../fileManager');
const preferences = require("../core/preferences");
const log = require('../core/log');
const encryptionManager = require('../encryptionManager');
const sharingManager = require('../sharingManager');
const filesRouter = require("../core/routes/files");

const shared = function(getRelativeDirectory, getFilePath) {
    const getKey = req => req.path.split("/")[1];
    if (!getRelativeDirectory) getRelativeDirectory = async req => {
        const key = getKey(req);
        const filePath = await sharingManager.getLinkInformation("filePath", "key", key);

        return filePath;
    }
    if (!getFilePath) getFilePath = async req => {
        //const key = getKey(req);
        const filePath = await getRelativeDirectory(req);
        const urlPathSplit = req.path.split("/");
        urlPathSplit.splice(0, 2)
        console.log(path.join(filePath, urlPathSplit.join("/")));
        return path.join(filePath, urlPathSplit.join("/"));
    };

    const router = express.Router();

    router.delete("/*", function(req, res, next) {
        res.sendStatus(401);
    });

    router.use(async function(req, res, next) {
        const key = getKey(req);
        const currentID = authorization.getID(req);
        const status = await sharingManager.linkCheck(key);

        switch(status) {
            case 200:
                next();
                break;
            default:
                if (!currentID) {
                    res.redirect("/login" + authorization.getRedirectUrl(req));
                } else {
                    next(createError(status));
                }
                break;
        }
    });

    router.use(async function(req, res, next) {
        const key = getKey(req);
        const parameter = Object.keys(req.query)[0];

        switch(parameter) {
            case "view":
                next();
                break;
            case "download":
            default:
                await sharingManager.doAuthorization(key, req, res, next);
                break;
        }
    });

    router.use(filesRouter(getRelativeDirectory, getFilePath));

    return router;

}

module.exports = shared;

