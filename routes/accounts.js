const createError = require('http-errors');
const crypto = require('crypto');
const express = require('express');
const os = require('os');

const accountManager = require('../accountManager');
const authorization = require('../authorization');

const router = express.Router();

router.get('/', function(req, res) {
    accountManager.getInformation("username", "id", authorization.getLoginTokenAudience(req), function(username) {
        res.render('accounts', {username: username, hostname: os.hostname(), recover: false});
    });
});

router.get('/recover', function(req, res) {
    accountManager.getInformation("username", "id", authorization.getLoginTokenAudience(req), function(username) {
        res.render('accounts', {username: username, hostname: os.hostname(), recover: true});
    });
});

router.get('/recover/list', function(req, res) {
    accountManager.getDeletedAccountsSummary(authorization.getLoginTokenAudience(req), function (result) {
        res.json(result);
    });
});

router.get('/list', function(req, res) {
    accountManager.getAccountsSummary(authorization.getLoginTokenAudience(req), function (result) {
        res.json(result);
    });
});

router.get('/list/hash', function(req, res) {
    accountManager.getAccountsSummary(authorization.getLoginTokenAudience(req), function (result) {
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

router.put('/new', function(req, res) {
    let username = req.body.username;
    let password = req.body.password;
    let privilege = req.body.privilege;
    let encrypted = req.body.encrypted;

    if (!checkRequiredFields(res, username, password)) return;
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
                    res.status(401).send("Account already exists");
                }
            });
        });
    });
});

router.delete('/delete', function(req, res) {
    let id = parseInt(req.body.id);

    if (!checkRequiredFields(res, id)) return;

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

router.patch('/recover', function(req, res) {
    //todo
});

router.patch('/encrypted', function(req, res) {
    let id = parseInt(req.body.id);
    let encrypted = req.body.encrypted;
    let password = req.body.password;

    if (!checkRequiredFields(res, id, encrypted, password)) return;

    checkPrivilege(req, res, id, function(result) {
        if (!result) return;
        authorization.checkPassword(id, password, function(result) {
            if (result !== 1) {
                if (encrypted) {
                    accountManager.encryptAccount(id, password,function (result) {
                        if (result) {
                            res.send("Encrypted account");
                        } else {
                            res.status(404).send("Account not found");
                        }
                    });
                } else {
                    accountManager.decryptAccount(id, function (result) {
                        if (result) {
                            res.send("Decrypted account");
                        } else {
                            res.status(404).send("Account not found");
                        }
                    });
                }
            } else {
                res.status(403).send("Incorrect Password");
            }
        })

    });
});


router.patch('/enabled', function(req, res) {
    let id = parseInt(req.body.id);
    let enabled = req.body.enabled;

    if (!checkRequiredFields(res, id, enabled)) return;

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
            if (Number(authorization.getLoginTokenAudience(req)) === id) {
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

router.patch('/username', function(req, res) {
    let id = parseInt(req.body.id);
    let new_username = req.body.username;

    if (!checkRequiredFields(res, id, new_username)) return;
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

router.patch('/password', function(req, res) {
    let id = parseInt(req.body.id);
    let new_password = req.body.password;
    if (!checkRequiredFields(res, id, new_password)) return;
    checkPrivilege(req, res, id, function(result) {
        if (!result) return;
        accountManager.updatePassword(id, new_password, function (result) {
            if (result) {
                res.send("Updated account information")
            } else {
                res.status(401).send("Failed to update password");
            }
        });

    });
});

router.patch('/privilege', function(req, res) {
    let id = parseInt(req.body.id);
    let new_privilege = req.body.privilege;

    if (!checkRequiredFields(res, id, new_privilege)) return;
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

function checkRequiredFields(res, ...fields) {
    for (let field in fields) {
        field = fields[field];
        if (field === undefined) {
            res.status(404).send("Missing required fields");
            return false;
        }
    }
    return true;
}

function checkPrivilege(req, res, accountID, next) {
    let currentID = authorization.getLoginTokenAudience(req);
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

function checkChangePrivilege(req, res, new_privilege, next) {
    if (isNaN(new_privilege) || new_privilege < 0) {
        res.status(401).send("Privilege level must be a positive number");
        return next(false);
    }

    accountManager.getInformation("privilege", "id", authorization.getLoginTokenAudience(req), function(currentPrivilege) {
        accountManager.getInformation("username", "id", authorization.getLoginTokenAudience(req), function (currentUsername) {
            if (currentUsername !== "admin" && currentPrivilege <= new_privilege) {
                res.status(401).send("Insufficient privilege level");
                return next(false);
            }
            return next(true);
        });
    });
}

module.exports = router;
