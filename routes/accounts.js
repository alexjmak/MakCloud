const createError = require('http-errors');
const crypto = require('crypto');
const express = require('express');
const log = require('../core/log');

const accountManager = require('../accountManager');
const authorization = require('../authorization');
const localeManager = require('../core/localeManager');
const accounts = require("../core/routes/accounts");

const router = express.Router();

router.get('/list', async function (req, res, next) {
    let result = await accountManager.getAccountsSummary(authorization.getID(req));
    await res.json(result);
});

router.patch('/encrypted', async function(req, res, next) {
    const id = req.body.id;
    const encrypted = req.body.encrypted;
    const password = req.body.password;

    const locale = localeManager.get(req);
    if (!hasFields(res, id, encrypted, password)) return;
    const privilegeCheck = await checkPrivilege(req, res, id);
    if (!privilegeCheck) return;
    const result = await authorization.checkPassword(id, password);
    if (result !== authorization.LOGIN.FAIL) {
        if (encrypted) {
            try {
                const decryptedKey = await accountManager.encryptAccount(id, password);
                if (id === authorization.getID(req)) {
                    req.session.encryptionKey = decryptedKey;
                }
                res.send("Encrypted account");
            } catch (err) {
                log.write(err);
                res.status(500).send("Encryption Error");
            }

        } else {
            try {
                await accountManager.decryptAccount(id, password);
                if (id === authorization.getID(req)) {
                    req.session.encryptionKey = undefined;
                    res.clearCookie("encryptionSession");
                }
                res.send("Decrypted account");
            } catch (err) {
                log.write(err);
                res.status(500).send("Decryption Error");
            }
        }
    } else {
        res.status(403).send(locale.incorrect_password);
    }
});

router.patch('/password', async function(req, res, next) {
    const id = req.body.id;
    const new_password = req.body.password;
    const old_password = req.body.old_password;

    const locale = localeManager.get(req);
    if (!hasFields(res, id, new_password)) return;

    const encrypted = await accountManager.getInformation("encryptKey", "id", id);
    if (encrypted) {
        if (!hasFields(res, old_password)) return;
        const result = await authorization.checkPassword(id, old_password);
        if (result === authorization.LOGIN.FAIL) {
            return res.status(403).send(locale.incorrect_password);
        }
    }
    const privilegeCheck = await checkPrivilege(req, res, id);
    if (!privilegeCheck) return;
    try {
        await accountManager.updatePassword(id, new_password);
        res.send("Updated account information")
    } catch {
        res.status(401).send("Failed to update password");
    }
});

router.put('/new', async function(req, res) {
    let username = req.body.username;
    let password = req.body.password;
    let privilege = req.body.privilege;
    let encrypted = req.body.encrypted;

    const locale = localeManager.get(req);
    if (!hasFields(res, username, password)) return;
    if (username === "admin")  return res.status(401).send("Insufficient privilege level");

    const privilegeCheck = await checkPrivilege(req, res, undefined);
    if (!privilegeCheck) return;
    if (encrypted === undefined) encrypted = false;
    if (privilege === undefined) privilege = 0;
    else if (privilege > 100 || privilege.toString().toUpperCase() === "ADMIN") privilege = 100;
    encrypted = encrypted === "true" || encrypted === true;
    const canChangePrivilege = await checkChangePrivilege(req, res, privilege);
    if (!canChangePrivilege) return;
    try {
        await accountManager.newAccount(username, password, privilege, encrypted);
        res.send("Created account: " + username);
    } catch (err) {
        res.status(409).send("Account already exists");
    }
});

router.use(accounts)

async function checkChangePrivilege(req, res, new_privilege) {
    const locale = localeManager.get(req);
    if (isNaN(new_privilege) || new_privilege < 0) {
        res.status(401).send(locale.invalid_privilege);
        return false;
    }

    const currentPrivilege = await accountManager.getInformation("privilege", "id", authorization.getID(req));
    const currentUsername = await accountManager.getInformation("username", "id", authorization.getID(req));
    if (currentUsername !== "admin" && currentPrivilege <= new_privilege) {
        res.status(401).send("Insufficient privilege level");
        return false;
    }
    return true;
}

async function checkPrivilege(req, res, accountID) {
    const currentID = authorization.getID(req);
    const currentUsername = await accountManager.getInformation("username", "id", currentID);
    const currentPrivilege = await accountManager.getInformation("privilege", "id", currentID);
    if (currentUsername === "admin") return true;
    if (accountID) {
        const accountUsername = await accountManager.getInformation("username", "id", accountID);
        const accountPrivilege = await accountManager.getInformation("privilege", "id", accountID);
        if (currentID === accountID) return true;
        if (accountUsername !== "admin") {
            if (currentPrivilege > 0 && accountPrivilege === undefined) return true;
            if (currentPrivilege > 0 && currentPrivilege > accountPrivilege) return true;
        }
    }
    res.status(401).send("Insufficient privilege level");
    return false;

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
