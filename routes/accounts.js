const createError = require('http-errors');
const crypto = require('crypto');
const express = require('express');
const log = require('../core/log');

const accountManager = require('../accountManager');
const authorization = require('../authorization');
const localeManager = require('../core/localeManager');
const accounts = require("../core/routes/accounts");
const encryptionManager = require("../encryptionManager");

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
    if (!hasFields(req, res, id, encrypted, password)) return;
    const privilegeCheck = await checkPrivilege(req, res, id);
    if (!privilegeCheck) return;
    const result = await authorization.checkPassword(id, password);
    if (result !== authorization.LOGIN.FAIL) {
        if (encrypted) {
            try {
                const decryptedKey = await accountManager.encryptAccount(id, password);
                if (id === authorization.getID(req)) {
                    req.session.encryptionKey = decryptedKey;
                    encryptionManager.setEncryptionEnabledCookie(res);
                }
                res.send(locale.encrypted_account);
            } catch (err) {
                log.write(err);
                res.status(500).send(locale.encryption_error);
            }

        } else {
            try {
                await accountManager.decryptAccount(id, password);
                if (id === authorization.getID(req)) {
                    req.session.encryptionKey = undefined;
                    res.clearCookie("encryptionSession");
                    res.clearCookie("encryptionTimeout");
                }
                res.send(locale.decrypted_account);
            } catch (err) {
                log.write(err);
                res.status(500).send(locale.decryption_error);
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
    if (!hasFields(req, res, id, new_password)) return;

    const encrypted = await accountManager.getInformation("encryptKey", "id", id);
    if (encrypted) {
        if (!hasFields(req, res, old_password)) return;
        const result = await authorization.checkPassword(id, old_password);
        if (result === authorization.LOGIN.FAIL) {
            return res.status(403).send(locale.incorrect_password);
        }
    }
    const privilegeCheck = await checkPrivilege(req, res, id);
    if (!privilegeCheck) return;
    try {
        await accountManager.updatePassword(id, new_password);
        res.sendStatus(200);
    } catch {
        res.status(401).send(locale.cant_update_password);
    }
});

router.put('/new', async function(req, res) {
    let username = req.body.username;
    let password = req.body.password;
    let privilege = req.body.privilege;
    let encrypted = req.body.encrypted;

    const locale = localeManager.get(req);
    if (!hasFields(req, res, username, password)) return;
    if (username === "admin")  return res.status(401).send(locale.insufficient_privilege);

    if (encrypted === undefined) encrypted = false;
    if (privilege === undefined) privilege = 0;
    else if (privilege > 100 || privilege.toString().toUpperCase() === "ADMIN") privilege = 100;
    encrypted = encrypted === "true" || encrypted === true;
    const canChangePrivilege = await checkChangePrivilege(req, res, privilege);
    if (!canChangePrivilege) return;
    try {
        await accountManager.newAccount(username, password, privilege, encrypted);
        res.sendStatus(200);
    } catch (err) {
        res.status(409).send(locale.account_already_exists);
    }
});

router.use(accounts)

async function checkChangePrivilege(req, res, new_privilege) {
    const locale = localeManager.get(req);
    if (isNaN(new_privilege) || new_privilege < 0) {
        res.status(401).send(locale.invalid_privilege);
        return false;
    }
    const currentID = authorization.getID(req);
    const currentPrivilege = await accountManager.getInformation("privilege", "id", currentID);
    const currentUsername = await accountManager.getInformation("username", "id", currentID);
    if (currentUsername !== "admin" && currentPrivilege <= new_privilege) {
        res.status(401).send(locale.insufficient_privilege);
        return false;
    }
    return true;
}

async function checkPrivilege(req, res, accountID) {
    const locale = localeManager.get(req);
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
    res.status(401).send(locale.insufficient_privilege);
    return false;

}

function hasFields(req, res, ...fields) {
    const locale = localeManager.get(req);
    for (let field in fields) {
        field = fields[field];
        if (field === undefined) {
            res.status(400).send(locale.missing_fields);
            return false;
        }
    }
    return true;
}


module.exports = router;
