const createError = require('http-errors');
const crypto = require('crypto');
const express = require('express');
const os = require('os');

const accountManager = require('../accountManager');
const authorization = require('../authorization');
const render = require('../render');

const router = express.Router();

router.delete('/delete', function(req, res, next) {
    let id = req.body.id;

    if (!hasFields(res, id)) return;

    accountManager.getInformation("username", "id", id, function(username) {
        if (username === "admin") return res.status(403).send("Cannot delete the admin account");
        checkPrivilege(req, res, id, function(result) {
            if (!result) return;
            accountManager.deleteAccount(id, function(result) {
                if (result) {
                    res.send("Deleted account");
                } else {
                    res.status(404).send("Account not found");
                }
            });
        });
    });
});

router.get('/', function(req, res, next) {
    render('accounts', {recover: false}, req, res, next);

});

router.get('/list', function(req, res, next) {
    accountManager.getAccountsSummary(authorization.getID(req), function (result) {
        res.json(result);
    });
});

router.get('/list/hash', function(req, res, next) {
    accountManager.getAccountsSummary(authorization.getID(req), function (result) {
        res.send(crypto.createHash('md5').update(JSON.stringify(result)).digest('hex'));
    })
});

router.get('/search', function(req, res, next) {
    let query = req.query.q;
    if (query === undefined || query === "") {
        next(createError(400));
    } else {
        accountManager.searchAccounts(query, function (result) {
            res.json(result);
        });
    }
});

router.patch('/enabled', function(req, res, next) {
    let id = req.body.id;
    let enabled = req.body.enabled;

    if (!hasFields(res, id, enabled)) return;

    checkPrivilege(req, res, id, function(result) {
        if (!result) return;
        if (enabled) {
            accountManager.enableAccount(id, function (result) {
                if (result) {
                    res.send("Enabled account");
                } else {
                    res.status(404).send("Account not found");
                }
            });
        } else {
            if (Number(authorization.getID(req)) === id) {
                res.status(404).send("Cannot disable your own account");
                return;
            }
            accountManager.disableAccount(id, function (result) {
                if (result) {
                    res.send("Disabled account");
                } else {
                    res.status(404).send("Account not found");
                }
            });
        }

    });
});

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

router.patch('/privilege', function(req, res) {
    let id = req.body.id;
    let new_privilege = req.body.privilege;

    if (!hasFields(res, id, new_privilege)) return;
    checkPrivilege(req, res, id, function(result) {
        if (!result) return;
        if (new_privilege > 100 || new_privilege.toString().toUpperCase() === "ADMIN") new_privilege = 100;
        checkChangePrivilege(req, res, new_privilege, function(result) {
            if (!result) return;
            accountManager.updatePrivilege(id, new_privilege, function (result) {
                if (result) {
                    res.send("Updated account information")
                } else {
                    res.status(401).send("Failed to update privilege level");
                }
            });
        });

    });
});

router.patch('/username', function(req, res) {
    let id = req.body.id;
    let new_username = req.body.username;

    if (!hasFields(res, id, new_username)) return;
    checkPrivilege(req, res, id, function(result) {
        if (!result) return;
        accountManager.updateUsername(id, new_username, function (result) {
            if (result) {
                res.send("Updated account information")
            } else {
                res.status(401).send("Account already exists");
            }
        });
    });
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

router.use(function(req, res, next) {
    let id = authorization.getID(req);
    accountManager.getInformation("privilege", "id", id, function(privilege) {
        if (privilege === 100) next();
        else next(createError(403));
    });
});

router.delete('/deleted/delete', function(req, res, next) {
    let id = req.body.id;

    if (!hasFields(res, id)) return;

    accountManager.deleteDeletedAccount(id, function(result) {
        if (result) {
            res.send("Deleted account");
        } else {
            res.status(404).send("Account not found");
        }
    });

});

router.get('/deleted', function(req, res, next) {
    render('accounts', {deleted: true}, req, res, next);
});

router.get('/deleted/list', function(req, res, next) {
    accountManager.getDeletedAccountsSummary(authorization.getID(req), function (result) {
        res.json(result);
    });
});


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
