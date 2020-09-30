const createError = require('http-errors');
const express = require('express');
const fs = require("fs");
const path = require("path");
const readify = require('readify');

const authorization = require('../authorization');
const encryptionManager = require('../encryptionManager');
const log = require("../core/log");
const preferences = require("../preferences");
const render = require("../core/render");
const filesRouter = require('../core/routes/files');

let photos = function(getRelativeDirectory, getFilePath, encryption) {
    if (!getRelativeDirectory) getRelativeDirectory = req => path.join(preferences.get("files"), authorization.getID(req), "photos");
    if (!getFilePath) getFilePath = req => path.join(getRelativeDirectory(req), decodeURIComponent(req.path));

    const router = express.Router();

    router.get('/*', function(req, res, next) {
        const filePath = getFilePath(req);
        const key = encryption ? req.session.encryptionKey : null;
        const parameter = Object.keys(req.query)[0];

        fs.stat(filePath, function(err, stats) {
            if (stats && stats.isDirectory()) {
                switch(parameter) {
                    case "download":
                        next();
                        break;
                    default:
                        readify(filePath, {sort: 'date', order: 'desc'}).then(function (data) {
                            let fileNames = [];

                            encryptionManager.decryptReadifyNames(data, key, function(data) {
                                let supportedTypes = ["apng", "bmp", "gif", "ico", "cur", "jpg", "jpeg", "pjpeg", "pjp", "png", "svg", "webp"];
                                for (let fileData of data.files) { // todo replace for loop
                                    let name = fileData.name;
                                    let decrypted_name = fileData.decrypted_name;
                                    let displayName = decrypted_name ? decrypted_name : name;
                                    let extension = displayName.split(".").pop().toLowerCase();
                                    if (!displayName.startsWith(".") && supportedTypes.includes(extension)) {
                                        fileNames.push(name)
                                    }
                                }
                                render("photos", {photos: fileNames}, req, res, next);
                            });
                        }).catch(function (err) {
                            log.write(err);
                            next(createError(500))
                        });
                        break;
                }
            } else {
                next();
            }
        });

    });

    router.use(filesRouter(getRelativeDirectory, getFilePath, encryption));


    return router;
}


module.exports = photos;
