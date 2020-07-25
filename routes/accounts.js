const createError = require('http-errors');
const crypto = require('crypto');
const express = require('express');
const os = require('os');

const accountManager = require('../accountManager');
const authorization = require('../authorization');
const render = require('../core/render');
const accounts = require("../core/routes/accounts");

const router = express.Router();


router.patch('/encrypted', function(req, res, next) {
    let id = req.body.id;
    let encrypted = req.body.encrypted;
    let password = req.body.password;

    if (!hasFields(res, id, encrypted, password)) return;

    checkPrivilege(req, res, id, function(result) {
        if (!result) return;
        authorization.checkPassword(id, password, function(result) {
            if (result !== 1) {
                if (encrypted) {
                    accountManager.encryptAccount(id, password,function (result, decryptedKey) {
                        if (result) {
                            if (id === authorization.getID(req)) {
                                req.session.encryptionKey = decryptedKey;
                            }
                            res.send("Encrypted account");
                        } else {
                            res.status(500).send("Encryption Error");
                        }
                    });
                } else {
                    accountManager.decryptAccount(id, password, function (result) {
                        if (result) {
                            if (id === authorization.getID(req)) {
                                req.session.encryptionKey = undefined;
                                res.clearCookie("encryptionSession");
                            }
                            res.send("Decrypted account");
                        } else {
                            res.status(500).send("Decryption Error");
                        }
                    });
                }
            } else {
                res.status(403).send("Incorrect Password");
            }
        })

    });
});

router.patch('/password', function(req, res, next) {
    let id = req.body.id;
    let new_password = req.body.password;
    let old_password = req.body.old_password;

    if (!hasFields(res, id, new_password)) return;

    let changePassword = function() {
        checkPrivilege(req, res, id, function(result) {
            if (!result) return;
            accountManager.updatePassword(id, new_password, old_password, function (result) {
                if (result) {
                    res.send("Updated account information")
                } else {
                    res.status(401).send("Failed to update password");
                }
            });
        });
    }

    accountManager.getInformation("encryptKey", "id", id, function(encrypted) {
        if (encrypted) {
            if (!hasFields(res, old_password)) return;
            authorization.checkPassword(id, old_password, function(result) {
                if (result !== 1) {
                    changePassword();
                } else {
                    res.status(403).send("Incorrect Password");
                }

            })
        } else {
            changePassword();
        }

    })

});



router.put('/new', function(req, res) {
    let username = req.body.username;
    let password = req.body.password;
    let privilege = req.body.privilege;
    let encrypted = req.body.encrypted;

    if (!hasFields(res, username, password)) return;
    if (username === "admin")  return res.status(401).send("Insufficient privilege level");

    checkPrivilege(req, res, undefined, function(result) {
        if (!result) return;
        if (encrypted === undefined) encrypted = false;
        if (privilege === undefined) privilege = 0;
        else if (privilege > 100 || privilege.toString().toUpperCase() === "ADMIN") privilege = 100;
        encrypted = encrypted === "true" || encrypted === true;
        checkChangePrivilege(req, res, privilege, function(result) {
            if(!result) return;
            accountManager.newAccount(username, password, privilege, encrypted, function (result) {
                if (result) {
                    res.send("Created account: " + username);
                } else {
                    res.status(409).send("Account already exists");
                }
            });
        });
    });
});

router.use(accounts)

function checkChangePrivilege(req, res, new_privilege, next) {
    if (isNaN(new_privilege) || new_privilege < 0) {
        res.status(401).send("Privilege level must be a positive number");
        return next(false);
    }

    accountManager.getInformation("privilege", "id", authorization.getID(req), function(currentPrivilege) {
        accountManager.getInformation("username", "id", authorization.getID(req), function (currentUsername) {
            if (currentUsername !== "admin" && currentPrivilege <= new_privilege) {
                res.status(401).send("Insufficient privilege level");
                return next(false);
            }
            return next(true);
        });
    });
}

function checkPrivilege(req, res, accountID, next) {
    let currentID = authorization.getID(req);
    accountManager.getInformation("username", "id", currentID, function(currentUsername) {
        accountManager.getInformation("username", "id", accountID, function(accountUsername) {
            accountManager.getInformation("privilege", "id", currentID, function(currentPrivilege) {
                accountManager.getInformation("privilege", "id", accountID, function (accountPrivilege) {
                    if (currentID === accountID) return next(true);
                    if (currentUsername === "admin") return next(true);
                    if (accountUsername !== "admin") {
                        if (currentPrivilege > 0 && accountPrivilege === undefined) return next(true);
                        if (currentPrivilege > 0 && currentPrivilege > accountPrivilege) return next(true);
                    }
                    res.status(401).send("Insufficient privilege level");
                    return next(false);
                });
            });
        });
    });
}

function hasFields(res, ...fields) {
    for (let field in fields) {
        field = fields[field];
        if (field === undefined) {
            res.status(400).send("Missing required fields");
            return false;
        }
    }
    return true;
}

module.exports = router;
