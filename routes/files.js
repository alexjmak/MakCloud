const express = require('express');
const router = express.Router();
const path = require("path");
const fs = require("fs");
const os = require('os');
const url = require('url');
const readify = require('readify');
const accountManager = require('../accountManager');
const sharingManager = require('../sharingManager');
const authorization = require('../authorization');
const preferences = require("../preferences");

router.get('/*', function(req, res, next) {
    let filePath = decodeURIComponent(url.parse(req.url).pathname).substring(1);
    let realFilePath = [preferences.get()["files"], authorization.getLoginTokenAudience(req).toString(), filePath].join("/");
    let urlFilePath = [req.baseUrl, filePath].join("/");

    const sharing = req.url.endsWith("?sharing") === true;


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
                            accountManager.getInformation("username", "id", authorization.getLoginTokenAudience(req), function (username) {
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
                    if (sharing) {
                        let filePathSplit = filePath.split("/");
                        let fileName = filePathSplit.pop();
                        let parent = filePathSplit.join("/");
                        let owner = authorization.getLoginTokenAudience(req);
                        if (!parent.startsWith("/")) parent = "/" + parent;

                        sharingManager.getLinkSummary(parent, fileName, owner, function(result) {
                            res.json(result);
                        })
                    } else {
                        accountManager.getInformation("username", "id", authorization.getLoginTokenAudience(req), function (username) {
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

            }
        } else {
            if (filePath === "/") {
                fs.mkdir(preferences.get()["files"], function() {
                    fs.mkdir(path.join(preferences.get()["files"], authorization.getLoginTokenAudience(req).toString()), function() {res.redirect('back')});
                });

            } else next();
        }
    });
});

router.post("/*", function(req, res, next) {
    let filePath = decodeURIComponent(url.parse(req.url).pathname);
    let filePathSplit = filePath.split("/");
    let fileName = filePathSplit.pop();
    let parent = filePathSplit.join("/");
    let owner = authorization.getLoginTokenAudience(req);

    const sharing = req.url.endsWith("?sharing") === true;

    if (sharing) {
        let action = (req.body.action !== undefined) ? req.body.action : null;
        let expiration = (req.body.expiration !== undefined) ? req.body.expiration : null;
        let password = (req.body.password !== undefined) ? req.body.password : null;
        let access = (req.body.access !== undefined) ? req.body.access : null;
        let id = (req.body.id !== undefined) ? req.body.id : undefined;
        let username = (req.body.username !== undefined) ? req.body.username : undefined;

        //let users = JSON.parse(req.body.users);

        if (action === "create") {
            sharingManager.createLink(parent, fileName, owner, {expiration: expiration, password: password}, function(link) {
                sharingManager.getLinkKey(parent, fileName, owner, function(key) {
                    if (link !== false) res.status(201).send(link);
                    else res.sendStatus(409);
                    /*
                    sharingManager.addLinkAccess(key, undefined, function(result) {
                        if (link !== false) res.status(201).send(link);
                        else res.sendStatus(409);
                   });
                   */

                });
            });
        } else if (action === "delete") {
            sharingManager.deleteLink(parent, fileName, owner, function(result) {
                res.sendStatus(200)
            })
        } else if (action === "addAccess") {
            let addLinkAccess = function(id) {
                sharingManager.addLinkAccess(parent, fileName, owner, id, access, expiration,function(result) {
                    if (result) res.sendStatus(200);
                    else res.sendStatus(400);
                })
            };
            if (id === undefined && username !== undefined) {
                accountManager.getInformation("id", "username", username, function(id) {
                    if (id === undefined) res.sendStatus(404);
                    else addLinkAccess(id);
                })
            } else {
                addLinkAccess(id);
            }
        } else if (action === "removeAccess")  {
            sharingManager.removeLinkAccess(parent, fileName, owner, id, function(result) {
                if (result) res.sendStatus(200);
                else res.sendStatus(400);
            })
        } else if (action === "setPassword") {
            if (password !== null) {
                sharingManager.updateLinkPassword(parent, fileName, owner, password, function(result) {
                    if (result) res.sendStatus(200);
                    else res.sendStatus(400);
                })
            }
        } else if (action === "deletePassword") {
            sharingManager.deleteLinkPassword(parent, fileName, owner, function(result) {
                if (result) res.sendStatus(200);
                else res.sendStatus(400);
            })
        } else {
            res.sendStatus(404);
        }
    }
});

router.delete("/*", function(req, res, next) {
    let filePath = decodeURIComponent(url.parse(req.url).pathname).substring(1);
    let realFilePath = [preferences.get()["files"], authorization.getLoginTokenAudience(req).toString(), filePath].join("/");
    let deleteFilePath = [preferences.get()["files"], authorization.getLoginTokenAudience(req).toString(), ".recycle", filePath].join("/");
    let deleteFilePathParent = deleteFilePath.split("/");
    deleteFilePathParent.pop();
    deleteFilePathParent = deleteFilePathParent.join("/");

    if (fs.existsSync(realFilePath)) {
        fs.mkdir(deleteFilePathParent, {recursive: true }, function(err) {
            if (err) {
                console.log(err);
                res.sendStatus(404)
            } else {
                fs.rename(realFilePath, deleteFilePath, function (err) {
                    if (err) {
                        console.log(err);
                        res.sendStatus(404)
                    } else {
                        res.sendStatus(200)
                    }
                });
            }

        });
    } else {
        res.sendStatus(404)
    }

});
module.exports = router;
