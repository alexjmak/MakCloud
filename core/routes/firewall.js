const createError = require('http-errors');
const crypto = require('crypto');
const express = require('express');
const os = require('os');

const firewall = require('../firewall');
const accountManager = require('../accountManager');
const authorization = require('../authorization');
const render = require('../render');

const router = express.Router();

router.use(async function(req, res, next) {
    const id = authorization.getID(req);
    const privilege = await accountManager.getInformation("privilege", "id", id);
    if (privilege === 100) next();
    else next(createError(403));
});

router.delete('/delete', async function(req, res, next) {
    const ip = req.body.ip;
    const list = req.body.list;
    if (hasFields(res, ip, list)) {
        try {
            await firewall.remove(ip, list);
            res.sendStatus(200);
        } catch {
            res.sendStatus(400);
        }
    }
});

router.get('/blacklist', function(req, res, next) {
    render('firewall', {list: 0}, req, res, next);
});

router.get('/blacklist/list', async function(req, res) {
    const list = await firewall.blacklist.get();
    let dictionary = {};
    for (let entry of list) {
        dictionary[entry.ip] = entry;
    }
    res.json(dictionary);
});

router.get('/whitelist', function(req, res, next) {
    render('firewall', {list: 1}, req, res, next);
});


router.get('/whitelist/list', async function(req, res) {
    const list = await firewall.whitelist.get();
    let dictionary = {};
    for (let entry of list) {
        dictionary[entry.ip] = entry;
    }
    res.json(dictionary);
});

router.patch('/end', async function(req, res, next) {
    const ip = req.body.ip;
    const list = req.body.list;
    const newEnd = parseInt(req.body.new_end);
    if (hasFields(res, ip, list, newEnd)) {
        try {
            await firewall.modifyEnd(ip, list, newEnd);
            res.sendStatus(200);
        } catch {
            res.sendStatus(400);
        }
    }
});

router.patch('/ip', async function(req, res, next) {
    const ip = req.body.ip;
    const list = req.body.list;
    const newIp = req.body.new_ip;
    if (hasFields(res, ip, list, newIp)) {
        try {
            await firewall.modifyIp(ip, list, newIp);
            res.sendStatus(200);
        } catch {
            res.sendStatus(400);
        }
    }
});

router.patch('/start', async function(req, res, next) {
    let ip = req.body.ip;
    let list = req.body.list;
    let newStart = parseInt(req.body.new_start);
    if (hasFields(res, ip, list, newStart)) {
        try {
            await firewall.modifyStart(ip, list, newStart);
            res.sendStatus(200);
        } catch {
            res.sendStatus(400);
        }
    }
});

router.put('/new', async function(req, res) {
    const ip = req.body.ip;
    const list = req.body.list;
    const start = parseInt(req.body.start);
    const length = parseInt(req.body.length);
    if (hasFields(res, ip, list, length)) {
        const hasIp = await firewall.contains(ip, list);
        if (!hasIp) {
            try {
                await firewall.add(ip, list, length);
                res.sendStatus(200);
            } catch {
                res.sendStatus(400);
            }
        } else {
            res.sendStatus(400);
        }
    }
});

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
