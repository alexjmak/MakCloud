const createError = require('http-errors');
const crypto = require('crypto');
const express = require('express');

const accountManager = require('../accountManager');
const authorization = require('../authorization');
const localeManager = require("../localeManager");
const render = require('../render');

const router = express.Router();

router.delete('/delete', async function (req, res, next) {
    let id = req.body.id;

    if (!hasFields(req, res, id)) return res.status(400);

    try {
        const username = await accountManager.getInformation("username", "id", id);
        if (username === "admin") return res.status(403);
        const privilegeCheck = checkPrivilege(req, res, id);
        if (!privilegeCheck) return;
        await accountManager.deleteAccount(id);
        res.sendStatus(200);
    } catch {
        res.status(404).send(locale.account_not_found);
    }

});

router.get('/', function (req, res, next) {
    render('accounts', {recover: false}, req, res, next);

});

router.get('/list', async function (req, res, next) {
    let result = await accountManager.getAccountsSummary(authorization.getID(req));
    await res.json(result);
});

router.get('/list/hash', async function (req, res, next) {
    const result = await accountManager.getAccountsSummary(authorization.getID(req));
    res.send(crypto.createHash('md5').update(JSON.stringify(result)).digest('hex'));
});

router.get('/search', async function (req, res, next) {
    let query = req.query.q;
    if (query === undefined || query === "") {
        next(createError(400));
    } else {
        const result = await accountManager.searchAccounts(query);
        await res.json(result);
    }
});

router.patch('/enabled', async function (req, res, next) {
    let id = req.body.id;
    let enabled = req.body.enabled;

    if (!hasFields(req, res, id, enabled)) return res.status(400);

    const privilegeCheck = await checkPrivilege(req, res, id);
    if (!privilegeCheck) return;
    if (enabled) {
        try {
            await accountManager.enableAccount(id);
            res.sendStatus(200);
        } catch {
            res.status(404).send(locale.account_not_found);
        }
    } else {
        if (authorization.getID(req) === id) {
            res.sendStatus(403);
            return;
        }
        try {
            await accountManager.disableAccount(id);
            res.sendStatus(200);
        } catch {
            res.status(404).send(locale.account_not_found);
        }
    }
});

router.patch('/password', async function (req, res, next) {
    let id = req.body.id;
    let new_password = req.body.password;

    if (!hasFields(req, res, id, new_password)) return res.status(400);
    const privilegeCheck = await checkPrivilege(req, res, id);
    if (!privilegeCheck) return;
    try {
        await accountManager.updatePassword(id, new_password);
        res.sendStatus(200);
    } catch {
        res.status(401).send(locale.cant_update_password);
    }
});

router.patch('/privilege', async function (req, res) {
    let id = req.body.id;
    let new_privilege = req.body.privilege;

    if (!hasFields(req, res, id, new_privilege)) return res.status(400);
    const privilegeCheck = await checkPrivilege(req, res, id);
    if (!privilegeCheck) return;
    if (new_privilege > 100 || new_privilege.toString().toUpperCase() === "ADMIN") new_privilege = 100;
    const canChangePrivilege = await checkChangePrivilege(req, res, new_privilege);
    if (!canChangePrivilege) return res.status(401);
    try {
        await accountManager.updatePrivilege(id, new_privilege);
        res.sendStatus(200);
    } catch {
        res.status(401).send(locale.cant_update_privilege);
    }
});

router.patch('/username', async function (req, res) {
    let id = req.body.id;
    let new_username = req.body.username;

    if (!hasFields(req, res, id, new_username)) return res.status(400);
    const privilegeCheck = await checkPrivilege(req, res, id);
    if (!privilegeCheck) return;
    try {
        await accountManager.updateUsername(id, new_username);
        res.sendStatus(200);
    } catch {
        res.status(401).send(locale.account_already_exists);
    }

});

router.put('/new', async function (req, res) {
    let username = req.body.username;
    let password = req.body.password;
    let privilege = req.body.privilege;

    const locale = localeManager.get(req);
    if (!hasFields(req, res, username, password)) return res.send(400);
    if (username === "admin") return res.status(401).send(locale.insufficient_privilege);
    if (privilege === undefined) privilege = 0;
    else if (privilege > 100 || privilege.toString().toUpperCase() === "ADMIN") privilege = 100;
    const canChangePrivilege = await checkChangePrivilege(req, res, privilege);
    if (!canChangePrivilege) return;
    try {
        await accountManager.newAccount(username, password, privilege);
        res.sendStatus(200);
    } catch {
        res.status(409).send(locale.account_already_exists);
    }
});

router.use(async function (req, res, next) {
    let id = authorization.getID(req);
    const privilege = await accountManager.getInformation("privilege", "id", id);
    if (privilege === 100) next();
    else next(createError(403));
});

router.delete('/deleted/delete', async function (req, res, next) {
    let id = req.body.id;

    if (!hasFields(req, res, id)) return res.send(400);

    try {
        await accountManager.deleteDeletedAccount(id);
        res.sendStatus(200);
    } catch {
        res.status(404).send(locale.account_not_found);
    }
});

router.get('/deleted', function (req, res, next) {
    render('accounts', {deleted: true}, req, res, next);
});

router.get('/deleted/list', async function (req, res, next) {
    const result = await accountManager.getDeletedAccountsSummary(authorization.getID(req));
    await res.json(result);
});

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
