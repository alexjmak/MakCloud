const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const Mbox = require('node-mbox');
const md5 = require('md5');
const os = require('os');
const path = require('path');
const stream = require('stream');
const simpleParser = require('mailparser').simpleParser;

const accountManager = require('../accountManager');
const authorization = require('../authorization');
const fileManager = require("../fileManager");
const log = require('../core/log');
const preferences = require('../preferences');
const render = require('../core/render');

const router = express.Router();

router.get("/", function(req, res, next) {
    accountManager.getInformation("username", "id", authorization.getID(req), function (username) {
        render('mail', null, req, res, next);
    });
});

router.get("/trash", function(req, res, next) {
    accountManager.getInformation("username", "id", authorization.getID(req), function (username) {
        render('mail', null, req, res, next);
    });
});

router.post("/", function(req, res, next) {
    let files = req.files;
    if (!files || Object.keys(files).length === 0) {
        return res.sendStatus(400);
    }

    for (let file in files) {
        if (!files.hasOwnProperty(file)) continue;
        file = files[file];
        if (file.name.endsWith(".mbox")) {
            const mbox = new Mbox(file.data);
            let messages = []
            mbox.on('message', function(buffer) {
                if (buffer.toString().split("\n")[2].trim() === "X-Gmail-Labels: Chat") return;
                messages.push(buffer);
            });

            let concurrentFiles = 20;
            let writeFile = function(i) {
                let buffer = messages[i];
                let filePath = path.join(preferences.get("files"), authorization.getID(req), "mail", md5(buffer) + ".eml");
                let contentStream = new stream.PassThrough();
                contentStream.end(buffer);
                fileManager.writeFile(filePath, contentStream, req.session.encryptionKey, req.session.encryptionIV, function(err) {
                    if (i + concurrentFiles < messages.length) {
                        writeFile(i + concurrentFiles);
                    } else if (i === messages.length - 1) {
                        log.write("Finished processing mail");
                    }
                });
            }

            mbox.on("end", function() {
                for (let i = 0; i < concurrentFiles; i++) {
                    writeFile(i);
                }
            })


        } else {
            log.write(`${file.name} isn't a mbox file`);
        }




    }

});

module.exports = router;