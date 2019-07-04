const express = require('express');
const os = require('os');
const crypto = require('crypto');

const authorization = require('../authorization');
const accountManager = require('../accountManager');

const router = express.Router();

router.get('/', function(req, res) {
    accountManager.getInformation("username", "id", authorization.getTokenSubject(req), function(username) {
        res.render('accounts', {username: username, hostname: os.hostname()});
    });
});

router.get('/list', function(req, res) {
    accountManager.getAccountsSummary(function (result) {
        res.json(result);
    });
});

router.get('/list/hash', function(req, res) {
    accountManager.getAccountsSummary(function (result) {
        res.send(crypto.createHash('md5').update(JSON.stringify(result)).digest('hex'));
    })
});

router.post('/new', function(req, res) {
    let username = req.body.username;
    let password = req.body.password;

    if (!checkRequiredFields(res, username, password)) return;
    if (username === "admin")  return res.status(401).send("Insufficient privilege level");

    checkPrivilege(req, res, undefined, function(result) {
        if (!result) return;
        accountManager.newAccount(username, password, 0, function(result) {
            if (result) {
                res.send("Created account: " + username);
            } else {
                res.status(401).send("Account already exists");
            }
        });
    });
});

router.post('/delete', function(req, res) {
    let id = parseInt(req.body.id, 10);

    if (!checkRequiredFields(res, id)) return;

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

router.post('/enable', function(req, res) {
    let id = parseInt(req.body.id, 10);

    if (!checkRequiredFields(res, id)) return;

    checkPrivilege(req, res, id, function(result) {
        if (!result) return;
        accountManager.enableAccount(id, function (result) {
            if (result) {
                res.send("Enabled account");
            } else {
                res.status(404).send("Account not found");
            }
        });
    });
});

router.post('/disable', function(req, res) {
    let id = parseInt(req.body.id, 10);

    if (!checkRequiredFields(res, id)) return;

    checkPrivilege(req, res, id, function(result) {
        if (!result) return;
        accountManager.disableAccount(id, function (result) {
            if (result) {
                res.send("Disabled account");
            } else {
                res.status(404).send("Account not found");
            }
        });
    });
});

router.post('/update', function(req, res) {
    let id = parseInt(req.body.id, 10);
    let new_username = req.body.new_username;
    let new_password = req.body.new_password;

    if (!checkRequiredFields(res, id)) return;

    checkPrivilege(req, res, id, function(result) {
        if (!result) return;
        if (new_username !== undefined && new_password === undefined) {
            accountManager.updateUsername(id, new_username, function (result) {
                if (result) {
                    res.send("Updated account information")
                } else {
                    res.status(401).send("Account already exists");
                }
            });
        } else if (new_username === undefined && new_password !== undefined) {
            accountManager.updatePassword(id, new_password, function (result) {
                if (result) {
                    res.send("Updated account information")
                } else {
                    res.status(401).send("Failed to update password");
                }
            });
        } else if (new_username !== undefined && new_password !== undefined) {
            accountManager.updateUsername(id, new_username, function (updateUsernameResult) {
                accountManager.updatePassword(id, new_password, function (updatePasswordResult) {
                    if (updateUsernameResult && updatePasswordResult) {
                        res.send("Updated account information")
                    } else {
                        res.status(401).send("Failed to update username and/or password");
                    }
                });
            });
        } else {
            res.status(404).send("Missing required fields");
        }
    });
});

function checkRequiredFields(res, ...fields) {
    for (let field in fields) {
        if (field === undefined) {
            res.status(404).send("Missing required fields");
            return false;
        }
    }
    return true;
}

function checkPrivilege(req, res, accountID, next) {
    let currentID = authorization.getTokenSubject(req);
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

module.exports = router;
